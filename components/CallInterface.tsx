
import React, { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2, User } from 'lucide-react';

interface CallInterfaceProps {
    incomingCall: any | null;
    isCalling: boolean;
    activeCall: any | null;
    remoteStream: MediaStream | null;
    localStream: MediaStream | null;
    onAnswer: () => void;
    onReject: () => void;
    onEnd: () => void;
}

export const CallInterface: React.FC<CallInterfaceProps> = ({
    incomingCall,
    isCalling,
    activeCall,
    remoteStream,
    localStream,
    onAnswer,
    onReject,
    onEnd
}) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [muted, setMuted] = useState(false);
    const [duration, setDuration] = useState(0);

    // Handle remote audio stream
    useEffect(() => {
        if (remoteStream && audioRef.current) {
            audioRef.current.srcObject = remoteStream;
            audioRef.current.play().catch(e => console.error("Error playing audio:", e));
        }
    }, [remoteStream]);

    // Duration timer
    useEffect(() => {
        let interval: any;
        if (activeCall) {
            interval = setInterval(() => {
                setDuration(prev => prev + 1);
            }, 1000);
        } else {
            setDuration(0);
        }
        return () => clearInterval(interval);
    }, [activeCall]);

    // Handle Mute
    const toggleMute = () => {
        if (localStream) {
            localStream.getAudioTracks().forEach(track => {
                track.enabled = !track.enabled;
            });
            setMuted(!muted);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // 1. Incoming Call Overlay
    if (incomingCall) {
        return (
            <div className="absolute top-28 left-1/2 -translate-x-1/2 z-[60] w-72 bg-black/90 border border-app-accent shadow-[0_0_30px_rgba(255,101,0,0.3)] p-4 animate-in slide-in-from-top-4 fade-in duration-300">
                <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                        <div className="absolute inset-0 bg-app-accent rounded-full animate-ping opacity-75"></div>
                        <div className="bg-app-accent text-black p-3 rounded-full relative z-10">
                            <Phone size={24} className="animate-pulse" />
                        </div>
                    </div>
                    <div className="text-center">
                        <h3 className="text-white font-bold uppercase tracking-wider">Incoming Call</h3>
                        <p className="text-app-accent text-xs font-mono mt-1">SECURE LINE REQUEST</p>
                    </div>
                    <div className="flex gap-4 w-full">
                        <button 
                            onClick={onReject}
                            className="flex-1 bg-red-900/50 hover:bg-red-600 border border-red-500 text-white py-2 rounded-sm text-xs uppercase font-bold tracking-wider transition-colors"
                        >
                            Decline
                        </button>
                        <button 
                            onClick={onAnswer}
                            className="flex-1 bg-green-900/50 hover:bg-green-600 border border-green-500 text-white py-2 rounded-sm text-xs uppercase font-bold tracking-wider transition-colors"
                        >
                            Accept
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // 2. Outgoing Call Overlay
    if (isCalling) {
        return (
            <div className="absolute top-28 left-1/2 -translate-x-1/2 z-[60] w-72 bg-black/90 border border-white/20 p-4">
                <div className="flex flex-col items-center gap-4">
                    <div className="bg-white/10 p-3 rounded-full animate-pulse">
                        <Phone size={24} className="text-white" />
                    </div>
                    <div className="text-center">
                        <h3 className="text-white font-bold uppercase tracking-wider">Dialing...</h3>
                        <p className="text-gray-400 text-xs font-mono mt-1">ESTABLISHING HANDSHAKE</p>
                    </div>
                    <button 
                        onClick={onEnd}
                        className="w-full bg-red-900/50 hover:bg-red-600 border border-red-500 text-white py-2 rounded-sm text-xs uppercase font-bold tracking-wider transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    // 3. Active Call Bar (Inserted in flow, not absolute)
    if (activeCall) {
        return (
            <div className="w-full shrink-0 z-40 bg-[#121212] border-b border-app-accent/30 py-3 px-4 flex justify-between items-center shadow-lg animate-in slide-in-from-top-2 fade-in duration-300">
                {/* Hidden Audio Element */}
                <audio ref={audioRef} autoPlay />

                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 bg-app-accent/20 rounded-full">
                        <Volume2 size={16} className="text-app-accent animate-pulse" />
                    </div>
                    <div>
                        <div className="text-app-accent text-xs font-bold uppercase tracking-wider">Voice Active</div>
                        <div className="text-gray-400 text-[10px] font-mono">{formatTime(duration)}</div>
                    </div>
                </div>

                {/* Waveform Visualization (Fake CSS animation) */}
                <div className="hidden sm:flex items-center gap-0.5 h-4 mx-4">
                    {[...Array(10)].map((_, i) => (
                        <div 
                            key={i} 
                            className="w-1 bg-app-accent/50 animate-[scan_1s_ease-in-out_infinite]"
                            style={{ 
                                height: `${Math.random() * 100}%`,
                                animationDelay: `${i * 0.1}s` 
                            }} 
                        />
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        onClick={toggleMute}
                        className={`p-2 rounded-full border transition-all ${
                            muted 
                                ? 'bg-red-500/20 border-red-500 text-red-500' 
                                : 'bg-white/5 border-white/20 text-gray-300 hover:text-white'
                        }`}
                        title={muted ? "Unmute" : "Mute"}
                    >
                        {muted ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                    
                    <button 
                        onClick={onEnd}
                        className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-full border border-red-500 transition-colors shadow-[0_0_10px_rgba(220,38,38,0.5)]"
                        title="End Call"
                    >
                        <PhoneOff size={16} />
                    </button>
                </div>
            </div>
        );
    }

    return null;
};
