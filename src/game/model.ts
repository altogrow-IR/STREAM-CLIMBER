export type Vec = { x: number; y: number };
export type Mode = "title" | "playing" | "paused" | "clear";
export interface BodyState {
  position: Vec;
  velocity: Vec;
  rotation: number;
  angularVelocity: number;
}
export interface Stats {
  elapsed: number;
  maxHeight: number;
  fallCount: number;
  maxFallDistance: number;
  totalFallDistance: number;
  peak: number;
  falling: boolean;
  fallStart: number;
}
export interface SaveData {
  version: 2;
  updatedAt: number;
  player: BodyState;
  mic: BodyState;
  cableLength: number;
  anchor: Vec | null;
  stats: Stats;
  cleared: boolean;
  bestTime: number | null;
  bestCheckpointTime: number | null;
  checkpointZone: number | null;
  respawns: number;
  tutorialStep: number;
}
export type LegacySaveData = Omit<
  SaveData,
  | "version"
  | "bestCheckpointTime"
  | "checkpointZone"
  | "respawns"
  | "tutorialStep"
> & { version: 1 };
export interface Settings {
  bgm: boolean;
  se: boolean;
  comments: boolean;
  shake: boolean;
}
export interface Hud extends Stats {
  progress: number;
  zone: number;
  cableLength: number;
  hooked: boolean;
  fps: number;
  position: Vec;
  velocity: Vec;
  bestTime: number | null;
  message: string;
  saveError: boolean;
  checkpointZone: number | null;
  respawns: number;
  tutorialStep: number;
  bestCheckpointTime: number | null;
}
export const PHYSICS = {
  step: 1 / 120,
  catchUp: 12,
  gravity: -13,
  playerMass: 2.5,
  micMass: 0.35,
  playerRadius: 0.42,
  micRadius: 0.19,
  playerFriction: 0.65,
  micFriction: 2.4,
  restitution: 0.03,
  airDrag: 0.35,
  cableMin: 0.55,
  cableMax: 4.5,
  tension: 180,
  damping: 17,
  maxTension: 230,
  aimSpring: 28,
  aimDamping: 5,
  maxAimForce: 45,
  reelSpeed: 4.2,
  swingForce: 80,
  fallThreshold: 3,
  saveInterval: 1,
  checkpointFallMargin: 3,
} as const;
export const WORLD_HEIGHT = 240;
export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
export const progress = (y: number) =>
  clamp(((y - 0.65) / WORLD_HEIGHT) * 100, 0, 100);
export const formatTime = (seconds: number) =>
  [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    Math.floor(seconds) % 60,
  ]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
export function initialStats(): Stats {
  return {
    elapsed: 0,
    maxHeight: 0.65,
    fallCount: 0,
    maxFallDistance: 0,
    totalFallDistance: 0,
    peak: 0.65,
    falling: false,
    fallStart: 0.65,
  };
}
export function updateFall(s: Stats, y: number, vy: number): number {
  s.maxHeight = Math.max(y, s.maxHeight);
  if (!s.falling) {
    s.peak = Math.max(s.peak, y);
    if (s.peak - y >= PHYSICS.fallThreshold && vy < -1) {
      s.falling = true;
      s.fallStart = s.peak;
      s.fallCount++;
    }
  }
  if (s.falling) {
    const distance = Math.max(0, s.fallStart - y);
    s.maxFallDistance = Math.max(s.maxFallDistance, distance);
    if (vy > -0.3) {
      s.totalFallDistance += distance;
      s.falling = false;
      s.peak = y;
      return distance;
    }
  } else if (vy > -0.3) s.peak = y;
  return 0;
}
