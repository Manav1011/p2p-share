import React, { useEffect, useState } from 'react';
import { Users, Wifi, UserPlus, RefreshCw, X } from 'lucide-react';

interface User {
    username: string;
    is_online: boolean;
    is_busy: boolean;
}

interface UserListProps {
    currentUsername: string;
    onConnect: (username: string) => void;
    onClose: () => void;
}

export const UserList: React.FC<UserListProps> = ({ currentUsername, onConnect, onClose }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const apiBase = import.meta.env.VITE_API_TARGET || '';
            const res = await fetch(`${apiBase}/users`);
            if (res.ok) {
                const data = await res.json();
                // Filter out self
                setUsers(data.filter((u: User) => u.username !== currentUsername));
            }
        } catch (error) {
            console.error("Failed to fetch users", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
        const interval = setInterval(fetchUsers, 10000); // Poll every 10s
        return () => clearInterval(interval);
    }, [currentUsername]);

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4">
            <div className="w-full max-w-md bg-[#0a0a0a] border border-white/20 shadow-2xl flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="bg-[#151515] p-4 border-b border-white/10 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-app-accent">
                        <Users size={20} />
                        <h2 className="font-bold uppercase tracking-widest text-sm">Active Personnel</h2>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={fetchUsers} disabled={loading} className="p-2 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors">
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[300px]">
                    {users.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-2 opacity-50">
                            <Wifi size={32} />
                            <span className="text-xs uppercase tracking-wider font-mono">No Active Peers Found</span>
                        </div>
                    ) : (
                        users.map(user => (
                            <div key={user.username} className="bg-white/5 border border-white/5 p-3 flex justify-between items-center group hover:border-app-accent/50 hover:bg-white/10 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_#22c55e]"></div>
                                    <span className="font-mono text-sm font-bold text-gray-200">{user.username}</span>
                                </div>

                                <button
                                    onClick={() => onConnect(user.username)}
                                    className="px-3 py-1.5 bg-app-accent/10 hover:bg-app-accent border border-app-accent/50 text-app-accent hover:text-black text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 transition-all"
                                >
                                    <UserPlus size={12} /> Connect
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="p-2 bg-[#111] border-t border-white/5 text-[10px] text-gray-500 font-mono text-center uppercase">
                    Scan Frequency: 10s // Region: Global
                </div>
            </div>
        </div>
    );
};
