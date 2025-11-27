import React, { useState } from 'react';
import SnakeGame from './components/SnakeGame';
import { GameState } from './types';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.LOADING);
  const [score, setScore] = useState(0);

  return (
    <div className="relative w-full h-screen bg-black flex flex-col items-center justify-center overflow-hidden">
      {/* Background/Ambient effects could go here */}
      
      <div className="z-10 w-full h-full relative">
        <SnakeGame 
          gameState={gameState} 
          setGameState={setGameState} 
          setScore={setScore}
        />
      </div>

      {/* HUD Layer - Always visible on top */}
      <div className="absolute top-0 left-0 w-full p-4 z-20 pointer-events-none flex justify-between items-start">
        <div>
          <h1 className="text-2xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 drop-shadow-lg game-font">
            Handaconda
          </h1>
          <p className="text-xs md:text-sm text-gray-400 mt-1">.</p>
        </div>
        
        {gameState !== GameState.MENU && gameState !== GameState.LOADING && (
          <div className="flex flex-col items-end animate-pulse">
            <span className="text-gray-400 text-xs uppercase tracking-wider">Score</span>
            <span className="text-4xl font-bold text-white game-font">{score}</span>
          </div>
        )}
      </div>

      {/* Footer / Instructions */}
      <div className="absolute bottom-4 left-0 w-full text-center z-20 pointer-events-none text-white/50 text-xs md:text-sm">
        {gameState === GameState.PLAYING ? (
          <p>Use your <span className="text-green-400 font-bold">Index Finger</span> to guide the snake</p>
        ) : (
          <p>&copy; {new Date().getFullYear()} Muhammd Imran</p>
        )}
      </div>
    </div>
  );
};

export default App;