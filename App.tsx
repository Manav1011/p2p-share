
import React, { useState, useEffect } from 'react';
import { useWebRTC } from './hooks/useWebRTC';
import { ChatArea } from './components/ChatArea';
import { InputArea } from './components/InputArea';
import { QRModal } from './components/QRModal';
import { CallInterface } from './components/CallInterface';
import { parseMarkdown } from './utils/markdown';
import { QrCode, Radio, Activity, ShieldCheck, ShieldAlert, Phone } from 'lucide-react';

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
        <div className="shrink-0 bg-[#151515] border-b border-white/10 p-0 flex flex-col relative overflow-hidden z-50">
            {/* Top decorative line */}
            <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-app-accent to-transparent opacity-50"></div>
            
            <div className="p-3 sm:p-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 sm:gap-3 overflow-hidden">
                    <div className="bg-app-accent text-black font-bold px-1.5 py-0.5 text-[10px] sm:text-xs tracking-widest uppercase shrink-0">
                        EPISODE 1
                    </div>
                    <h1 className="text-white text-sm sm:text-lg font-bold tracking-tight uppercase truncate">
                        P2P Share <span className="hidden sm:inline text-gray-500 font-normal mx-2">//</span> <span className="hidden sm:inline">SECURE UPLINK</span>
                    </h1>
                </div>

                <div className="flex items-center gap-3 sm:gap-6 text-xs font-mono shrink-0">
                    <div className="hidden sm:flex flex-col items-end">
                        <span className="text-gray-500 uppercase tracking-wider text-[10px]">Your Call Sign</span>
                        <span className="text-app-accent">{myPeerId || 'INITIALIZING...'}</span>
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
                   <span className="shrink-0">Encrypted: {connectionStatus === 'connected' ? <ShieldCheck size={10} className="inline text-app-accent mb-0.5"/> : <ShieldAlert size={10} className="inline mb-0.5"/>}</span>
                   {connectedPeerId && <span className="hidden sm:inline truncate">Target: {connectedPeerId}</span>}
                </div>
                <div className="shrink-0">SYS.VER.2.0.4</div>
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
