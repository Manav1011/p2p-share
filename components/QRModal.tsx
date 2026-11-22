import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, Type, Shield, ScanLine } from 'lucide-react';

interface QRModalProps {
  peerId: string;
  onConnect: (id: string) => void;
  onClose: () => void;
}

export const QRModal: React.FC<QRModalProps> = ({ peerId, onConnect, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<'display' | 'scan' | 'manual'>('display');
  const [manualId, setManualId] = useState('');
  const [scanError, setScanError] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Keep the latest callbacks in refs so the scanner only restarts when the mode changes,
  // not on every parent re-render (the parent passes new function objects each render)
  const onConnectRef = useRef(onConnect);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onConnectRef.current = onConnect;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (mode === 'display' && peerId && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, peerId, {
        width: 200,
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' }, // High contrast
      });
    }
  }, [peerId, mode]);

  useEffect(() => {
    if (mode !== 'scan') return;

    let cancelled = false;
    let handled = false;
    setScanError('');

    const timer = setTimeout(() => {
      if (cancelled) return;
      const scanner = new Html5Qrcode('reader');
      scannerRef.current = scanner;

      scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          if (handled) return; // a QR code can decode several times before stop() finishes
          handled = true;
          onConnectRef.current(decodedText);
          scanner.stop().catch(() => { /* already stopped */ }).finally(() => onCloseRef.current());
        },
        () => { /* ignore per-frame decode misses */ }
      ).then(() => {
        // Cleanup ran while the camera was starting: release it right away
        if (cancelled) scanner.stop().catch(() => { /* ignore */ });
      }).catch((err) => {
        console.error('Scanner error', err);
        if (!cancelled) setScanError('Camera unavailable. Check camera permission or use Input ID.');
      });
    }, 100);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) scanner.stop().catch(() => { /* not running */ });
    };
  }, [mode]);

  const submitManual = () => {
    const id = manualId.trim().toLowerCase();
    if (!id) return;
    onConnectRef.current(id);
    onCloseRef.current();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 font-sans">
      <div className="w-full max-w-sm bg-[#111] border border-white/10 relative shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden group">

        {/* Decorative corner markers */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-app-accent z-10"></div>
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-app-accent z-10"></div>
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-app-accent z-10"></div>
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-app-accent z-10"></div>

        {/* Header */}
        <div className="bg-[#1a1a1a] p-3 border-b border-white/5 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-app-accent" />
            <h2 className="text-sm font-bold text-white uppercase tracking-widest">Connection Protocol</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white hover:bg-white/10 p-1 transition-colors" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col items-center gap-6 relative">
          {/* Scanlines Overlay for modal content */}
          <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]"></div>

          {mode === 'display' && (
            <>
              <div className="flex flex-col items-center gap-2 w-full">
                <span className="text-gray-500 text-[10px] uppercase tracking-widest">Generated Identity Key</span>
                <div className="bg-white p-2 rounded-none border-2 border-white">
                  <canvas ref={canvasRef} />
                </div>
                <div className="bg-app-accent/10 border border-app-accent/30 text-app-accent px-4 py-2 font-mono text-xl tracking-widest w-full text-center mt-2">
                  {peerId || '...'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 w-full mt-2">
                <button onClick={() => setMode('scan')} className="flex items-center justify-center gap-2 py-3 bg-white hover:bg-gray-200 text-black font-bold uppercase tracking-wider text-xs transition-colors">
                  <Camera size={16} /> Scan QR
                </button>
                <button onClick={() => setMode('manual')} className="flex items-center justify-center gap-2 py-3 bg-transparent border border-white/20 hover:border-white text-white font-bold uppercase tracking-wider text-xs transition-colors">
                  <Type size={16} /> Input ID
                </button>
              </div>
            </>
          )}

          {mode === 'scan' && (
            <div className="w-full">
              <div className="relative border border-app-accent/50">
                <div id="reader" className="w-full h-64 bg-black"></div>
                <div className="absolute inset-0 border-2 border-app-accent/30 pointer-events-none flex items-center justify-center">
                  <ScanLine size={48} className="text-app-accent opacity-50 animate-pulse" />
                </div>
              </div>
              {scanError && (
                <p className="mt-3 text-xs text-red-500 font-mono">{scanError}</p>
              )}
              <button onClick={() => setMode('display')} className="mt-4 w-full py-3 border border-white/10 text-gray-400 hover:text-white uppercase text-xs tracking-widest hover:bg-white/5 transition-colors">
                Abort Scan
              </button>
            </div>
          )}

          {mode === 'manual' && (
            <form
              className="w-full flex flex-col gap-4"
              onSubmit={(e) => { e.preventDefault(); submitManual(); }}
            >
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-gray-500 tracking-wider">Target Identity</label>
                <input
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  placeholder="ENTER ID..."
                  className="w-full p-3 bg-black border border-white/20 text-white focus:border-app-accent outline-none font-mono text-lg placeholder:text-gray-700"
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>

              <button
                type="submit"
                disabled={!manualId.trim()}
                className="w-full py-3 bg-app-accent hover:bg-[#ff7518] disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold uppercase tracking-wider text-sm transition-colors"
              >
                Establish Link
              </button>
              <button type="button" onClick={() => setMode('display')} className="w-full py-2 text-gray-500 hover:text-white text-xs uppercase tracking-widest">
                Back
              </button>
            </form>
          )}
        </div>

        {/* Footer Status */}
        <div className="bg-[#0f0f0f] border-t border-white/5 p-2 flex justify-between text-[10px] text-gray-600 font-mono uppercase">
          <span>SECURE CHANNEL</span>
          <span>ENCRYPTION: AES-GCM</span>
        </div>
      </div>
    </div>
  );
};
