import { useEffect, useRef, useState, useCallback } from 'react';
import Peer, { DataConnection, MediaConnection } from 'peerjs';
import { Message, FileMetaData, TextData } from '../types';
import { parseMarkdown } from '../utils/markdown';

// Chunks are sent as raw ArrayBuffers over the RTCDataChannel. 192KB + header stays
// well under Chrome's 256KB per-message limit.
const CHUNK_SIZE = 192 * 1024;
const MAX_TEXT_LENGTH = CHUNK_SIZE;     // Text travels as one JSON message
const HIGH_WATER = 4 * 1024 * 1024;     // Pause sending when this much is queued in the channel
const LOW_WATER = 1 * 1024 * 1024;      // Resume once the channel drains to this level
const WRITE_BATCH = 8 * 1024 * 1024;    // Batch disk writes to cut per-write overhead
const DRAIN_RECHECK_MS = 200;           // Re-check connection state even if no drain event arrives
const UI_UPDATE_INTERVAL = 250;
const CONNECT_TIMEOUT_MS = 20000;

interface SendState {
    file: File;
    offset: number;
    idBytes: Uint8Array;
    lastUi: number;
}

interface Receiver {
    id: string;
    name: string;
    size: number;
    mimeType: string;
    received: number;
    seen: Set<number>;                       // offsets already accepted (dedupe)
    ram: Map<number, Uint8Array>;            // chunks held in memory until a disk sink exists
    handle: FileSystemFileHandle | null;
    writable: FileSystemWritableFileStream | null;
    pending: Uint8Array[];                   // chunks waiting to be batched to disk
    pendingBytes: number;
    queue: Promise<void>;                    // serialises disk writes
    lastUi: number;
    accepting: boolean;
    done: boolean;
    failed: boolean;
    result: Blob | null;                     // finished in-memory file, kept for a late "save to disk"
}

// Helper to guess MIME type if missing
const getFallbackMimeType = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'png': return 'image/png';
        case 'jpg': case 'jpeg': return 'image/jpeg';
        case 'gif': return 'image/gif';
        case 'webp': return 'image/webp';
        case 'svg': return 'image/svg+xml';
        case 'mp4': return 'video/mp4';
        case 'webm': return 'video/webm';
        case 'ogg': return 'video/ogg';
        case 'pdf': return 'application/pdf';
        case 'txt': return 'text/plain';
        case 'html': return 'text/html';
        case 'json': return 'application/json';
        case 'md': return 'text/markdown';
        default: return 'application/octet-stream';
    }
};

const micErrorMessage = (err: any, action: string) =>
    err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
        ? `❌ Microphone permission denied. Allow microphone access to ${action}.`
        : '❌ Error accessing microphone. Check your settings.';

// Resolves when the channel drains below LOW_WATER, or after a short timeout so the
// caller can re-check that the connection is still alive.
const waitForDrain = (dc: RTCDataChannel) => new Promise<void>(resolve => {
    let timer: ReturnType<typeof setTimeout>;
    const done = () => {
        dc.removeEventListener('bufferedamountlow', done);
        clearTimeout(timer);
        resolve();
    };
    timer = setTimeout(done, DRAIN_RECHECK_MS);
    dc.addEventListener('bufferedamountlow', done);
});

// Wire format for a file chunk: [idLen u8][id bytes][offset u64][data]
const encodeChunk = (idBytes: Uint8Array, offset: number, data: ArrayBuffer): ArrayBuffer => {
    const out = new Uint8Array(1 + idBytes.length + 8 + data.byteLength);
    out[0] = idBytes.length;
    out.set(idBytes, 1);
    new DataView(out.buffer).setBigUint64(1 + idBytes.length, BigInt(offset));
    out.set(new Uint8Array(data), 1 + idBytes.length + 8);
    return out.buffer;
};

const decodeChunk = (buf: ArrayBuffer) => {
    const bytes = new Uint8Array(buf);
    const idLen = bytes[0];
    const id = new TextDecoder().decode(bytes.subarray(1, 1 + idLen));
    const offset = Number(new DataView(buf).getBigUint64(1 + idLen));
    return { id, offset, chunk: bytes.subarray(1 + idLen + 8) };
};

