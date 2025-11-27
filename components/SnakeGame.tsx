import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameState, WindowWithMediaPipe, Point, MediaPipeResults } from '../types';
import { Play, RotateCcw, Hand, Trophy, Zap } from 'lucide-react';

interface SnakeGameProps {
  gameState: GameState;
  setGameState: (state: GameState | ((prev: GameState) => GameState)) => void;
  setScore: (score: number) => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const SnakeGame: React.FC<SnakeGameProps> = ({ gameState, setGameState, setScore }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  
  // Game Logic Refs
  const snakePath = useRef<Point[]>([]);
  const snakeLength = useRef<number>(20);
  const applePos = useRef<Point>({ x: 0.5, y: 0.5 });
  const scoreRef = useRef<number>(0);
  const lastFingerPos = useRef<Point | null>(null); // For interpolation target
  const currentHeadPos = useRef<Point | null>(null); // Actual rendered head position
  const isHandDetected = useRef<boolean>(false);
  const particles = useRef<Particle[]>([]);
  
  const gameStateRef = useRef<GameState>(gameState);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);
  
  const handsRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);

  // --- AUDIO SYSTEM ---
  const initAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtxRef.current = new AudioContextClass();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  }, []);

  const playEatSound = useCallback(() => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    // Arcade "coin/blip" sound
    osc.type = 'sine';
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.1);
    
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    
    osc.start(t);
    osc.stop(t + 0.1);
  }, []);

  const playCrashSound = useCallback(() => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    // Arcade "crash" sound
    osc.type = 'sawtooth';
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(20, t + 0.5);
    
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
    
    osc.start(t);
    osc.stop(t + 0.5);
  }, []);

  // Cleanup audio context on unmount
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, []);


  // --- GAME LOGIC ---

  // Helper: Linear Interpolation for smooth movement
  const lerp = (start: number, end: number, t: number) => {
    return start * (1 - t) + end * t;
  };

  const initGame = useCallback(() => {
    scoreRef.current = 0;
    snakeLength.current = 20; // Reduced from 30 for a more manageable start
    snakePath.current = [];
    currentHeadPos.current = null;
    lastFingerPos.current = null;
    particles.current = [];
    spawnApple();
    setScore(0);
  }, [setScore]);

  const spawnApple = () => {
    const margin = 0.1;
    applePos.current = {
      x: margin + Math.random() * (1 - margin * 2),
      y: margin + Math.random() * (1 - margin * 2)
    };
  };

  const createExplosion = (x: number, y: number, color: string) => {
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12;
      const speed = Math.random() * 5 + 2;
      particles.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        color
      });
    }
  };

  const checkCollision = (head: Point, canvasWidth: number, canvasHeight: number) => {
    // 1. Apple Collision
    const dx = head.x - applePos.current.x;
    const dy = head.y - applePos.current.y;
    // Normalized distance threshold
    const distSq = dx * dx + dy * dy;
    
    // Threshold reduced to ~3% of screen (was ~5%) for more precise eating
    if (distSq < 0.001) { 
      scoreRef.current += 1;
      setScore(scoreRef.current);
      snakeLength.current += 5; // Reduced growth per apple (was 10)
      
      // Visual feedback
      createExplosion(applePos.current.x * canvasWidth, applePos.current.y * canvasHeight, '#4ade80');
      playEatSound(); // Play sound
      spawnApple();
    }

    // 2. Self Collision
    // We skip the first few nodes (head and neck) to prevent immediate self-collision on tight turns
    if (snakePath.current.length > 20) {
      // Check every 3rd point to save performance, starting from index 15
      for (let i = 15; i < snakePath.current.length; i += 2) {
        const bodyPart = snakePath.current[i];
        const bdx = head.x - bodyPart.x;
        const bdy = head.y - bodyPart.y;
        
        // If head touches body (radius check)
        if ((bdx * bdx + bdy * bdy) < 0.001) {
           handleGameOver();
           break;
        }
      }
    }
  };

  const handleGameOver = () => {
    setGameState(GameState.GAME_OVER);
    playCrashSound(); // Play sound
    // Add a big explosion at the head
    if (currentHeadPos.current && canvasRef.current) {
        createExplosion(
            currentHeadPos.current.x * canvasRef.current.width,
            currentHeadPos.current.y * canvasRef.current.height,
            '#ef4444'
        );
    }
  };

  const onResults = useCallback((results: MediaPipeResults) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    
    if (!canvas || !ctx) return;

    // --- RENDER LOOP ---

    // 1. Clear & Setup
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw simplified video feed (Darkened for game contrast)
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.filter = 'brightness(0.4) contrast(1.2) grayscale(0.5)'; // Artistic filter
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';
    ctx.restore();

    // Draw Subtle Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridSize = 50;
    ctx.beginPath();
    for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height);
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.moveTo(0, y); ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();


    if (gameStateRef.current === GameState.PLAYING) {
      // 2. Update Input (with Smoothing)
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        isHandDetected.current = true;
        const indexTip = results.multiHandLandmarks[0][8];
        const targetX = 1 - indexTip.x; // Mirroring
        const targetY = indexTip.y;

        if (!currentHeadPos.current) {
          // First frame detection, snap immediately
          currentHeadPos.current = { x: targetX, y: targetY };
        } else {
          // Smooth movement (Lerp) - Factor 0.15 gives a nice weight to the snake
          currentHeadPos.current = {
            x: lerp(currentHeadPos.current.x, targetX, 0.15),
            y: lerp(currentHeadPos.current.y, targetY, 0.15)
          };
        }

        // Add to path
        snakePath.current.unshift({ ...currentHeadPos.current });
        
        // Trim
        while (snakePath.current.length > snakeLength.current) {
          snakePath.current.pop();
        }

        checkCollision(currentHeadPos.current, canvas.width, canvas.height);
      } else {
        isHandDetected.current = false;
        // If hand is lost, snake pauses
      }

      // 3. Render Apple (Neon Style)
      const appleX = applePos.current.x * canvas.width;
      const appleY = applePos.current.y * canvas.height;
      const time = Date.now() / 200;
      const pulse = 1 + Math.sin(time) * 0.1;

      ctx.save();
      ctx.shadowColor = '#4ade80'; // Green Glow
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(appleX, appleY, 12 * pulse, 0, Math.PI * 2);
      ctx.fill();
      
      // Core of apple
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(appleX, appleY, 5 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 4. Render Snake
      if (snakePath.current.length > 1) {
        // Outer Glow
        ctx.shadowColor = '#06b6d4'; // Cyan Glow
        ctx.shadowBlur = 15;
        
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Draw Body Gradient
        const gradient = ctx.createLinearGradient(
            snakePath.current[0].x * canvas.width,
            snakePath.current[0].y * canvas.height,
            snakePath.current[snakePath.current.length - 1].x * canvas.width,
            snakePath.current[snakePath.current.length - 1].y * canvas.height
        );
        gradient.addColorStop(0, '#06b6d4'); // Cyan
        gradient.addColorStop(1, '#3b82f6'); // Blue

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 20;
        
        ctx.beginPath();
        const p0 = snakePath.current[0];
        ctx.moveTo(p0.x * canvas.width, p0.y * canvas.height);

        // Quadratic curves for smoother line
        for (let i = 1; i < snakePath.current.length - 2; i++) {
            const xc = (snakePath.current[i].x + snakePath.current[i + 1].x) / 2 * canvas.width;
            const yc = (snakePath.current[i].y + snakePath.current[i + 1].y) / 2 * canvas.height;
            ctx.quadraticCurveTo(
                snakePath.current[i].x * canvas.width, 
                snakePath.current[i].y * canvas.height, 
                xc, yc
            );
        }
        ctx.stroke();

        // Draw Head
        const headX = p0.x * canvas.width;
        const headY = p0.y * canvas.height;

        ctx.fillStyle = '#cffafe';
        ctx.beginPath();
        ctx.arc(headX, headY, 12, 0, Math.PI * 2);
        ctx.fill();

        // Eyes (looking in direction of movement)
        if (snakePath.current.length > 2) {
            const p2 = snakePath.current[2];
            const dx = (p0.x - p2.x);
            const dy = (p0.y - p2.y);
            const angle = Math.atan2(dy, dx);
            
            ctx.save();
            ctx.translate(headX, headY);
            ctx.rotate(angle);
            
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(0, -5, 3, 0, Math.PI * 2); // Left eye
            ctx.arc(0, 5, 3, 0, Math.PI * 2);  // Right eye
            ctx.fill();
            ctx.restore();
        }
        
        ctx.shadowBlur = 0; // Reset
      }

      // 5. Render Particles
      for (let i = particles.current.length - 1; i >= 0; i--) {
        const p = particles.current[i];
        p.life -= 0.05;
        p.x += p.vx;
        p.y += p.vy;
        
        if (p.life <= 0) {
          particles.current.splice(i, 1);
          continue;
        }

        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      // 6. No Hand Warning
      if (!isHandDetected.current) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.roundRect(canvas.width / 2 - 150, canvas.height / 2 - 40, 300, 80, 20);
        ctx.fill();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.font = 'bold 20px "Press Start 2P"';
        ctx.fillStyle = '#ef4444';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('HAND LOST', canvas.width / 2, canvas.height / 2);
      }
    }

  }, [setScore, playEatSound, playCrashSound]); // Added sound functions to dependency

  useEffect(() => {
    const win = window as unknown as WindowWithMediaPipe;
    
    if (win.Hands && win.Camera) {
      const hands = new win.Hands({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      hands.onResults(onResults);
      handsRef.current = hands;

      if (videoRef.current) {
        const camera = new win.Camera(videoRef.current, {
          onFrame: async () => {
            if (handsRef.current) {
              await handsRef.current.send({ image: videoRef.current });
            }
          },
          width: 1280,
          height: 720
        });
        camera.start();
        cameraRef.current = camera;
        
        const timeoutId = setTimeout(() => {
            setGameState(current => {
              if (current === GameState.LOADING) {
                return GameState.MENU;
              }
              return current;
            });
        }, 2000);

        return () => clearTimeout(timeoutId);
      }
    }
  }, [onResults, setGameState]);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const startGame = () => {
    initAudio(); // Initialize audio context on user gesture
    initGame();
    setGameState(GameState.PLAYING);
  };

  return (
    <div className="relative w-full h-full bg-gray-900">
      <video 
        ref={videoRef} 
        className="hidden" 
        playsInline 
      />
      <canvas 
        ref={canvasRef}
        className="block w-full h-full object-cover"
      />
      
      {/* LOADING OVERLAY */}
      {gameState === GameState.LOADING && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-30">
          <div className="flex flex-col items-center gap-6">
            <div className="relative">
                <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <Zap size={20} className="text-cyan-400 animate-pulse" />
                </div>
            </div>
            <div className="text-center">
                <p className="text-cyan-400 font-bold tracking-widest text-lg animate-pulse">SYSTEM INITIALIZING</p>
                <p className="text-gray-500 text-xs mt-2 font-mono">Loading Neural Networks...</p>
            </div>
          </div>
        </div>
      )}

      {/* MAIN MENU */}
      {gameState === GameState.MENU && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-md z-30">
          <div className="bg-gray-900/80 p-10 rounded-3xl shadow-[0_0_50px_rgba(6,182,212,0.3)] border border-gray-700 max-w-lg w-full text-center relative overflow-hidden">
            {/* Decorative background blurs */}
            <div className="absolute -top-10 -left-10 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-cyan-500/20 rounded-full blur-3xl"></div>

            <div className="relative z-10">
                <h1 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 mb-2 game-font drop-shadow-lg" style={{textShadow: '0 0 20px rgba(6,182,212,0.5)'}}>
                    HANDACONDA
                </h1>
                <p className="text-gray-300 mb-8 font-light text-lg">AI Gesture Edition</p>

                <div className="flex justify-center mb-8 gap-4">
                    <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex flex-col items-center w-28">
                        <Hand className="text-cyan-400 mb-2" />
                        <span className="text-xs text-gray-400">Point Finger</span>
                    </div>
                    <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex flex-col items-center w-28">
                        <Trophy className="text-yellow-400 mb-2" />
                        <span className="text-xs text-gray-400">Beat Score</span>
                    </div>
                </div>

                <button 
                  onClick={startGame}
                  className="group relative w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-5 px-8 rounded-2xl transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-cyan-500/50"
                >
                  <span className="flex items-center justify-center gap-3 text-xl tracking-wide">
                    <Play className="fill-current" />
                    PLAY NOW
                  </span>
                </button>
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER */}
      {gameState === GameState.GAME_OVER && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-950/90 backdrop-blur-md z-30">
          <div className="text-center relative">
            <h2 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-red-500 to-red-800 mb-2 drop-shadow-[0_5px_5px_rgba(0,0,0,0.5)] game-font">
                CRASHED
            </h2>
            <div className="bg-black/40 p-6 rounded-2xl border border-red-500/30 backdrop-blur-sm mb-8 inline-block min-w-[300px]">
                <p className="text-gray-400 text-sm uppercase tracking-widest mb-1">Final Score</p>
                <p className="text-6xl font-bold text-white game-font">{scoreRef.current}</p>
            </div>
            
            <div className="flex justify-center">
                <button 
                  onClick={startGame}
                  className="bg-white text-red-600 hover:bg-gray-200 font-bold py-4 px-10 rounded-full transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] flex items-center gap-2 transform hover:-translate-y-1"
                >
                  <RotateCcw size={24} />
                  RESTART SYSTEM
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SnakeGame;