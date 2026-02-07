
import React, { useState, useEffect } from 'react';
import { useWebRTC } from './hooks/useWebRTC';
import { ChatArea } from './components/ChatArea';
import { InputArea } from './components/InputArea';
import { QRModal } from './components/QRModal';
import { CallInterface } from './components/CallInterface';
import { parseMarkdown } from './utils/markdown';
import { QrCode, Radio, Activity, ShieldCheck, ShieldAlert, Phone, Download, Users, Smartphone } from 'lucide-react';
import { LoginOverlay } from './components/LoginOverlay';
import { UserList } from './components/UserList';

const App: React.FC = () => {

    const [username, setUsername] = useState<string | null>(() => {
        return localStorage.getItem('p2p_username');
    });
    const [showLogin, setShowLogin] = useState(false);
    const [showUserList, setShowUserList] = useState(false);

    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isInstallable, setIsInstallable] = useState(false);

    useEffect(() => {
        const handler = (e: any) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setIsInstallable(true);
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setIsInstallable(false);
        }
    };

    const {
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
        // Call props
        startCall,
        answerCall,
        rejectCall,
        endCall,
        incomingCall,
        isCalling,
        activeCall,
        remoteStream,
        localStream
    } = useWebRTC(username);

    // Heartbeat Effect
    useEffect(() => {
        if (!username) return;

        const ping = async () => {
            try {
                const apiBase = import.meta.env.VITE_API_TARGET || '';
                const res = await fetch(`${apiBase}/ping?username=${username}`, { method: 'POST' });
                if (res.status === 404) {
                    console.warn("Session expired or invalid, logging out");
                    setUsername(null);
                    localStorage.removeItem('p2p_username');
                }
            } catch (e) {
                console.error("Ping failed", e);
            }
        };

        ping(); // Initial
        const interval = setInterval(ping, 30000); // 30s heartbeat
        return () => clearInterval(interval);
    }, [username]);

    const [showQR, setShowQR] = useState(false); // Default false now
    const [isDragging, setIsDragging] = useState(false);
    const dragCounter = React.useRef(0);

    // ... (keep drag handlers same) ...
    useEffect(() => {
        // Auto-hide QR only on initial connection transition
        if (connectionStatus === 'connected' && showQR) {
            setShowQR(false);
        }
    }, [connectionStatus, showQR]); // Added showQR to dependencies to ensure it reacts to its own state

    useEffect(() => {
        const handleGlobalPaste = (e: ClipboardEvent) => {
            if (e.clipboardData && e.clipboardData.items) {
                const items = Array.from(e.clipboardData.items) as DataTransferItem[];
                const files = items
                    .filter(item => item.kind === 'file')
                    .map(item => item.getAsFile())
                    .filter((file): file is File => file !== null);

                if (files.length > 0) {
                    if (connectionStatus !== 'connected') {
                        alert("Please connect to a peer first.");
                        return;
                    }
                    files.forEach(file => sendFile(file));
                }
            }
        };

        window.addEventListener('paste', handleGlobalPaste);
        return () => window.removeEventListener('paste', handleGlobalPaste);
    }, [connectionStatus, sendFile]);

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current--;
        if (dragCounter.current === 0) {
            setIsDragging(false);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        dragCounter.current = 0;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            if (connectionStatus !== 'connected') {
                alert("Please connect to a peer first.");
                return;
            }
            Array.from(e.dataTransfer.files).forEach((file: File) => {
                sendFile(file);
            });
        }
    };

    const downloadAllFiles = () => {
        const fileMessages = messages.filter(m => m.type === 'file' && m.blobUrl);
        if (fileMessages.length === 0) {
            alert("No files available for download yet.");
            return;
        }

        fileMessages.forEach((msg, index) => {
            // Slight delay to prevent browser download blocking
            setTimeout(() => {
                const link = document.createElement('a');
                link.href = msg.blobUrl!;
                link.download = (msg.content as any).name;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }, index * 200);
        });
    };

    return (
        <div
            className="h-full w-full flex flex-col items-center bg-app-bg text-[#e0e0e0] relative scanlines"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {showLogin && (
                <LoginOverlay
                    onLogin={(name) => {
                        setUsername(name);
                        localStorage.setItem('p2p_username', name);
                        setShowLogin(false);
                    }}
                    onClose={() => setShowLogin(false)}
                />
            )}

            {showUserList && username && (
                <UserList
                    currentUsername={username}
                    onConnect={(target) => {
                        connectToPeer(target);
                        setShowUserList(false);
                    }}
                    onClose={() => setShowUserList(false)}
                />
            )}

            {/* Tactical Drag Overlay */}
            {isDragging && (
                <div className="absolute inset-0 z-[60] bg-app-accent/10 border-[8px] border-app-accent backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none">
                    <div className="text-app-accent text-6xl font-black tracking-tighter uppercase animate-pulse">
                        Data Uplink
                    </div>
                    <div className="text-app-accent font-mono mt-4 tracking-widest border-t border-b border-app-accent py-2 px-8">
                        INITIATE FILE TRANSFER PROTOCOL
                    </div>
                </div>
            )}

            {/* QR Modal */}
            {showQR && (
                <QRModal
                    peerId={myPeerId}
                    onConnect={connectToPeer}
                    onClose={() => setShowQR(false)}
                />
            )}

            {/* Main Container */}
            <div className={`w-full max-w-5xl h-full flex flex-col gap-0 border-x border-white/5 bg-black/40 shadow-2xl relative transition-opacity duration-500 opacity-100`}>

                {/* Tactical Header / HUD */}
                <div className="shrink-0 bg-[#151515] border-b border-white/10 p-0 flex flex-col relative overflow-hidden z-50">
                    {/* Top decorative line */}
                    <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-app-accent to-transparent opacity-50"></div>

                    <div className="p-3 sm:p-4 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
                            <div className="bg-app-accent text-black font-bold px-1.5 py-0.5 text-[10px] sm:text-xs tracking-widest uppercase shrink-0">
                                EPISODE 2
                            </div>
                            <h1 className="text-white text-sm sm:text-lg font-bold tracking-tight uppercase truncate">
                                P2P Share <span className="hidden sm:inline text-gray-500 font-normal mx-2">//</span> <span className="hidden sm:inline">SECURE UPLINK</span>
                            </h1>
                        </div>

                        <div className="flex items-center gap-3 sm:gap-6 text-xs font-mono shrink-0">
                            <div className="flex flex-col items-end">
                                <span className="hidden sm:block text-gray-500 uppercase tracking-wider text-[10px]">Your Call Sign</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-app-accent">{myPeerId || 'INITIALIZING...'}</span>
                                    {!username ? (
                                        <button
                                            onClick={() => setShowLogin(true)}
                                            className="text-[10px] bg-white/10 hover:bg-white/20 px-1.5 py-0.5 rounded text-gray-300 uppercase transition-colors"
                                        >
                                            Login
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => {
                                                if (confirm("Disconnect and Logout?")) {
                                                    setUsername(null);
                                                    localStorage.removeItem('p2p_username');
                                                    // Optional: Reload to force clean state
                                                    // window.location.reload(); 
                                                }
                                            }}
                                            className="text-[10px] bg-red-900/30 hover:bg-red-900/50 px-1.5 py-0.5 rounded text-red-400 border border-red-900/50 uppercase transition-colors"
                                        >
                                            Logout
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="h-8 w-px bg-white/10 hidden sm:block"></div>

                            <div className="flex flex-col items-end justify-center min-w-[60px] sm:min-w-[100px]">
                                <span className="hidden sm:block text-gray-500 uppercase tracking-wider text-[10px]">Link Status</span>
                                {connectionStatus === 'connected' ? (
                                    <div className="flex items-center gap-1.5 sm:gap-2 text-green-500">
                                        <Activity size={12} className="animate-pulse" />
                                        <span className="font-bold">ONLINE</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1.5 sm:gap-2 text-red-500">
                                        <Radio size={12} />
                                        <span className="font-bold">OFFLINE</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-1.5 sm:gap-2">
                                {/* Connect Button */}
                                {connectionStatus !== 'connected' && (
                                        <button
                                            onClick={() => setShowUserList(true)}
                                            className="bg-app-accent/10 hover:bg-app-accent hover:text-black border border-app-accent/50 text-app-accent p-1.5 sm:p-2 transition-all duration-200 group rounded-sm animate-pulse"
                                            title="Scan for Peers"
                                        >
                                            <Users size={16} className="sm:w-[18px] sm:h-[18px]" />
                                        </button>
                                    )}
 
                                    {/* Install PWA Button */}
                                    {isInstallable && (
                                        <button
                                            onClick={handleInstallClick}
                                            className="bg-app-accent/20 hover:bg-app-accent hover:text-black border border-app-accent text-app-accent p-1.5 sm:p-2 transition-all duration-200 group rounded-sm flex items-center gap-2"
                                            title="Install as App"
                                        >
                                            <Smartphone size={16} className="sm:w-[18px] sm:h-[18px]" />
                                            <span className="hidden sm:inline text-[10px] font-bold">INSTALL</span>
                                        </button>
                                    )}

                                {/* Call Button */}
                                {connectionStatus === 'connected' && !activeCall && !isCalling && (
                                    <button
                                        onClick={startCall}
                                        className="bg-green-900/20 hover:bg-green-600 hover:text-white border border-green-900/50 text-green-500 p-1.5 sm:p-2 transition-all duration-200 group rounded-sm"
                                        title="Initiate Voice Link"
                                    >
                                        <Phone size={16} className="sm:w-[18px] sm:h-[18px]" />
                                    </button>
                                )}

                                {connectionStatus === 'connected' && (
                                    <button
                                        onClick={disconnectPeer}
                                        className="bg-red-900/20 hover:bg-red-600 hover:text-white border border-red-900/50 text-red-500 p-1.5 sm:p-2 transition-all duration-200 group rounded-sm"
                                        title="Disconnect Link"
                                    >
                                        <Radio size={16} className="sm:w-[18px] sm:h-[18px]" />
                                    </button>
                                )}

                                {connectionStatus === 'connected' && (
                                    <button
                                        onClick={downloadAllFiles}
                                        className="bg-white/5 hover:bg-app-accent hover:text-black border border-white/10 text-gray-300 p-1.5 sm:p-2 transition-all duration-200 group rounded-sm"
                                        title="Download All Received Files"
                                    >
                                        <Download size={16} className="sm:w-[18px] sm:h-[18px]" />
                                    </button>
                                )}

                                <button
                                    onClick={() => setShowQR(true)}
                                    className="bg-white/5 hover:bg-app-accent hover:text-black border border-white/10 text-gray-300 p-1.5 sm:p-2 transition-all duration-200 group rounded-sm"
                                    title="Open Connection Protocol"
                                >
                                    <QrCode size={16} className="sm:w-[18px] sm:h-[18px]" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Sub-header / Status Bar */}
                    <div className="bg-black/40 border-t border-white/5 px-4 py-1 flex justify-between items-center text-[10px] uppercase tracking-widest text-gray-500 font-mono">
                        <div className="flex gap-4 overflow-hidden">
                            <span className="shrink-0">Encrypted: {connectionStatus === 'connected' ? <ShieldCheck size={10} className="inline text-app-accent mb-0.5" /> : <ShieldAlert size={10} className="inline mb-0.5" />}</span>
                            {connectedPeerId && <span className="hidden sm:inline truncate">Target: {connectedPeerId}</span>}
                        </div>
                        <div className="shrink-0">SYS.VER.2.1.0</div>
                    </div>
                </div>

                {/* Call Interface Overlay */}
                <CallInterface
                    incomingCall={incomingCall}
                    isCalling={isCalling}
                    activeCall={activeCall}
                    remoteStream={remoteStream}
                    localStream={localStream}
                    onAnswer={answerCall}
                    onReject={rejectCall}
                    onEnd={endCall}
                />

                {/* Chat Area */}
                <ChatArea
                    messages={messages}
                    onAcceptFile={acceptFileTransfer}
                    onSaveToDisk={saveFileToDisk}
                />

                {/* Input Area */}
                <InputArea
                    onSend={sendText}
                    onFileUpload={sendFile}
                    parseMarkdown={parseMarkdown}
                />
            </div>
        </div>
    );
};

export default App;
