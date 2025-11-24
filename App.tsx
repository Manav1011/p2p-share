import React, { useState, useEffect } from 'react';
import { useWebRTC } from './hooks/useWebRTC';
import { ChatArea } from './components/ChatArea';
import { InputArea } from './components/InputArea';
import { QRModal } from './components/QRModal';
import { parseMarkdown } from './utils/markdown';
import { QrCode, Radio, Activity, ShieldCheck, ShieldAlert } from 'lucide-react';

const App: React.FC = () => {
  const { 
    myPeerId, 
    connectionStatus, 
    connectedPeerId, 
    messages, 
    connectToPeer, 
    sendText, 
    sendFile,
    acceptFileTransfer,
    saveFileToDisk 
  } = useWebRTC();

  const [showQR, setShowQR] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = React.useRef(0);

  useEffect(() => {
      // Auto-hide QR on connection
      if (connectionStatus === 'connected') {
          setShowQR(false);
      }
  }, [connectionStatus]);

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

  return (
    <div 
        className="h-full w-full flex flex-col items-center bg-app-bg text-[#e0e0e0] relative scanlines"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
    >
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
      <div className="w-full max-w-5xl h-full flex flex-col gap-0 border-x border-white/5 bg-black/40 shadow-2xl relative">
        
        {/* Tactical Header / HUD */}
        <div className="shrink-0 bg-[#151515] border-b border-white/10 p-0 flex flex-col relative overflow-hidden">
            {/* Top decorative line */}
            <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-app-accent to-transparent opacity-50"></div>
            
            <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-app-accent text-black font-bold px-2 py-0.5 text-xs tracking-widest uppercase">
                        EPISODE 1
                    </div>
                    <h1 className="text-white text-lg font-bold tracking-tight uppercase">
                        P2P Share <span className="text-gray-500 font-normal mx-2">//</span> SECURE UPLINK
                    </h1>
                </div>

                <div className="flex items-center gap-6 text-xs font-mono">
                    <div className="hidden sm:flex flex-col items-end">
                        <span className="text-gray-500 uppercase tracking-wider text-[10px]">Your Call Sign</span>
                        <span className="text-app-accent">{myPeerId || 'INITIALIZING...'}</span>
                    </div>

                    <div className="h-8 w-px bg-white/10 hidden sm:block"></div>

                    <div className="flex flex-col items-end min-w-[100px]">
                        <span className="text-gray-500 uppercase tracking-wider text-[10px]">Link Status</span>
                        {connectionStatus === 'connected' ? (
                             <div className="flex items-center gap-2 text-green-500">
                                 <Activity size={12} className="animate-pulse" />
                                 <span>ONLINE</span>
                             </div>
                        ) : (
                             <div className="flex items-center gap-2 text-red-500">
                                 <Radio size={12} />
                                 <span>OFFLINE</span>
                             </div>
                        )}
                    </div>
                    
                    <button 
                        onClick={() => setShowQR(true)}
                        className="bg-white/5 hover:bg-app-accent hover:text-black border border-white/10 text-gray-300 p-2 transition-all duration-200 group"
                        title="Open Connection Protocol"
                    >
                        <QrCode size={18} />
                    </button>
                </div>
            </div>

            {/* Sub-header / Status Bar */}
            <div className="bg-black/40 border-t border-white/5 px-4 py-1 flex justify-between items-center text-[10px] uppercase tracking-widest text-gray-500 font-mono">
                <div className="flex gap-4">
                   <span>Encrypted: {connectionStatus === 'connected' ? <ShieldCheck size={10} className="inline text-app-accent mb-0.5"/> : <ShieldAlert size={10} className="inline mb-0.5"/>}</span>
                   {connectedPeerId && <span>Target: {connectedPeerId}</span>}
                </div>
                <div>SYS.VER.2.0.4</div>
            </div>
        </div>

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