export enum GameState {
  LOBBY = 'LOBBY',
  COUNTDOWN = 'COUNTDOWN',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
}

export enum Role {
  SURVIVOR = 'SURVIVOR',
  ZOMBIE = 'ZOMBIE',
}

export interface Point {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  nickname: string;
  x: number;
  y: number;
  radius: number;
  role: Role;
  speed: number;
  isBot: boolean;
  dx: number; 
  dy: number; 
  wanderAngle: number; 
  target?: Point; 
  // Network interpolation targets
  targetX?: number;
  targetY?: number;
}

export interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Room {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
  ping: number;
}

// --- Network Types ---

export type PacketType = 'JOIN' | 'INPUT' | 'STATE' | 'GAME_OVER' | 'WELCOME';

export interface NetworkPacket {
  type: PacketType;
  payload: any;
}

export interface JoinPayload {
  nickname: string;
}

export interface InputPayload {
  dx: number;
  dy: number;
}

export interface StatePayload {
  players: Player[];
  timeLeft: number;
  gameState: GameState;
  obstacles: Obstacle[]; // Sent only on welcome usually, but keeping it simple
}