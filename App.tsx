import React, { useState } from 'react';
import Lobby from './components/Lobby';
import GameCanvas from './components/GameCanvas';

function App() {
  const [inGame, setInGame] = useState(false);
  const [gameData, setGameData] = useState({
    nickname: '',
    roomId: '',
    isHost: false
  });

  const handleJoin = (nickname: string, roomId: string, isHost: boolean) => {
    setGameData({ nickname, roomId, isHost });
    setInGame(true);
  };

  const handleExit = () => {
    setInGame(false);
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-900 text-white">
      {!inGame ? (
        <Lobby onJoin={handleJoin} />
      ) : (
        <GameCanvas 
          nickname={gameData.nickname}
          roomId={gameData.roomId}
          isHost={gameData.isHost}
          onExit={handleExit}
        />
      )}
    </div>
  );
}

export default App;