export const useWebRTC = () => {
    const [myPeerId, setMyPeerId] = useState<string>('');
    const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
    const [messages, setMessages] = useState<Message[]>([]);
    const [connectedPeerId, setConnectedPeerId] = useState<string>('');

    // Call State
    const [incomingCall, setIncomingCall] = useState<MediaConnection | null>(null);
    const [activeCall, setActiveCall] = useState<MediaConnection | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [isCalling, setIsCalling] = useState(false);

    // Everything the long-lived event handlers touch lives in refs or stable setters,
    // so handlers captured by the one-time peer setup always see current state.
    const peerRef = useRef<Peer | null>(null);
    const connRef = useRef<DataConnection | null>(null);
    const myIdRef = useRef('');
    const retryCount = useRef(0);
    const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const localStreamRef = useRef<MediaStream | null>(null);
    const activeCallRef = useRef<MediaConnection | null>(null);
    const incomingCallRef = useRef<MediaConnection | null>(null);
    const callSeqRef = useRef(0);

    const sendsRef = useRef<Map<string, SendState>>(new Map());
    const receiversRef = useRef<Map<string, Receiver>>(new Map());
    const pumpRunning = useRef(false);

    const addMessage = useCallback((msg: Message) => {
        setMessages(prev => [...prev, msg]);
    }, []);

    const updateMessage = useCallback((id: string, patch: Partial<Message>) => {
        setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));
    }, []);

    const addSystemMessage = useCallback((text: string) => {
        addMessage({
            id: Math.random().toString(36),
            type: 'text',
            content: text,
            sender: 'system',
            timestamp: Date.now()
        });
    }, [addMessage]);

    const triggerLegacyDownload = (url: string, name: string) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    // --- Voice Call Logic ---

    const endCall = useCallback(() => {
        callSeqRef.current++; // invalidates any getUserMedia still in flight
        const call = activeCallRef.current;
        const incoming = incomingCallRef.current;
        activeCallRef.current = null;
        incomingCallRef.current = null;

        localStreamRef.current?.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;

        call?.close();
        incoming?.close();

        setActiveCall(null);
        setRemoteStream(null);
        setLocalStream(null);
        setIsCalling(false);
        setIncomingCall(null);

        if (call) addSystemMessage('Call ended');
    }, [addSystemMessage]);

    const setupCallEvents = (call: MediaConnection, awaitingAnswer: boolean) => {
        activeCallRef.current = call;
        if (!awaitingAnswer) {
            setActiveCall(call);
            setIsCalling(false);
        }

        call.on('stream', (stream) => {
            if (activeCallRef.current !== call) return;
            setRemoteStream(stream);
            setActiveCall(call);
            setIsCalling(false);
        });

        call.on('close', () => {
            if (activeCallRef.current === call) endCall();
        });

        call.on('error', (err) => {
            console.error('Call error', err);
            if (activeCallRef.current === call) endCall();
        });
    };

    const startCall = async () => {
        const peer = peerRef.current;
        const conn = connRef.current;
        if (!peer || !conn?.open || activeCallRef.current || incomingCallRef.current) return;

        const seq = ++callSeqRef.current;
        setIsCalling(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            if (seq !== callSeqRef.current || !connRef.current?.open) {
                // Cancelled or disconnected while the permission prompt was open
                stream.getTracks().forEach(track => track.stop());
                return;
            }
            localStreamRef.current = stream;
            setLocalStream(stream);

            const call = peer.call(conn.peer, stream);
            setupCallEvents(call, true);
        } catch (err: any) {
            console.error('Failed to get local stream', err);
            if (seq === callSeqRef.current) setIsCalling(false);
            addSystemMessage(micErrorMessage(err, 'call'));
        }
    };

    const answerCall = async () => {
        const incoming = incomingCallRef.current;
        if (!incoming) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            if (incomingCallRef.current !== incoming) {
                // Caller hung up or call was ended while the permission prompt was open
                stream.getTracks().forEach(track => track.stop());
                return;
            }
            incomingCallRef.current = null;
            setIncomingCall(null);

            localStreamRef.current = stream;
            setLocalStream(stream);
            incoming.answer(stream);
            setupCallEvents(incoming, false);
        } catch (err: any) {
            console.error('Failed to answer call', err);
            if (incomingCallRef.current === incoming) {
                incomingCallRef.current = null;
                setIncomingCall(null);
            }
            incoming.close();
            addSystemMessage(micErrorMessage(err, 'answer the call'));
        }
    };

    const rejectCall = () => {
        const incoming = incomingCallRef.current;
        incomingCallRef.current = null;
        setIncomingCall(null);
        incoming?.close();
    };

    // --- Transfer Helpers ---

    const failAllSends = () => {
        sendsRef.current.forEach((_, id) => updateMessage(id, { progress: -1 }));
        sendsRef.current.clear();
    };

    const failReceive = (r: Receiver, reason: string) => {
        if (r.done || r.failed) return;
        r.failed = true;
        receiversRef.current.delete(r.id);
        r.pending = [];
        r.pendingBytes = 0;
        r.ram.clear();
        r.writable?.abort().catch(() => { /* already closed */ });
        updateMessage(r.id, { progress: -1, needsAcceptance: false });
        addSystemMessage(`Transfer of ${r.name} failed: ${reason}`);
    };

    const failAllReceives = (reason: string) => {
        receiversRef.current.forEach(r => failReceive(r, reason));
    };

    // --- Connection Logic ---

    const handleConnectionLost = (reason: string) => {
        connRef.current = null;
        setConnectionStatus('disconnected');
        setConnectedPeerId('');
        addSystemMessage(reason);
        endCall();
        failAllSends();
        failAllReceives('connection lost');
    };

    const handleFileMeta = (meta: FileMetaData) => {
        if (receiversRef.current.has(meta.id)) return;

        const supportsFSA = 'showSaveFilePicker' in window;
        const r: Receiver = {
            id: meta.id,
            name: meta.name,
            size: meta.size,
            mimeType: meta.mimeType || getFallbackMimeType(meta.name),
            received: 0,
            seen: new Set(),
            ram: new Map(),
            handle: null,
            writable: null,
            pending: [],
            pendingBytes: 0,
            queue: Promise.resolve(),
            lastUi: 0,
            accepting: false,
            done: false,
            failed: false,
            result: null,
        };
        receiversRef.current.set(meta.id, r);

        addMessage({
            id: meta.id,
            type: 'file',
            content: { id: meta.id, name: meta.name, size: meta.size },
            sender: 'peer',
            timestamp: Date.now(),
            progress: 0,
            needsAcceptance: supportsFSA && meta.size > 0
        });
        addSystemMessage(`Receiving ${meta.name}...`);

        // Zero-byte files have no chunks, so they complete immediately
        if (meta.size === 0) finishReceive(r);
    };

    const flushWrites = (r: Receiver) => {
        if (!r.writable || r.pending.length === 0) return;
        const parts = r.pending;
        const writable = r.writable;
        r.pending = [];
        r.pendingBytes = 0;
        r.queue = r.queue
            .then(() => writable.write(new Blob(parts as BlobPart[])))
            .catch(err => {
                console.error('Disk write failed', err);
                failReceive(r, 'could not write to disk');
            });
    };

    const handleChunk = (id: string, offset: number, chunk: Uint8Array) => {
        const r = receiversRef.current.get(id);
        if (!r || r.done || r.failed || r.seen.has(offset)) return;

        r.seen.add(offset);
        r.received += chunk.byteLength;

        if (r.writable) {
            r.pending.push(chunk);
            r.pendingBytes += chunk.byteLength;
            if (r.pendingBytes >= WRITE_BATCH) flushWrites(r);
        } else {
            r.ram.set(offset, chunk);
        }

        if (r.received >= r.size) {
            finishReceive(r);
            return;
        }

        const now = Date.now();
        if (now - r.lastUi >= UI_UPDATE_INTERVAL) {
            r.lastUi = now;
            updateMessage(id, { progress: (r.received / r.size) * 100 });
        }
    };

    const finishReceive = async (r: Receiver) => {
        if (r.done || r.failed) return;
        r.done = true;

        let url: string;
        try {
            if (r.writable) {
                flushWrites(r);
                await r.queue;
                if (r.failed) return;
                await r.writable.close();
                r.writable = null;
                const file = await r.handle!.getFile();
                url = URL.createObjectURL(file.slice(0, file.size, r.mimeType));
                addSystemMessage(`Saved ${r.name} to disk`);
            } else {
                const parts = Array.from(r.ram.entries())
                    .sort((a, b) => a[0] - b[0])
                    .map(entry => entry[1]);
                const blob = new Blob(parts as BlobPart[], { type: r.mimeType });
                r.result = blob;
                r.ram.clear();
                url = URL.createObjectURL(blob);
                addSystemMessage(`Received ${r.name}`);
            }
        } catch (err) {
            console.error('Error finalising file', err);
            r.done = false;
            failReceive(r, 'could not finalise file');
            return;
        }

        receiversRef.current.delete(r.id);
        updateMessage(r.id, { progress: 100, blobUrl: url, needsAcceptance: false });
    };

    const acceptFileTransfer = async (fileId: string) => {
        const r = receiversRef.current.get(fileId) ?? null;
        if (!r || r.done || r.failed || r.writable || r.accepting) return;
        r.accepting = true;

        let handle: FileSystemFileHandle;
        let writable: FileSystemWritableFileStream;
        try {
            handle = await window.showSaveFilePicker({ suggestedName: r.name });
            writable = await handle.createWritable();
        } catch (err: any) {
            r.accepting = false;
            if (err?.name === 'AbortError') return; // user cancelled; button stays for another try
            console.error('Save location failed', err);
            updateMessage(fileId, { needsAcceptance: false });
            addSystemMessage(`Could not open a save location (${err?.message ?? err}). The file stays available for download.`);
            return;
        }
        r.accepting = false;

        if (r.failed) {
            await writable.abort().catch(() => { /* ignore */ });
            return;
        }

        if (r.done && r.result) {
            // Finished while the picker was open: write the kept copy
            try {
                await writable.write(r.result);
                await writable.close();
                addSystemMessage(`Saved ${r.name} to disk`);
            } catch (err) {
                console.error('Save failed', err);
                await writable.abort().catch(() => { /* ignore */ });
                addSystemMessage(`Could not save ${r.name} to disk`);
            }
            updateMessage(fileId, { needsAcceptance: false });
            return;
        }

        r.handle = handle;
        r.writable = writable;

        // Hand everything received so far to the disk stream in offset order. No chunk can
        // arrive between here and the flush, so ordering is preserved.
        const ramParts = Array.from(r.ram.entries())
            .sort((a, b) => a[0] - b[0])
            .map(entry => entry[1]);
        r.ram.clear();
        for (const part of ramParts) {
            r.pending.push(part);
            r.pendingBytes += part.byteLength;
        }
        flushWrites(r);
        updateMessage(fileId, { needsAcceptance: false });
    };

    const saveFileToDisk = async (blobUrl: string, fileName: string) => {
        if (!('showSaveFilePicker' in window)) {
            triggerLegacyDownload(blobUrl, fileName);
            return;
        }

        try {
            const response = await fetch(blobUrl);
            const blob = await response.blob();

            const handle = await window.showSaveFilePicker({
                suggestedName: fileName
            });

            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();

            addSystemMessage(`Saved ${fileName} to disk`);
        } catch (err: any) {
            if (err.name === 'AbortError') return;

            console.warn('FSA Save failed, falling back to legacy download:', err);

            if (err.name === 'SecurityError' || (err.message && err.message.includes('Cross origin'))) {
                addSystemMessage("⚠️ Save to Folder blocked in Preview. Downloading to default folder.");
            }
            triggerLegacyDownload(blobUrl, fileName);
        }
    };

    // Sends queued file chunks, pacing on the data channel's buffer rather than timers.
    const pumpSends = useCallback(async () => {
        if (pumpRunning.current) return;
        pumpRunning.current = true;

        try {
            while (sendsRef.current.size > 0) {
                const conn = connRef.current;
                if (!conn?.open) {
                    failAllSends();
                    break;
                }

                const dc = conn.dataChannel;
                dc.bufferedAmountLowThreshold = LOW_WATER;
                if (dc.bufferedAmount > HIGH_WATER) {
                    await waitForDrain(dc);
                    continue;
                }

                // Round-robin one chunk per active file
                for (const [id, st] of Array.from(sendsRef.current.entries())) {
                    if (dc.bufferedAmount > HIGH_WATER) break;

                    try {
                        const end = Math.min(st.offset + CHUNK_SIZE, st.file.size);
                        const data = await st.file.slice(st.offset, end).arrayBuffer();
                        // Connection dropped or transfer cancelled while reading
                        if (!conn.open || sendsRef.current.get(id) !== st) break;

                        conn.send(encodeChunk(st.idBytes, st.offset, data));
                        st.offset = end;
                    } catch (err) {
                        console.error('Transfer error for', id, err);
                        sendsRef.current.delete(id);
                        updateMessage(id, { progress: -1 });
                        continue;
                    }

                    if (st.offset >= st.file.size) {
                        sendsRef.current.delete(id);
                        updateMessage(id, { progress: 100 });
                    } else {
                        const now = Date.now();
                        if (now - st.lastUi >= UI_UPDATE_INTERVAL) {
                            st.lastUi = now;
                            updateMessage(id, { progress: (st.offset / st.file.size) * 100 });
                        }
                    }
                }
            }
        } finally {
            pumpRunning.current = false;
        }
    }, [updateMessage]);

    const handleData = (data: unknown) => {
        if (typeof data === 'string') {
            let msg: any;
            try {
                msg = JSON.parse(data);
            } catch {
                return;
            }
            if (msg?.type === 'text' && typeof msg.content === 'string') {
                const content: string = msg.content;
                addMessage({
                    id: Math.random().toString(36),
                    type: 'text',
                    content,
                    // Rendered locally from plain text, so a peer cannot inject HTML
                    formatted: parseMarkdown(content),
                    sender: 'peer',
                    timestamp: Date.now()
                });
            } else if (msg?.type === 'file-meta') {
                handleFileMeta(msg as FileMetaData);
            }
        } else if (data instanceof ArrayBuffer) {
            const { id, offset, chunk } = decodeChunk(data);
            handleChunk(id, offset, chunk);
        }
    };

    const setupConnection = (conn: DataConnection) => {
        conn.on('data', handleData);

        conn.on('close', () => {
            if (connRef.current === conn) handleConnectionLost('Peer disconnected');
        });

        conn.on('error', (err) => {
            if (connRef.current !== conn) return;
            if (err.message?.includes('Connection is not open')) return;
            if (!conn.open) {
                connRef.current = null;
                setConnectionStatus('disconnected');
                addSystemMessage(`Failed to connect: ${err.message}`);
                return;
            }
            addSystemMessage(`Connection error: ${err.message}`);
        });
    };

    const adoptConnection = (conn: DataConnection) => {
        connRef.current = conn;
        setupConnection(conn);

        const onReady = () => {
            if (connRef.current !== conn) return;
            setConnectionStatus('connected');
            setConnectedPeerId(conn.peer);
            addSystemMessage(`Connected to ${conn.peer}`);
        };
        if (conn.open) onReady();
        else conn.on('open', onReady);
    };

    const connectToPeer = (rawId: string) => {
        const peer = peerRef.current;
        const id = rawId.trim().toLowerCase(); // IDs are lowercase; the input may not be
        if (!peer || !id) return;

        if (id === myIdRef.current) {
            addSystemMessage("That's your own ID.");
            return;
        }

        // Tear down any existing link first, detaching it so its close handler doesn't
        // clear the new one
        const old = connRef.current;
        if (old) {
            connRef.current = null;
            old.close();
            endCall();
            failAllSends();
            failAllReceives('connection replaced');
        }

        setConnectionStatus('connecting');
        addSystemMessage(`Connecting to ${id}...`);

        const conn = peer.connect(id, { reliable: true, serialization: 'none' });
        const timeout = setTimeout(() => {
            if (connRef.current === conn && !conn.open) {
                connRef.current = null;
                setConnectionStatus('disconnected');
                addSystemMessage('Connection timed out');
                conn.close();
            }
        }, CONNECT_TIMEOUT_MS);
        conn.on('open', () => clearTimeout(timeout));

        adoptConnection(conn);
    };

    const disconnectPeer = () => {
        const conn = connRef.current;
        if (!conn) return;
        connRef.current = null;
        conn.close();
        setConnectionStatus('disconnected');
        setConnectedPeerId('');
        addSystemMessage('Disconnected manually');
        endCall();
        failAllSends();
        failAllReceives('disconnected');
    };

    const sendText = (text: string) => {
        const conn = connRef.current;
        if (!conn?.open) {
            addSystemMessage('Not connected');
            return;
        }
        if (text.length > MAX_TEXT_LENGTH) {
            addSystemMessage('Message too long to send.');
            return;
        }

        const payload: TextData = { type: 'text', content: text };
        try {
            conn.send(JSON.stringify(payload));
        } catch (err) {
            console.error('Send failed', err);
            addSystemMessage('Failed to send message.');
            return;
        }

        addMessage({
            id: Math.random().toString(36),
            type: 'text',
            content: text,
            formatted: parseMarkdown(text),
            sender: 'me',
            timestamp: Date.now()
        });
    };

    const sendFile = useCallback((file: File) => {
        const conn = connRef.current;
        if (!conn?.open) {
            addSystemMessage('Not connected');
            return;
        }

        const fileId = Math.random().toString(36).substring(2);
        addMessage({
            id: fileId,
            type: 'file',
            content: { id: fileId, name: file.name, size: file.size },
            sender: 'me',
            timestamp: Date.now(),
            progress: 0
        });

        const meta: FileMetaData = {
            type: 'file-meta',
            id: fileId,
            name: file.name,
            size: file.size,
            chunkSize: CHUNK_SIZE,
            mimeType: file.type || getFallbackMimeType(file.name)
        };
        try {
            conn.send(JSON.stringify(meta));
        } catch (err) {
            console.error('Send failed', err);
            updateMessage(fileId, { progress: -1 });
            return;
        }

        if (file.size === 0) {
            updateMessage(fileId, { progress: 100 });
            return;
        }

        sendsRef.current.set(fileId, {
            file,
            offset: 0,
            idBytes: new TextEncoder().encode(fileId),
            lastUi: 0
        });
        void pumpSends();
    }, [addMessage, addSystemMessage, updateMessage, pumpSends]);

    useEffect(() => {
        let disposed = false;

        const initPeer = () => {
            if (disposed) return;

            // GUEST MODE: Generate random ID
            const peerId = Math.random().toString(36).substring(2, 8);

            const peer = new Peer(peerId, {
                debug: 2,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:global.stun.twilio.com:3478' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                        { urls: 'stun:stun.services.mozilla.com' }
                    ]
                }
            });
            peerRef.current = peer;

            peer.on('open', (id) => {
                myIdRef.current = id;
                setMyPeerId(id);
                addSystemMessage(`Your ID: ${id}`);
                retryCount.current = 0;
            });

            peer.on('connection', (conn) => {
                // SINGLE CONNECTION GUARD
                if (connRef.current?.open) {
                    console.warn('Blocking incoming connection - Already connected');
                    conn.close();
                    return;
                }
                // Replace a pending outgoing attempt
                if (connRef.current) {
                    const pending = connRef.current;
                    connRef.current = null;
                    pending.close();
                }
                adoptConnection(conn);
            });

            peer.on('call', (call) => {
                if (activeCallRef.current || incomingCallRef.current) {
                    call.close(); // already busy
                    return;
                }
                incomingCallRef.current = call;
                setIncomingCall(call);
                call.on('close', () => {
                    if (incomingCallRef.current === call) {
                        incomingCallRef.current = null;
                        setIncomingCall(null);
                    }
                });
            });

            peer.on('error', (err) => {
                console.error('Peer error:', err.type, err);

                if (err.type === 'peer-unavailable') {
                    addSystemMessage(`Peer not found.`);
                    return;
                }

                if (err.type === 'unavailable-id') {
                    if (retryCount.current < 5) {
                        retryCount.current += 1;
                        const delay = 2000 * retryCount.current;
                        addSystemMessage(`⚠️ ID Active. Retrying cleanup (${retryCount.current}/5) in ${delay / 1000}s...`);

                        retryTimer.current = setTimeout(() => {
                            retryTimer.current = null;
                            peer.destroy();
                            initPeer();
                        }, delay);
                    } else {
                        addSystemMessage('❌ ID Locked. Please close other tabs or wait 30s.');
                        setConnectionStatus('disconnected');
                    }
                    return; // Early return to avoid generic error
                }

                if (err.type === 'disconnected') {
                    peer.reconnect();
                }

                if (!connRef.current?.open) setConnectionStatus('disconnected');
                addSystemMessage(`Error: ${err.type}`);
            });
        };

        const timer = setTimeout(initPeer, 100); // Slight delay to allow cleanup

        const handleUnload = () => {
            endCall();
            peerRef.current?.destroy();
        };
        window.addEventListener('beforeunload', handleUnload);

        return () => {
            disposed = true;
            clearTimeout(timer);
            if (retryTimer.current) clearTimeout(retryTimer.current);
            window.removeEventListener('beforeunload', handleUnload);
            endCall();
            peerRef.current?.destroy();
            peerRef.current = null;
        };
    }, [addSystemMessage, endCall]);

    return {
        myPeerId,
        connectionStatus,
        connectedPeerId,
        messages,
        connectToPeer,
        disconnectPeer,
        sendText,
        sendFile,
        acceptFileTransfer,
        saveFileToDisk,
        startCall,
        answerCall,
        rejectCall,
        endCall,
        incomingCall,
        isCalling,
        activeCall,
        remoteStream,
        localStream
    };
};
