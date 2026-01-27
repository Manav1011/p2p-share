import React, { useState } from 'react';
import { Shield, ArrowRight, UserPlus, Lock, X } from 'lucide-react';

interface LoginOverlayProps {
    onLogin: (username: string) => void;
    onClose: () => void;
}

export const LoginOverlay: React.FC<LoginOverlayProps> = ({ onLogin, onClose }) => {
    const [isRegistering, setIsRegistering] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const endpoint = isRegistering ? '/api/register' : '/api/login';

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.detail || 'Authentication failed');
            }

            if (isRegistering) {
                // If registered, auto-login or ask to login
                setIsRegistering(false);
                setError('Registration successful! Please login.');
                setLoading(false);
            } else {
                onLogin(username);
            }
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] pointer-events-none opacity-20"></div>

            <div className="w-full max-w-md bg-[#0a0a0a] border border-white/10 relative shadow-[0_0_50px_rgba(255,101,0,0.1)] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-500">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white z-50 transition-colors"
                >
                    <X size={24} />
                </button>

                {/* Decorative Markers */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-app-accent"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-app-accent"></div>

                <div className="p-8 flex flex-col gap-6">
                    <div className="flex flex-col items-center gap-2">
                        <div className="p-4 bg-app-accent/10 rounded-full mb-2 border border-app-accent/30">
                            <Shield size={32} className="text-app-accent animate-pulse" />
                        </div>
                        <h1 className="text-2xl font-bold text-white uppercase tracking-widest">
                            P2P Share <span className="text-app-accent">//</span> Secure Access
                        </h1>
                        <p className="text-gray-500 font-mono text-xs uppercase tracking-wider">
                            Authentication Required
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-4">
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase text-gray-500 tracking-wider font-bold ml-1">Identity</label>
                            <input
                                type="text"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                className="w-full bg-black/50 border border-white/20 p-3 text-white focus:border-app-accent outline-none font-mono text-sm transition-colors"
                                placeholder="USERNAME"
                                required
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] uppercase text-gray-500 tracking-wider font-bold ml-1">Passcode</label>
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full bg-black/50 border border-white/20 p-3 text-white focus:border-app-accent outline-none font-mono text-sm transition-colors"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        {error && (
                            <div className="p-2 bg-red-900/20 border border-red-500/50 text-red-500 text-xs font-mono text-center">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-2 bg-app-accent hover:bg-[#ff7518] text-black font-bold py-3 uppercase tracking-wider flex items-center justify-center gap-2 transition-all hover:shadow-[0_0_20px_rgba(255,101,0,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <span className="animate-pulse">Processing...</span>
                            ) : (
                                <>
                                    {isRegistering ? 'Initialize Identity' : 'Establish Link'}
                                    <ArrowRight size={16} />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="flex justify-center border-t border-white/10 pt-4">
                        <button
                            type="button"
                            onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
                            className="text-gray-500 hover:text-white text-xs uppercase tracking-widest flex items-center gap-2 transition-colors"
                        >
                            {isRegistering ? <Lock size={12} /> : <UserPlus size={12} />}
                            {isRegistering ? 'Return to Login' : 'Create New Identity'}
                        </button>
                    </div>
                </div>

                <div className="bg-[#111] py-2 px-4 flex justify-between text-[10px] font-mono text-gray-600 uppercase border-t border-white/5">
                    <span>Sys.Ver.2.1.0</span>
                    <span>Encrypted</span>
                </div>
            </div>
        </div>
    );
};
