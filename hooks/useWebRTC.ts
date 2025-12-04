
import { useEffect, useRef, useState, useCallback } from 'react';
import Peer, { DataConnection, MediaConnection } from 'peerjs';
import { Message, FileMetadata, FileChunkData, TextData, FileMetaData } from '../types';

const CHUNK_SIZE = 512 * 1024; // 512KB - Optimized for speed
const MAX_BUFFERED_AMOUNT = 16 * 1024 * 1024; // 16MB
const BACKPRESSURE_RESUME_THRESHOLD = 12 * 1024 * 1024; // 12MB - Resume at 75% capacity
const UI_UPDATE_INTERVAL = 1000; // 1s - Reduced UI updates for better performance

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
                connRef.current = conn;
                setConnectionStatus('connected');
                setConnectedPeerId(conn.peer);
                setupConnection(conn);
                addSystemMessage(`Connected to peer: ${conn.peer}`);
            });

            peer.on('call', (call) => {
                setIncomingCall(call);
            });

            peer.on('error', (err) => {
                console.error(err);
                addSystemMessage(`Error: ${err.type}`);
            });

            peer.on('disconnected', () => {
                 setConnectionStatus('disconnected');
            });

            peerRef.current = peer;
        };

        initPeer();

        return () => {
            endCall();
            peerRef.current?.destroy();
        };
    }, []);

    const setupConnection = (conn: DataConnection) => {
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
            setConnectionStatus('disconnected');
            setConnectedPeerId('');
            addSystemMessage('Peer disconnected');
            connRef.current = null;
            endCall();
        });

        conn.on('error', (err) => {
            // Suppress trivial errors on close
            if (err.message?.includes('Connection is not open')) return;
            addSystemMessage(`Connection error: ${err.message}`);
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

    const sendFile = async (file: File) => {
        if (!connRef.current?.open) return;
        const conn = connRef.current;
        const fileId = Math.random().toString(36).substring(2);
        
        addMessage({
            id: fileId,
            type: 'file',
            content: { id: fileId, name: file.name, size: file.size },
            sender: 'me',
            timestamp: Date.now(),
            progress: 0
        });

        conn.send({
            type: 'file-meta',
            id: fileId,
            name: file.name,
            size: file.size,
            chunkSize: CHUNK_SIZE,
            mimeType: file.type || getFallbackMimeType(file.name)
        } as FileMetaData);

        let offset = 0;
        let lastUiUpdate = 0;
        const dataChannel = conn.dataChannel as any;

        const idBytes = new TextEncoder().encode(fileId);
        
        try {
            if (dataChannel && 'bufferedAmountLowThreshold' in dataChannel) {
                dataChannel.bufferedAmountLowThreshold = CHUNK_SIZE * 2; 
            }
        } catch (e) { }

        // Helper to read chunk from file
        const readChunk = async (start: number): Promise<Uint8Array> => {
            const chunk = file.slice(start, start + CHUNK_SIZE);
            const buffer = await chunk.arrayBuffer();
            return new Uint8Array(buffer);
        };

        // Pipelining: Start reading the first chunk immediately
        let nextChunkPromise = readChunk(0);
        
        // Use ref for progress tracking to avoid excessive state updates
        const progressRef = { lastReported: 0 };

        try {
            while (offset < file.size) {
                // Check if connection died mid-transfer
                if (!conn.open) {
                    throw new Error("Connection closed during transfer");
                }

                // Backpressure: Wait if buffer is full
                if (dataChannel && dataChannel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
                    await new Promise<void>((resolve, reject) => {
                        const onLowBuffer = () => {
                            dataChannel.removeEventListener('bufferedamountlow', onLowBuffer);
                            resolve();
                        };
                        dataChannel.addEventListener('bufferedamountlow', onLowBuffer);
                        
                        // Failsafe: Poll and resume at 75% capacity for better throughput
                        const checkInterval = setInterval(() => {
                            if (!conn.open) {
                                clearInterval(checkInterval);
                                dataChannel.removeEventListener('bufferedamountlow', onLowBuffer);
                                reject(new Error("Connection closed"));
                                return;
                            }
                            if (dataChannel.bufferedAmount <= BACKPRESSURE_RESUME_THRESHOLD) {
                                dataChannel.removeEventListener('bufferedamountlow', onLowBuffer);
                                clearInterval(checkInterval);
                                resolve();
                            }
                        }, 50);
                    });
                }

                // Await the data we started reading in previous iteration (or init)
                const chunkData = await nextChunkPromise;

                // PIPELINE: Start reading the NEXT chunk immediately while we process the current one
                const nextOffset = offset + CHUNK_SIZE;
                if (nextOffset < file.size) {
                    nextChunkPromise = readChunk(nextOffset);
                }

                // Construct Binary Packet: [ID_LEN (1)][ID BYTES][OFFSET (8)][DATA]
                const headerSize = 1 + idBytes.length + 8;
                const packet = new Uint8Array(headerSize + chunkData.length);
                const view = new DataView(packet.buffer);

                packet[0] = idBytes.length;
                packet.set(idBytes, 1);
                view.setBigUint64(1 + idBytes.length, BigInt(offset));
                packet.set(chunkData, headerSize);

                // This can throw if connection is closed
                conn.send(packet);

                offset += chunkData.length;
                
                const now = Date.now();
                const currentProgress = Math.min(100, (offset / file.size) * 100);
                
                // Only update UI if enough time passed AND progress changed significantly
                if ((now - lastUiUpdate > UI_UPDATE_INTERVAL && currentProgress - progressRef.lastReported >= 1) || offset >= file.size) {
                    lastUiUpdate = now;
                    progressRef.lastReported = currentProgress;
                    
                    setMessages(prev => prev.map(m => m.id === fileId ? { ...m, progress: currentProgress } : m));
                }
            }
            
            // Ensure 100% is set at the end
            setMessages(prev => prev.map(m => m.id === fileId ? { ...m, progress: 100 } : m));
        } catch (e) {
            console.error("Transfer failed:", e);
            setMessages(prev => prev.map(m => m.id === fileId ? { ...m, progress: -1 } : m));
            addSystemMessage(`Transfer failed: ${file.name}`);
        }
    };

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
