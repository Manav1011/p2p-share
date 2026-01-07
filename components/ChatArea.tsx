
import React, { useEffect, useRef } from 'react';
import { Message, FileMetadata } from '../types';
import { Download, File as FileIcon, Eye, HardDrive, Save, CornerDownLeft, Terminal, AlertTriangle } from 'lucide-react';

interface ChatAreaProps {
  messages: Message[];
  onAcceptFile: (id: string) => void;
  onSaveToDisk: (url: string, name: string) => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ messages, onAcceptFile, onSaveToDisk }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const supportsFSA = 'showSaveFilePicker' in window;

  const prevMessageCount = useRef(messages.length);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Check if the last message was from the user
    const lastMsg = messages[messages.length - 1];
    const isMe = lastMsg?.sender === 'me';
    const isNewMessage = messages.length > prevMessageCount.current;

    // Determine if user is currently at the bottom (with a 100px buffer)
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;

    // Scroll to bottom if:
    // 1. User sent a message (always scroll)
    // 2. A new message arrived and user was already at the bottom
    // 3. It's an update to an existing message (like progress) and user was at the bottom
    if (isMe || isAtBottom) {
      el.scrollTop = el.scrollHeight;
    }

    prevMessageCount.current = messages.length;
  }, [messages]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isMedia = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm'].includes(ext || '');
  };

  const isViewable = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp4', 'webm', 'ogg', 'pdf', 'txt', 'md', 'json'].includes(ext || '');
  };

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0d0d0d]">
      {messages.length === 0 && (
        <div className="h-full flex flex-col items-center justify-center text-gray-600 font-mono gap-2 opacity-50">
          <Terminal size={48} className="mb-2" />
          <p className="tracking-widest uppercase text-sm">Awaiting Transmission...</p>
          <div className="w-32 h-px bg-gray-800 mt-2"></div>
        </div>
      )}

      {messages.map((msg) => {
        if (msg.sender === 'system') {
          return (
            <div key={msg.id} className="flex justify-center my-4">
              <div className="flex items-center gap-3 w-full max-w-lg">
                <div className="h-px bg-white/10 flex-1"></div>
                <span className="text-app-accent font-mono text-[10px] uppercase tracking-wider">
                  [{new Date(msg.timestamp).toLocaleTimeString()}] SYSTEM: {msg.content as string}
                </span>
                <div className="h-px bg-white/10 flex-1"></div>
              </div>
            </div>
          );
        }

        const isMe = msg.sender === 'me';

        return (
          <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group`}>
            {/* Sender Label */}
            <div className={`flex items-center gap-2 mb-1 text-[10px] uppercase font-mono tracking-wider ${isMe ? 'flex-row-reverse text-app-accent' : 'text-gray-500'}`}>
              <span className="font-bold">{isMe ? 'ME' : 'PEER'}</span>
              <span>//</span>
              <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
            </div>

            {/* Message Box */}
            <div className={`max-w-[90%] sm:max-w-[75%] border-l-2 relative backdrop-blur-sm transition-all duration-200 ${isMe
                ? 'border-app-accent bg-app-accent/5'
                : 'border-white/40 bg-white/5'
              }`}>

              {/* Decorative Corner */}
              <div className={`absolute top-0 w-2 h-2 border-t-2 ${isMe ? 'right-0 border-r-2 border-app-accent' : 'left-0 border-l-2 border-white/40'} opacity-50`}></div>

              <div className="px-4 py-3">
                {msg.type === 'text' ? (
                  <div
                    className="text-sm font-sans leading-relaxed break-words text-gray-200"
                    dangerouslySetInnerHTML={{ __html: msg.formatted || (msg.content as string) }}
                  />
                ) : (
                  <div className="w-full min-w-[240px]">
                    {/* File Header */}
                    <div className="flex items-start gap-4 mb-3 pb-3 border-b border-white/10">
                      <div className={`p-2 ${isMe ? 'bg-app-accent/20 text-app-accent' : 'bg-white/10 text-gray-300'}`}>
                        <FileIcon size={20} strokeWidth={1.5} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">FILE_ID: {(msg.content as FileMetadata).id.substring(0, 6).toUpperCase()}</span>
                        </div>
                        <p className="text-sm font-bold text-white truncate font-mono tracking-tight mt-0.5">{(msg.content as FileMetadata).name}</p>
                        <p className="text-xs text-app-accent font-mono mt-0.5">{formatSize((msg.content as FileMetadata).size)}</p>
                      </div>
                    </div>

                    {/* FAILED STATE */}
                    {msg.progress === -1 && (
                      <div className="w-full mb-3 bg-red-900/20 border border-red-500/50 p-2 flex items-center gap-2 text-red-500">
                        <AlertTriangle size={16} />
                        <span className="text-xs font-bold font-mono tracking-wider">TRANSMISSION FAILED</span>
                      </div>
                    )}

                    {/* Progress Bar - Tactical Style */}
                    {(msg.progress !== undefined && msg.progress >= 0 && msg.progress < 100) && (
                      <div className="w-full mb-3">
                        <div className="flex justify-between text-[10px] font-mono text-gray-400 mb-1">
                          <span>TRANSMITTING...</span>
                          <span>{Math.round(msg.progress)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-800">
                          <div
                            className="h-full bg-app-accent relative"
                            style={{ width: `${msg.progress}%` }}
                          >
                            <div className="absolute right-0 top-0 bottom-0 w-1 bg-white animate-pulse"></div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Save Action (During Transfer) */}
                    {msg.needsAcceptance && !isMe && msg.progress !== -1 && (
                      <button
                        onClick={() => onAcceptFile(msg.id)}
                        className="w-full mb-2 flex items-center justify-center gap-2 px-4 py-2 bg-app-accent hover:bg-[#ff7518] text-black text-xs font-bold uppercase tracking-wider transition-colors hover:shadow-[0_0_15px_rgba(255,101,0,0.3)]"
                      >
                        <HardDrive size={14} /> Initialize Stream to Disk
                      </button>
                    )}

                    {/* Preview & Actions (After Transfer) */}
                    {msg.blobUrl && (
                      <div className="space-y-3 animate-in fade-in duration-500">
                        {isMedia((msg.content as FileMetadata).name) && (
                          <div className="border border-white/10 bg-black/40 p-1">
                            <div className="relative group/preview overflow-hidden">
                              {(msg.content as FileMetadata).name.match(/\.(mp4|webm|ogg)$/i) ? (
                                <video src={msg.blobUrl} controls className="max-w-full max-h-60 object-contain mx-auto" />
                              ) : (
                                <img src={msg.blobUrl} alt="preview" className="max-w-full max-h-60 object-contain mx-auto" />
                              )}
                              {/* Scanline overlay on image */}
                              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 pointer-events-none"></div>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <a
                            href={msg.blobUrl}
                            download={(msg.content as FileMetadata).name}
                            className="flex items-center justify-center gap-2 px-3 py-2 border border-white/20 hover:border-app-accent hover:text-app-accent text-gray-300 text-xs uppercase font-medium tracking-wide transition-all"
                          >
                            <Download size={14} /> Download
                          </a>

                          {supportsFSA && (
                            <button
                              onClick={() => onSaveToDisk(msg.blobUrl!, (msg.content as FileMetadata).name)}
                              className="flex items-center justify-center gap-2 px-3 py-2 border border-white/20 hover:border-app-accent hover:text-app-accent text-gray-300 text-xs uppercase font-medium tracking-wide transition-all"
                            >
                              <Save size={14} /> Save As...
                            </button>
                          )}
                        </div>

                        {isViewable((msg.content as FileMetadata).name) && (
                          <a
                            href={msg.blobUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs uppercase font-medium tracking-wide transition-all"
                          >
                            <Eye size={14} /> View Source
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {isMe && <CornerDownLeft size={12} className="text-app-accent mt-1 mr-2 opacity-50" />}
          </div>
        );
      })}
    </div>
  );
};
