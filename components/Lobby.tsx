import React, { useState } from 'react';

interface LobbyProps {
  onJoin: (nickname: string, roomId: string, isHost: boolean) => void;
}

const Lobby: React.FC<LobbyProps> = ({ onJoin }) => {
  const [nickname, setNickname] = useState('');
  const [roomId, setRoomId] = useState('');
  const [mode, setMode] = useState<'MENU' | 'JOIN' | 'CREATE'>('MENU');

  const handleCreate = () => {
    if (!nickname.trim()) return alert("Enter nickname");
    // Generate a random room ID
    const newRoomId = 'room-' + Math.floor(Math.random() * 10000).toString();
    onJoin(nickname, newRoomId, true);
  };

  const handleJoinSubmit = () => {
    if (!nickname.trim()) return alert("Enter nickname");
    if (!roomId.trim()) return alert("Enter Room ID");
    onJoin(nickname, roomId, false);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      
      {/* Background Animation elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
         <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-yellow-500 rounded-full blur-3xl animate-pulse"></div>
         <div className="absolute bottom-1/4 right-1/4 w-32 h-32 bg-green-500 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
      </div>

      <div className="w-full max-w-md bg-slate-800/90 backdrop-blur rounded-xl shadow-2xl overflow-hidden border border-slate-700 z-10">
        
        {/* Header */}
        <div className="p-8 bg-gradient-to-br from-slate-800 to-slate-900 text-center border-b border-slate-700">
          <h1 className="text-5xl font-black text-white tracking-tighter uppercase drop-shadow-lg mb-2">
            Infection<span className="text-green-500">.io</span>
          </h1>
          <p className="text-slate-400 font-mono text-xs tracking-widest uppercase">Multiplayer Survival</p>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          
          <div>
            <label className="block text-slate-400 text-xs font-bold mb-2 uppercase tracking-wide">Your Nickname</label>
            <input
              type="text"
              maxLength={12}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="PLAYER 1"
              className="w-full bg-slate-900 border border-slate-600 text-white p-4 rounded-lg focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition font-bold text-lg text-center uppercase placeholder-slate-600"
            />
          </div>

          {mode === 'MENU' && (
            <div className="space-y-3 pt-4">
              <button
                onClick={() => setMode('CREATE')}
                className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-lg shadow-lg transform hover:scale-[1.02] active:scale-95 transition flex items-center justify-center space-x-2 border-b-4 border-green-800"
              >
                <span className="text-xl">CREATE ROOM</span>
              </button>
              <button
                onClick={() => setMode('JOIN')}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-lg shadow-lg transform hover:scale-[1.02] active:scale-95 transition flex items-center justify-center space-x-2 border-b-4 border-blue-800"
              >
                <span className="text-xl">JOIN ROOM</span>
              </button>
            </div>
          )}

          {mode === 'CREATE' && (
             <div className="text-center">
               <p className="text-slate-300 mb-4 text-sm">You will host the game. Share the Room ID with friends.</p>
               <button onClick={handleCreate} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-lg animate-pulse">
                 START HOSTING
               </button>
               <button onClick={() => setMode('MENU')} className="mt-4 text-slate-500 text-sm hover:text-white transition">Back</button>
             </div>
          )}

          {mode === 'JOIN' && (
            <div className="space-y-4">
               <div>
                <label className="block text-slate-400 text-xs font-bold mb-2 uppercase tracking-wide">Room ID</label>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="room-1234..."
                  className="w-full bg-slate-900 border border-slate-600 text-white p-4 rounded-lg focus:outline-none focus:border-blue-500 text-center font-mono"
                />
               </div>
               <button onClick={handleJoinSubmit} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg">
                 CONNECT
               </button>
               <button onClick={() => setMode('MENU')} className="mt-2 w-full text-slate-500 text-sm hover:text-white transition">Back</button>
            </div>
          )}

        </div>
        
        <div className="bg-slate-900/50 p-4 text-center border-t border-slate-700">
          <p className="text-xs text-slate-500">
            Hosted via PeerJS (P2P). No server required.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Lobby;