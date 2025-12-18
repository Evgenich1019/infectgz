import React, { useRef, useEffect, useState } from 'react';
import { Peer, DataConnection } from 'peerjs';
import { Player, Obstacle, Role, GameState, NetworkPacket, JoinPayload, InputPayload, StatePayload, PacketType } from '../types';
import { 
  MAP_WIDTH, 
  MAP_HEIGHT, 
  PLAYER_RADIUS, 
  PLAYER_SPEED, 
  ZOMBIE_SPEED_MULTIPLIER, 
  VIEW_DISTANCE, 
  COUNTDOWN_TIME, 
  GAME_DURATION,
  COLOR_SURVIVOR,
  COLOR_ZOMBIE,
  COLOR_OBSTACLE,
  COLOR_BG
} from '../constants';
import { generateObstacles, resolveCollision, getDistance, lerp } from '../utils/gameLogic';
import Joystick from './Joystick';

interface GameCanvasProps {
  nickname: string;
  roomId: string;
  isHost: boolean;
  onExit: () => void;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ nickname, roomId, isHost, onExit }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // State
  const [status, setStatus] = useState<string>('Initializing P2P...');
  const [countdown, setCountdown] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [stats, setStats] = useState({ survivors: 0, zombies: 0 });
  const [gameOverReason, setGameOverReason] = useState<'INFECTED' | 'SURVIVED' | 'TIME_UP'>('INFECTED');

  // Game Refs
  const myIdRef = useRef<string>('');
  const playersRef = useRef<Player[]>([]);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const gameStateRef = useRef<GameState>(GameState.LOBBY);
  const frameIdRef = useRef<number>(0);
  
  // Inputs
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const joystickRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
  
  // Network Refs
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map()); // For Host: connected clients
  const hostConnRef = useRef<DataConnection | null>(null); // For Client: connection to host
  
  // Host Specific
  const clientInputsRef = useRef<Map<string, { dx: number, dy: number }>>(new Map());
  const gameStartTimeRef = useRef<number>(0);

  // --- 1. INITIALIZATION ---
  useEffect(() => {
    // Generate static obstacles if host, otherwise wait for network
    if (isHost) {
      obstaclesRef.current = generateObstacles();
    }

    const peer = new Peer(isHost ? roomId : undefined, {
      debug: 1,
    });
    peerRef.current = peer;

    peer.on('open', (id) => {
      myIdRef.current = id;
      console.log('My Peer ID:', id);

      if (isHost) {
        setStatus(`Waiting for players... Room ID: ${roomId}`);
        // Create Host Player
        const hostPlayer: Player = createPlayer(id, nickname, Role.SURVIVOR);
        playersRef.current = [hostPlayer];
        gameStateRef.current = GameState.LOBBY;
      } else {
        setStatus(`Connecting to Host (${roomId})...`);
        connectToHost(roomId);
      }
    });

    peer.on('connection', (conn) => {
      if (isHost) {
        handleIncomingConnection(conn);
      }
    });

    peer.on('error', (err) => {
      console.error(err);
      setStatus(`Connection Error: ${err.type}`);
    });

    // Input listeners
    const handleKeyDown = (e: KeyboardEvent) => { keysRef.current[e.code] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keysRef.current[e.code] = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Start Render Loop
    frameIdRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(frameIdRef.current);
      peer.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- 2. HOST LOGIC ---
  const sendToClient = (conn: DataConnection, type: PacketType, payload: any) => {
    if (conn.open) {
      conn.send({ type, payload });
    }
  };

  const handleIncomingConnection = (conn: DataConnection) => {
    console.log('Client connected:', conn.peer);
    connectionsRef.current.set(conn.peer, conn);

    conn.on('data', (data: any) => {
      const packet = data as NetworkPacket;
      
      if (packet.type === 'JOIN') {
        const payload = packet.payload as JoinPayload;
        // Add new player
        const newPlayer = createPlayer(conn.peer, payload.nickname, Role.SURVIVOR);
        playersRef.current.push(newPlayer);
        
        // If game hasn't started, check if we want to auto-start? 
        // For now, let's auto-start count down if we have 2 players
        if (gameStateRef.current === GameState.LOBBY && playersRef.current.length >= 2) {
           startCountdown();
        }

        // Send Welcome Packet with initial State and Obstacles
        sendToClient(conn, 'WELCOME', {
           players: playersRef.current,
           obstacles: obstaclesRef.current,
           gameState: gameStateRef.current,
           timeLeft: GAME_DURATION
        });
      }

      if (packet.type === 'INPUT') {
        const payload = packet.payload as InputPayload;
        clientInputsRef.current.set(conn.peer, payload);
      }
    });

    conn.on('close', () => {
      console.log('Client disconnected:', conn.peer);
      connectionsRef.current.delete(conn.peer);
      clientInputsRef.current.delete(conn.peer);
      // Remove player
      playersRef.current = playersRef.current.filter(p => p.id !== conn.peer);
    });
  };

  const startCountdown = () => {
    gameStateRef.current = GameState.COUNTDOWN;
    let count = COUNTDOWN_TIME;
    setCountdown(count);
    
    const timer = setInterval(() => {
      count--;
      setCountdown(count);
      if (count <= 0) {
        clearInterval(timer);
        startGame();
      }
    }, 1000);
  };

  const startGame = () => {
    gameStateRef.current = GameState.PLAYING;
    gameStartTimeRef.current = Date.now();
    
    // Pick random zombie
    const players = playersRef.current;
    if (players.length > 0) {
      const zombieIdx = Math.floor(Math.random() * players.length);
      players[zombieIdx].role = Role.ZOMBIE;
    }
  };

  const updateHost = () => {
    if (gameStateRef.current === GameState.GAME_OVER) return;

    // Timer
    if (gameStateRef.current === GameState.PLAYING) {
       const elapsed = Math.floor((Date.now() - gameStartTimeRef.current) / 1000);
       const left = Math.max(0, GAME_DURATION - elapsed);
       setTimeLeft(left);
       
       if (left <= 0) {
         endGame('TIME_UP');
       }
    }

    // Process Inputs (Host + Clients)
    const players = playersRef.current;
    const obstacles = obstaclesRef.current;

    players.forEach(p => {
      let dx = 0; 
      let dy = 0;

      if (p.id === myIdRef.current) {
        // Host Inputs
        const { x, y } = getLocalInput();
        dx = x; dy = y;
      } else {
        // Client Inputs
        const input = clientInputsRef.current.get(p.id);
        if (input) {
          dx = input.dx; dy = input.dy;
        }
      }
      
      // Update Physics
      p.dx = lerp(p.dx, dx, 0.2);
      p.dy = lerp(p.dy, dy, 0.2);
      
      const speed = p.role === Role.ZOMBIE ? PLAYER_SPEED * ZOMBIE_SPEED_MULTIPLIER : PLAYER_SPEED;
      
      // Stop moving if no input (optional, keeps inertia a bit)
      if (Math.abs(p.dx) < 0.01) p.dx = 0;
      if (Math.abs(p.dy) < 0.01) p.dy = 0;

      p.x += p.dx * speed;
      p.y += p.dy * speed;

      resolveCollision(p, obstacles);
    });

    // Game Logic (Infection)
    if (gameStateRef.current === GameState.PLAYING) {
        let survivors = 0;
        let zombies = 0;
        
        // Find zombies
        const zombiePlayers = players.filter(p => p.role === Role.ZOMBIE);
        
        players.forEach(p => {
            if (p.role === Role.SURVIVOR) survivors++;
            else zombies++;

            if (p.role === Role.SURVIVOR) {
                // Check collision with any zombie
                for (const z of zombiePlayers) {
                    if (getDistance(p, z) < (p.radius + z.radius) * 0.8) {
                        p.role = Role.ZOMBIE;
                        break;
                    }
                }
            }
        });

        setStats({ survivors, zombies });

        if (survivors === 0 && players.length > 1) { // Wait for at least 1 person to be infected if solo testing
             endGame('INFECTED');
        }
    }

    // Broadcast State (Snapshot)
    const payload: StatePayload = {
        players: players,
        timeLeft: timeLeft,
        gameState: gameStateRef.current,
        obstacles: [] // Don't send obstacles every frame
    };
    broadcast('STATE', payload);
  };

  const endGame = (reason: 'INFECTED' | 'SURVIVED' | 'TIME_UP') => {
      gameStateRef.current = GameState.GAME_OVER;
      setGameOverReason(reason);
      broadcast('GAME_OVER', { reason });
  };

  // --- 3. CLIENT LOGIC ---
  const connectToHost = (hostId: string) => {
    if (!peerRef.current) return;
    const conn = peerRef.current.connect(hostId);
    
    conn.on('open', () => {
        setStatus('Connected! sending info...');
        hostConnRef.current = conn;
        // Send join packet
        conn.send({
            type: 'JOIN',
            payload: { nickname }
        } as NetworkPacket);
    });

    conn.on('data', (data: any) => {
        const packet = data as NetworkPacket;
        
        if (packet.type === 'WELCOME') {
            setStatus('Joined Game');
            const payload = packet.payload as StatePayload;
            obstaclesRef.current = payload.obstacles; // Load map
            playersRef.current = payload.players;
            gameStateRef.current = payload.gameState;
        }

        if (packet.type === 'STATE') {
            const payload = packet.payload as StatePayload;
            gameStateRef.current = payload.gameState;
            setTimeLeft(payload.timeLeft);
            
            // Reconcile / Interpolate Players
            // We update our local players array with server data
            // To make it smooth, we update "target" positions and lerp in the render loop
            
            // Naive approach first: just replace, then fix smoothing
            const serverPlayers = payload.players;
            
            // Map current players to find matches
            const currentMap = new Map<string, Player>(
              playersRef.current.map(p => [p.id, p] as [string, Player])
            );
            
            playersRef.current = serverPlayers.map(sp => {
                const local = currentMap.get(sp.id);
                if (local) {
                    // Update target props for interpolation
                    local.targetX = sp.x;
                    local.targetY = sp.y;
                    local.role = sp.role; // Role updates instantly
                    local.nickname = sp.nickname;
                    return local;
                } else {
                    // New player
                    return { ...sp, targetX: sp.x, targetY: sp.y };
                }
            });
            
            // Calculate stats
            let s = 0, z = 0;
            playersRef.current.forEach(p => p.role === Role.SURVIVOR ? s++ : z++);
            setStats({ survivors: s, zombies: z });
        }

        if (packet.type === 'GAME_OVER') {
            gameStateRef.current = GameState.GAME_OVER;
            setGameOverReason(packet.payload.reason);
        }
    });

    conn.on('close', () => {
        setStatus('Disconnected from Host');
        onExit();
    });
  };

  const updateClient = () => {
     // Send Input
     if (hostConnRef.current && hostConnRef.current.open) {
         const { x, y } = getLocalInput();
         // Optimization: Only send if changed? For now send every frame or every few frames
         // P2P can handle high frequency
         hostConnRef.current.send({
             type: 'INPUT',
             payload: { dx: x, dy: y }
         } as NetworkPacket);
     }

     // Interpolate Visuals
     playersRef.current.forEach(p => {
         if (p.targetX !== undefined && p.targetY !== undefined) {
             // Lerp factor 0.3 handles lag smoothing
             p.x = lerp(p.x, p.targetX, 0.3);
             p.y = lerp(p.y, p.targetY, 0.3);
         }
     });
  };

  // --- 4. SHARED/UTILS ---
  const loop = () => {
    if (isHost) {
        updateHost();
    } else {
        updateClient();
    }
    draw();
    frameIdRef.current = requestAnimationFrame(loop);
  };

  const getLocalInput = () => {
    let dx = 0;
    let dy = 0;

    // Keyboard
    if (keysRef.current['ArrowUp'] || keysRef.current['KeyW']) dy = -1;
    if (keysRef.current['ArrowDown'] || keysRef.current['KeyS']) dy = 1;
    if (keysRef.current['ArrowLeft'] || keysRef.current['KeyA']) dx = -1;
    if (keysRef.current['ArrowRight'] || keysRef.current['KeyD']) dx = 1;

    // Joystick
    if (joystickRef.current.x !== 0 || joystickRef.current.y !== 0) {
        dx = joystickRef.current.x;
        dy = joystickRef.current.y;
    }

    // Normalize
    if (dx !== 0 || dy !== 0) {
        const len = Math.sqrt(dx*dx + dy*dy);
        if (len > 1) { dx/=len; dy/=len; }
    }
    return { x: dx, y: dy };
  };

  const broadcast = (type: string, payload: any) => {
      connectionsRef.current.forEach(conn => {
          if (conn.open) conn.send({ type, payload });
      });
  };

  const createPlayer = (id: string, name: string, role: Role): Player => {
      // Find valid spawn
      const spawn = findValidSpawn();
      return {
          id,
          nickname: name,
          x: spawn.x,
          y: spawn.y,
          radius: PLAYER_RADIUS,
          role: role,
          speed: PLAYER_SPEED,
          isBot: false,
          dx: 0,
          dy: 0,
          wanderAngle: 0
      };
  };

  const findValidSpawn = () => {
    let x = 0, y = 0, valid = false;
    let attempts = 0;
    while (!valid && attempts < 100) {
      x = Math.random() * (MAP_WIDTH - 200) + 100;
      y = Math.random() * (MAP_HEIGHT - 200) + 100;
      valid = true;
      for (const obs of obstaclesRef.current) {
        if (x > obs.x - 50 && x < obs.x + obs.width + 50 &&
            y > obs.y - 50 && y < obs.y + obs.height + 50) {
          valid = false;
          break;
        }
      }
      attempts++;
    }
    return { x, y };
  };

  // --- DRAWING ---
  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Camera follow local player (or 0,0 if not spawned)
    const myPlayer = playersRef.current.find(p => p.id === myIdRef.current);
    const camX = myPlayer ? -myPlayer.x + canvas.width / 2 : 0;
    const camY = myPlayer ? -myPlayer.y + canvas.height / 2 : 0;

    // BG
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(camX, camY);

    // Map Borders
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Grid
    ctx.strokeStyle = '#1e293b'; 
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= MAP_WIDTH; x += 100) { ctx.moveTo(x, 0); ctx.lineTo(x, MAP_HEIGHT); }
    for (let y = 0; y <= MAP_HEIGHT; y += 100) { ctx.moveTo(0, y); ctx.lineTo(MAP_WIDTH, y); }
    ctx.stroke();

    // Obstacles
    obstaclesRef.current.forEach(obs => {
      ctx.fillStyle = COLOR_OBSTACLE;
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      ctx.fillStyle = '#94a3b8'; 
      ctx.fillRect(obs.x, obs.y, obs.width, 10);
    });

    // Players
    playersRef.current.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.role === Role.SURVIVOR ? COLOR_SURVIVOR : COLOR_ZOMBIE;
      ctx.fill();
      
      // Highlight self
      if (p.id === myIdRef.current) {
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'white';
          ctx.stroke();
          ctx.lineWidth = 1;
      } else {
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 10;
          ctx.stroke();
          ctx.shadowBlur = 0;
      }

      ctx.fillStyle = 'white';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.nickname, p.x, p.y - p.radius - 12);
    });

    ctx.restore();

    // Fog (Only for Survivors or everyone? Let's keep it for everyone for mood)
    // Only if playing
    if (gameStateRef.current === GameState.PLAYING || gameStateRef.current === GameState.COUNTDOWN) {
        if (!fogCanvasRef.current) fogCanvasRef.current = document.createElement('canvas');
        const fogCanvas = fogCanvasRef.current;
        if (fogCanvas.width !== canvas.width) {
            fogCanvas.width = canvas.width;
            fogCanvas.height = canvas.height;
        }
        const fogCtx = fogCanvas.getContext('2d')!;
        
        fogCtx.globalCompositeOperation = 'source-over';
        fogCtx.fillStyle = 'black';
        fogCtx.fillRect(0, 0, fogCanvas.width, fogCanvas.height);
        
        fogCtx.globalCompositeOperation = 'destination-out';
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        
        const grad = fogCtx.createRadialGradient(cx, cy, 0, cx, cy, VIEW_DISTANCE);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.8, 'rgba(255,255,255,1)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        
        fogCtx.fillStyle = grad;
        fogCtx.beginPath();
        fogCtx.arc(cx, cy, VIEW_DISTANCE, 0, Math.PI * 2);
        fogCtx.fill();

        ctx.drawImage(fogCanvas, 0, 0);
    }
  };

  const handleJoystickMove = (x: number, y: number) => {
    joystickRef.current = { x, y };
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // --- RENDER HUD ---
  if (gameStateRef.current === GameState.LOBBY) {
      return (
          <div className="relative w-full h-full bg-slate-900 flex items-center justify-center">
               <canvas ref={canvasRef} className="block absolute inset-0" />
               <div className="z-10 bg-slate-800/90 p-8 rounded-lg text-center backdrop-blur shadow-xl border border-slate-700">
                   <h2 className="text-2xl font-bold text-white mb-2">{isHost ? 'LOBBY - HOST' : 'LOBBY - WAITING'}</h2>
                   <p className="text-slate-400 mb-6 font-mono">{status}</p>
                   
                   <div className="mb-6">
                       <p className="text-sm text-slate-500 uppercase tracking-widest mb-2">Players Connected</p>
                       <p className="text-4xl text-green-400 font-black">{playersRef.current.length}</p>
                   </div>
                   
                   {isHost && playersRef.current.length > 1 && (
                       <button onClick={startCountdown} className="px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded animate-pulse">
                           FORCE START
                       </button>
                   )}
                   {isHost && playersRef.current.length <= 1 && (
                       <p className="text-xs text-yellow-500 animate-pulse">Waiting for at least 1 more player...</p>
                   )}
                   <button onClick={onExit} className="mt-4 text-slate-500 underline text-sm">Cancel</button>
               </div>
          </div>
      );
  }

  return (
    <div className="relative w-full h-full bg-slate-900 overflow-hidden">
      <canvas ref={canvasRef} className="block" />
      
      {/* HUD */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none select-none z-30">
        <div className="bg-black/50 p-2 px-4 rounded backdrop-blur-md border border-white/10 text-white font-mono shadow-lg">
          <div className="text-yellow-400 font-bold flex justify-between gap-4"><span>Survivors</span> <span>{stats.survivors}</span></div>
          <div className="text-green-400 font-bold flex justify-between gap-4"><span>Zombies</span> <span>{stats.zombies}</span></div>
        </div>
        
        <div className={`text-3xl font-black font-mono tracking-widest bg-black/30 px-3 rounded ${timeLeft < 30 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
          {formatTime(timeLeft)}
        </div>
      </div>
      
      {/* Room ID Overlay (Small) */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-slate-800/80 px-2 py-1 rounded text-xs text-slate-400 font-mono pointer-events-none">
          ROOM: {roomId}
      </div>

      {/* Countdown Overlay */}
      {countdown > 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-40 pointer-events-none">
          <div className="text-9xl font-black text-white animate-bounce">
            {countdown}
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameStateRef.current === GameState.GAME_OVER && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-50 p-4 text-center">
          <h2 className={`text-6xl font-black mb-4 animate-pulse ${
              gameOverReason === 'INFECTED' ? 'text-green-500' : 'text-yellow-400'
          }`}>
              {gameOverReason === 'TIME_UP' ? 'SURVIVORS WIN' : (gameOverReason === 'INFECTED' ? 'INFECTED WINS' : 'GAME OVER')}
          </h2>
          <p className="text-xl text-white mb-8 font-mono">
            {gameOverReason === 'TIME_UP' ? 'Time ran out.' : 'All survivors were infected.'}
          </p>
          <button 
            onClick={onExit}
            className="px-8 py-4 bg-white text-black font-bold rounded hover:bg-gray-200 transition text-lg uppercase tracking-wide"
          >
            Back to Lobby
          </button>
        </div>
      )}

      {/* Mobile Controls */}
      <div className="md:hidden z-50">
        <Joystick onMove={handleJoystickMove} />
      </div>
    </div>
  );
};

export default GameCanvas;