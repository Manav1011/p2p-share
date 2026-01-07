import React, { useRef, useState } from 'react';
import { Bold, Italic, Strikethrough, Code, Quote, List, ListOrdered, Send, Paperclip, Terminal } from 'lucide-react';

interface InputAreaProps {
    onSend: (text: string, formatted: string) => void;
    onFileUpload: (file: File) => void;
    parseMarkdown: (text: string) => string;
}

export const InputArea: React.FC<InputAreaProps> = ({ onSend, onFileUpload, parseMarkdown }) => {
    const inputRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [hasContent, setHasContent] = useState(false);

    const handleFormat = (command: string, value?: string) => {
        document.execCommand(command, false, value);
        inputRef.current?.focus();
        checkContent();
    };

    const insertMarkdown = (syntax: string) => {
        if (!inputRef.current) return;
        inputRef.current.focus();
        document.execCommand('insertText', false, syntax);
        checkContent();
    };

    const checkContent = () => {
        if (inputRef.current) {
            const text = inputRef.current.innerText.trim();
            setHasContent(text.length > 0);
        }
    };

    const handleSend = () => {
        if (!inputRef.current) return;
        const text = inputRef.current.innerText.trim();
        if (!text) return;

        const formatted = parseMarkdown(text);
        onSend(text, formatted);
        inputRef.current.innerText = '';
        setHasContent(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
        if (e.ctrlKey && e.key === 'b') { e.preventDefault(); handleFormat('bold'); }
        if (e.ctrlKey && e.key === 'i') { e.preventDefault(); handleFormat('italic'); }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        if (e.clipboardData && e.clipboardData.items) {
            const items = Array.from(e.clipboardData.items) as DataTransferItem[];
            const files = items
                .filter(item => item.kind === 'file')
                .map(item => item.getAsFile())
                .filter((file): file is File => file !== null);

            if (files.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                files.forEach(file => onFileUpload(file));
            }
        }
    };

    return (
        <div className="shrink-0 p-0 bg-[#0a0a0a] border-t border-white/10">
            {/* Formatting Toolbar - Styled as minimal status bar */}
            <div className="flex items-center gap-px bg-[#151515] border-b border-white/5 px-2 py-1 overflow-x-auto no-scrollbar">
                <span className="text-[10px] text-gray-600 font-mono uppercase mr-2 tracking-wider shrink-0">Format:</span>
                <FormatBtn icon={<Bold size={14} />} onClick={() => handleFormat('bold')} tooltip="Bold [Ctrl+B]" />
                <FormatBtn icon={<Italic size={14} />} onClick={() => handleFormat('italic')} tooltip="Italic [Ctrl+I]" />
                <FormatBtn icon={<Strikethrough size={14} />} onClick={() => handleFormat('strikeThrough')} tooltip="Strike" />
                <div className="w-px h-3 bg-white/10 mx-1 shrink-0"></div>
                <FormatBtn icon={<Code size={14} />} onClick={() => insertMarkdown('`')} tooltip="Code" />
                <FormatBtn icon={<Quote size={14} />} onClick={() => insertMarkdown('> ')} tooltip="Quote" />
                <div className="w-px h-3 bg-white/10 mx-1 shrink-0"></div>
                <FormatBtn icon={<List size={14} />} onClick={() => insertMarkdown('- ')} tooltip="Bullet" />
                <FormatBtn icon={<ListOrdered size={14} />} onClick={() => insertMarkdown('1. ')} tooltip="List" />
            </div>

            <div className="flex gap-0 p-3 items-end bg-[#0a0a0a] relative group">
                {/* Terminal Prompt Indicator */}
                <div className="pb-1 pr-3 text-app-accent animate-pulse self-start mt-0.5">
                    <Terminal size={18} />
                </div>

                <div className="flex-1 relative min-h-[24px]">
                    <div
                        ref={inputRef}
                        contentEditable
                        onInput={checkContent}
                        onPaste={handlePaste}
                        className="w-full bg-transparent text-gray-200 font-mono text-sm focus:outline-none min-h-[24px] max-h-[150px] overflow-y-auto whitespace-pre-wrap break-words caret-app-accent relative z-10"
                        role="textbox"
                        aria-multiline="true"
                        onKeyDown={handleKeyDown}
                        spellCheck={false}
                    />
                    {!hasContent && (
                        <div className="absolute top-0 left-0 text-gray-700 pointer-events-none font-mono text-sm uppercase tracking-wide z-0">
                            Command or Message...
                        </div>
                    )}
                </div>

                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    multiple
                    onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                            Array.from(e.target.files).forEach(file => onFileUpload(file));
                        }
                        e.target.value = '';
                    }}
                />

                <div className="flex gap-2 pl-3 pb-0.5">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-gray-500 hover:text-app-accent transition-colors p-1"
                        title="Attach Data (Multi-select supported)"
                    >
                        <Paperclip size={20} />
                    </button>

                    <button
                        onClick={handleSend}
                        className="text-app-accent hover:text-white transition-colors p-1"
                        title="Execute Send"
                    >
                        <Send size={20} />
                    </button>
                </div>
            </div>

            {/* Bottom decorative line */}
            <div className="h-0.5 bg-app-accent w-0 group-hover:w-full transition-all duration-500 ease-out"></div>
        </div>
    );
};

const FormatBtn = ({ icon, onClick, tooltip }: { icon: React.ReactNode, onClick: () => void, tooltip: string }) => (
    <button
        onClick={onClick}
        title={tooltip}
        className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-sm transition-colors shrink-0"
    >
        {icon}
    </button>
);