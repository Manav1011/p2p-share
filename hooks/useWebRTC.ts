import { useEffect, useRef, useState, useCallback } from 'react';
import Peer, { DataConnection, MediaConnection } from 'peerjs';
import { Message, FileMetadata, FileChunkData, TextData, FileMetaData } from '../types';

const CHUNK_SIZE = 64 * 1024; // 64KB - Stable, avoids fragmentation
const MAX_BUFFERED_AMOUNT = 4 * 1024 * 1024; // 4MB - Avoids congestion stalls
const BACKPRESSURE_RESUME_THRESHOLD = 2 * 1024 * 1024; // 2MB
const UI_UPDATE_INTERVAL = 1000;

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

    const peerRef = useRef<Peer | null>(null);
    const connRef = useRef<DataConnection | null>(null);

    // File Transfer Refs
    const fileReceivers = useRef<Map<string, any>>(new Map());

    const addMessage = useCallback((msg: Message) => {
        setMessages(prev => [...prev, msg]);
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

    useEffect(() => {
        const initPeer = async () => {
            const randomId = Math.random().toString(36).substring(2, 6);
            const peer = new Peer(randomId, {
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

            peer.on('open', (id) => {
                setMyPeerId(id);
                addSystemMessage(`Your ID: ${id}`);
            });

            peer.on('connection', (conn) => {
                const isMain = conn.label !== 'file-transfer';

                if (isMain) {
                    connRef.current = conn;
                    setConnectionStatus('connected');
                    setConnectedPeerId(conn.peer);
                    addSystemMessage(`Connected to peer: ${conn.peer}`);
                    setupConnection(conn, true);
                } else {
                    setupConnection(conn, false);
                }
            });

            peer.on('call', (call) => {
                setIncomingCall(call);
            });

            peer.on('error', (err) => {
                console.error('Peer error:', err.type, err);
                if (err.type === 'peer-unavailable') {
                    addSystemMessage(`Peer ${connectedPeerId} not found.`);
                }
                if (err.type === 'disconnected') {
                    peer.reconnect();
                }
                setConnectionStatus('disconnected');
                addSystemMessage(`Error: ${err.type}`);
            });

            peer.on('disconnected', () => {
                setConnectionStatus('disconnected');
                // Attempt to reconnect to signaling server if not destroyed
                if (peer && !peer.destroyed) {
                    peer.reconnect();
                }
            });

            peerRef.current = peer;
        };

        initPeer();

        return () => {
            endCall();
            peerRef.current?.destroy();
        };
    }, []);

    const setupConnection = (conn: DataConnection, isMain: boolean = true) => {
        conn.on('data', (data: any) => {
            if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
                handleBinaryChunk(data);
                return;
            }

            if (data.type === 'text') {
                addMessage({
                    id: Math.random().toString(36),
                    type: 'text',
                    content: data.content,
                    formatted: data.formatted,
                    sender: 'peer',
                    timestamp: Date.now()
                });
            } else if (data.type === 'file-meta') {
                handleFileMeta(data);
            } else if (data.type === 'file-chunk') {
                handleFileChunk(data);
            }
        });

        conn.on('close', () => {
            if (isMain) {
                setConnectionStatus('disconnected');
                setConnectedPeerId('');
                addSystemMessage('Peer disconnected');
                connRef.current = null;
                endCall();
            }
        });

        conn.on('error', (err) => {
            // Suppress trivial errors on close
            if (err.message?.includes('Connection is not open')) return;
            if (isMain) {
                addSystemMessage(`Connection error: ${err.message}`);
            } else {
                console.error(`Side-channel error: ${err.message}`);
            }
        });
    };

    const handleBinaryChunk = (data: ArrayBuffer | Uint8Array) => {
        const buffer = data instanceof Uint8Array ? data.buffer : data;
        const array = new Uint8Array(buffer); // Zero-copy view
        const view = new DataView(buffer);

        // Parse Header
        const idLen = array[0];
        const idBytes = array.subarray(1, 1 + idLen); // subarray is faster than slice
        const id = new TextDecoder().decode(idBytes);

        const offset = Number(view.getBigUint64(1 + idLen));

        const headerSize = 1 + idLen + 8;
        const chunk = array.subarray(headerSize);

        handleFileChunk({
            id,
            offset,
            chunk,
            type: 'file-chunk',
            size: 0
        });
    };

    const connectToPeer = (peerId: string) => {
        if (!peerRef.current) return;

        // Close existing connection if any
        if (connRef.current) {
            connRef.current.close();
        }

        setConnectionStatus('connecting');
        addSystemMessage(`Connecting to ${peerId}...`);

        const conn = peerRef.current.connect(peerId, {
            reliable: true,
            serialization: 'binary'
        });
        connRef.current = conn;

        conn.on('open', () => {
            setConnectionStatus('connected');
            setConnectedPeerId(peerId);
            setupConnection(conn);
            addSystemMessage(`Connected to ${peerId}`);
        });

        conn.on('error', (err) => {
            setConnectionStatus('disconnected');
            addSystemMessage(`Failed to connect: ${err.message}`);
        });
    };

    // --- Voice Call Logic ---

    const startCall = async () => {
        if (!connectedPeerId || !peerRef.current) return;

        try {
            setIsCalling(true);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setLocalStream(stream);

            const call = peerRef.current.call(connectedPeerId, stream);
            setupCallEvents(call);
        } catch (err: any) {
            console.error("Failed to get local stream", err);
            setIsCalling(false);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                addSystemMessage("❌ Microphone permission denied. Please allow microphone access to call.");
            } else {
                addSystemMessage("❌ Error accessing microphone. Check your settings.");
            }
        }
    };

    const answerCall = async () => {
        if (!incomingCall) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setLocalStream(stream);

            incomingCall.answer(stream);
            setupCallEvents(incomingCall);
            setIncomingCall(null);
        } catch (err: any) {
            console.error("Failed to answer call", err);
            setIncomingCall(null);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                addSystemMessage("❌ Microphone permission denied. Cannot answer call.");
            } else {
                addSystemMessage("❌ Error accessing microphone.");
            }
        }
    };

    const rejectCall = () => {
        if (incomingCall) {
            incomingCall.close();
            setIncomingCall(null);
        }
    };

    const endCall = () => {
        if (activeCall) {
            activeCall.close();
        }
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }

        setActiveCall(null);
        setRemoteStream(null);
        setLocalStream(null);
        setIsCalling(false);
        setIncomingCall(null);
    };

    const setupCallEvents = (call: MediaConnection) => {
        setActiveCall(call);
        setIsCalling(false);

        call.on('stream', (stream) => {
            setRemoteStream(stream);
        });

        call.on('close', () => {
            endCall();
            addSystemMessage("Call ended");
        });

        call.on('error', (err) => {
            console.error("Call error", err);
            endCall();
        });
    };

    // --- End Voice Call Logic ---

    const sendText = (text: string, formatted: string) => {
        if (!connRef.current?.open) {
            addSystemMessage('Not connected');
            return;
        }

        connRef.current.send({
            type: 'text',
            content: text,
            formatted
        } as TextData);

        addMessage({
            id: Math.random().toString(36),
            type: 'text',
            content: text,
            formatted,
            sender: 'me',
            timestamp: Date.now()
        });
    };

    const activeTransferRefs = useRef<Map<string, {
        file: File,
        offset: number,
        idBytes: Uint8Array,
        lastUiUpdate: number
    }>>(new Map());
    const isLoopRunning = useRef(false);

    const runTransferLoop = useCallback(async () => {
        if (isLoopRunning.current) return;
        isLoopRunning.current = true;

        while (activeTransferRefs.current.size > 0) {
            const conn = connRef.current;
            if (!conn || !conn.open) {
                activeTransferRefs.current.forEach((_, id) => {
                    setMessages(prev => prev.map(m => m.id === id ? { ...m, progress: -1 } : m));
                });
                activeTransferRefs.current.clear();
                break;
            }

            const dataChannel = conn.dataChannel as any;
            if (dataChannel && dataChannel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
                await new Promise<void>(resolve => {
                    const onLow = () => {
                        dataChannel.removeEventListener('bufferedamountlow', onLow);
                        resolve();
                    };
                    dataChannel.addEventListener('bufferedamountlow', onLow);
                    setTimeout(resolve, 50);
                });
                continue;
            }

            // Round-robin one chunk for each file
            for (const [id, state] of Array.from(activeTransferRefs.current.entries())) {
                try {
                    const chunkDataBuffer = await state.file.slice(state.offset, state.offset + CHUNK_SIZE).arrayBuffer();
                    const chunkData = new Uint8Array(chunkDataBuffer);

                    const headerSize = 1 + state.idBytes.length + 8;
                    const packet = new Uint8Array(headerSize + chunkData.length);
                    const view = new DataView(packet.buffer);

                    packet[0] = state.idBytes.length;
                    packet.set(state.idBytes, 1);
                    view.setBigUint64(1 + state.idBytes.length, BigInt(state.offset));
                    packet.set(chunkData, headerSize);

                    conn.send(packet);
                    state.offset += chunkData.length;

                    const now = Date.now();
                    if (now - state.lastUiUpdate > UI_UPDATE_INTERVAL || state.offset >= state.file.size) {
                        state.lastUiUpdate = now;
                        const progress = Math.min(100, (state.offset / state.file.size) * 100);
                        setMessages(prev => prev.map(m => m.id === id ? { ...m, progress } : m));
                    }

                    if (state.offset >= state.file.size) {
                        activeTransferRefs.current.delete(id);
                    }
                } catch (e) {
                    console.error("Transfer error for", id, e);
                    activeTransferRefs.current.delete(id);
                    setMessages(prev => prev.map(m => m.id === id ? { ...m, progress: -1 } : m));
                }

                if (dataChannel && dataChannel.bufferedAmount > MAX_BUFFERED_AMOUNT) break;
            }

            await new Promise(resolve => setTimeout(resolve, 10)); // Yield to CPU
        }
        isLoopRunning.current = false;
    }, [setMessages]);

    const sendFile = useCallback((file: File) => {
        if (!connRef.current?.open) {
            addSystemMessage('Not connected');
            return;
        }

        const fileId = Math.random().toString(36).substring(2);
        const idBytes = new TextEncoder().encode(fileId);

        addMessage({
            id: fileId,
            type: 'file',
            content: { id: fileId, name: file.name, size: file.size },
            sender: 'me',
            timestamp: Date.now(),
            progress: 0
        });

        connRef.current.send({
            type: 'file-meta',
            id: fileId,
            name: file.name,
            size: file.size,
            chunkSize: CHUNK_SIZE,
            mimeType: file.type || getFallbackMimeType(file.name)
        } as FileMetaData);

        activeTransferRefs.current.set(fileId, {
            file,
            offset: 0,
            idBytes,
            lastUiUpdate: Date.now()
        });

        runTransferLoop();
    }, [addMessage, runTransferLoop, addSystemMessage]);

    const handleFileMeta = (data: FileMetaData) => {
        addSystemMessage(`Receiving ${data.name}...`);

        const receiver = {
            id: data.id,
            name: data.name,
            size: data.size,
            mimeType: data.mimeType || getFallbackMimeType(data.name),
            receivedBytes: 0,
            chunks: new Map<number, Uint8Array>(),
            receivedChunks: new Set<number>(),
            lastUpdate: 0,
            lastProgress: 0,
            writable: null,
            fileHandle: null,
            writeBuffer: [] as Uint8Array[],
            writeBufferSize: 0,
            writeQueue: Promise.resolve(), // Serialization queue for writes
        };

        fileReceivers.current.set(data.id, receiver);

        const supportsFSA = 'showSaveFilePicker' in window;

        addMessage({
            id: data.id,
            type: 'file',
            content: { id: data.id, name: data.name, size: data.size },
            sender: 'peer',
            timestamp: Date.now(),
            progress: 0,
            needsAcceptance: supportsFSA
        });
    };

    const acceptFileTransfer = async (fileId: string) => {
        const receiver = fileReceivers.current.get(fileId);
        if (!receiver) return;

        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: receiver.name
            });
            const writable = await handle.createWritable();

            receiver.fileHandle = handle;
            receiver.writable = writable;

            // Flush any chunks received before acceptance
            if (receiver.chunks.size > 0) {
                const sortedChunks = Array.from(receiver.chunks.entries())
                    .sort((a: any, b: any) => a[0] - b[0])
                    .map((entry: any) => entry[1]);

                const blob = new Blob(sortedChunks);
                await writable.write(blob);
                receiver.chunks.clear();
            }

            setMessages(prev => prev.map(m => m.id === fileId ? { ...m, needsAcceptance: false } : m));

            if (receiver.receivedBytes >= receiver.size) {
                finishFileReceive(receiver);
            }

        } catch (err: any) {
            setMessages(prev => prev.map(m => m.id === fileId ? { ...m, needsAcceptance: false } : m));

            if (err.name === 'SecurityError' || (err.message && err.message.includes('Cross origin'))) {
                addSystemMessage("⚠️ Direct Disk Access is blocked in this preview window. Using RAM instead.");
            } else if (err.name !== 'AbortError') {
                console.error('File save init failed:', err);
                addSystemMessage(`Stream setup failed: ${err.message}. Buffering in RAM.`);
            }
        }
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

    const flushWriteBuffer = async (receiver: any) => {
        if (!receiver.writable || receiver.writeBuffer.length === 0) return;

        // 1. Swap buffer immediately to avoid race conditions with incoming chunks
        const chunksToWrite = [...receiver.writeBuffer];
        receiver.writeBuffer = [];
        receiver.writeBufferSize = 0;

        // 2. Write asynchronously without blocking
        receiver.writeQueue = receiver.writeQueue.then(async () => {
            try {
                const blob = new Blob(chunksToWrite);
                await receiver.writable.write(blob);
            } catch (err) {
                console.error("Error writing to disk", err);
                addSystemMessage("Error writing to disk - file may be corrupt");
            }
        }).catch(err => {
            console.error("Write queue error:", err);
        });
    };

    const handleFileChunk = (data: FileChunkData) => {
        const receiver = fileReceivers.current.get(data.id);
        if (!receiver) return;

        if (!receiver.receivedChunks.has(data.offset)) {
            receiver.receivedChunks.add(data.offset);

            if (receiver.writable) {
                // Buffer writes to disk for speed
                receiver.writeBuffer.push(data.chunk);
                receiver.writeBufferSize += data.chunk.byteLength;

                // Flush asynchronously - don't await to avoid blocking
                if (receiver.writeBufferSize >= MAX_BUFFERED_AMOUNT) {
                    flushWriteBuffer(receiver);
                }
            } else {
                // Buffer in RAM (Fallback)
                receiver.chunks.set(data.offset, data.chunk);
            }

            receiver.receivedBytes += data.chunk.byteLength;
        }

        const now = Date.now();
        const currentProgress = (receiver.receivedBytes / receiver.size) * 100;

        // Only update UI if enough time passed AND progress changed significantly OR transfer complete
        if (receiver.receivedBytes >= receiver.size || (now - receiver.lastUpdate > UI_UPDATE_INTERVAL && currentProgress - (receiver.lastProgress || 0) >= 1)) {
            receiver.lastUpdate = now;
            receiver.lastProgress = currentProgress;

            // Use requestAnimationFrame to defer UI update and not block data reception
            requestAnimationFrame(() => {
                setMessages(prev => prev.map(m => m.id === data.id ? { ...m, progress: currentProgress } : m));
            });
        }

        if (receiver.receivedBytes >= receiver.size) {
            finishFileReceive(receiver);
        }
    };

    const finishFileReceive = async (receiver: any) => {
        let url;

        if (receiver.writable) {
            try {
                // Flush remaining buffer
                await flushWriteBuffer(receiver);
                // Wait for all writes to finish
                await receiver.writeQueue;

                await receiver.writable.close();
                const file = await receiver.fileHandle.getFile();
                const type = receiver.mimeType || getFallbackMimeType(receiver.name);
                const typedFile = file.slice(0, file.size, type);
                url = URL.createObjectURL(typedFile);
                addSystemMessage(`Saved ${receiver.name} to disk`);
            } catch (e) {
                console.error("Error closing file stream", e);
            }
        } else {
            const sortedChunks = Array.from(receiver.chunks.entries())
                .sort((a: any, b: any) => a[0] - b[0])
                .map((entry: any) => entry[1]);

            const type = receiver.mimeType || getFallbackMimeType(receiver.name);
            const blob = new Blob(sortedChunks, { type });
            url = URL.createObjectURL(blob);
            addSystemMessage(`Received ${receiver.name}`);
        }

        setMessages(prev => prev.map(m => m.id === receiver.id ? {
            ...m,
            progress: 100,
            blobUrl: url,
            needsAcceptance: false
        } : m));

        fileReceivers.current.delete(receiver.id);
    };

    return {
        myPeerId,
        connectionStatus,
        connectedPeerId,
        messages,
        connectToPeer,
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
