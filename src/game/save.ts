import {
  PHYSICS,
  type LegacySaveData,
  type SaveData,
  type Settings,
} from "./model";
import { CHECKPOINTS } from "./stage";
export const SAVE_KEY = "stream-climber-save-v1";
const SETTINGS_KEY = "stream-climber-settings-v1";
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object";
const vec = (v: unknown) =>
  record(v) &&
  finite(v.x) &&
  finite(v.y) &&
  Math.abs(v.x) < 1000 &&
  Math.abs(v.y) < 1000;
const body = (v: unknown) =>
  record(v) &&
  vec(v.position) &&
  vec(v.velocity) &&
  finite(v.rotation) &&
  finite(v.angularVelocity);
export function validSave(v: unknown): v is SaveData | LegacySaveData {
  if (
    !record(v) ||
    (v.version !== 1 && v.version !== 2) ||
    !body(v.player) ||
    !body(v.mic) ||
    !finite(v.cableLength) ||
    v.cableLength < PHYSICS.cableMin ||
    v.cableLength > PHYSICS.cableMax ||
    !record(v.stats)
  )
    return false;
  const s = v.stats;
  return (
    [
      "elapsed",
      "maxHeight",
      "fallCount",
      "maxFallDistance",
      "totalFallDistance",
      "peak",
      "fallStart",
    ].every((k) => finite(s[k]) && Math.abs(s[k] as number) < 1e9) &&
    (s.elapsed as number) >= 0 &&
    (s.fallCount as number) >= 0 &&
    typeof s.falling === "boolean" &&
    typeof v.cleared === "boolean" &&
    finite(v.updatedAt) &&
    (v.anchor === null || vec(v.anchor)) &&
    (v.bestTime === null || (finite(v.bestTime) && v.bestTime >= 0)) &&
    (v.version === 1 ||
      ((v.bestCheckpointTime === null ||
        (finite(v.bestCheckpointTime) && v.bestCheckpointTime >= 0)) &&
        (v.checkpointZone === null ||
          (finite(v.checkpointZone) &&
            Number.isInteger(v.checkpointZone) &&
            v.checkpointZone >= 0 &&
            v.checkpointZone < CHECKPOINTS.length)) &&
        finite(v.respawns) &&
        Number.isInteger(v.respawns) &&
        v.respawns >= 0 &&
        finite(v.tutorialStep) &&
        Number.isInteger(v.tutorialStep) &&
        v.tutorialStep >= 0 &&
        v.tutorialStep <= 4))
  );
}
export function migrateSave(data: SaveData | LegacySaveData): SaveData {
  if (data.version === 2) return data;
  // Old records retain their exact physics state; only recovery destinations are added.
  const reached = CHECKPOINTS.filter(
    (p) => p.y + p.h / 2 + PHYSICS.playerRadius <= data.stats.maxHeight,
  );
  return {
    ...data,
    version: 2,
    bestCheckpointTime: null,
    checkpointZone: reached.at(-1)?.zone ?? null,
    respawns: 0,
    tutorialStep: data.stats.maxHeight > 4 ? 4 : 0,
  };
}
export function loadSave(): { data: SaveData | null; warning: string } {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { data: null, warning: "" };
    const data: unknown = JSON.parse(raw);
    return validSave(data)
      ? { data: migrateSave(data), warning: "" }
      : {
          data: null,
          warning:
            "保存データを読み込めませんでした。新しい挑戦を開始できます。",
        };
  } catch {
    return {
      data: null,
      warning:
        "保存データを読み込めませんでした。このブラウザでは保存が制限されている可能性があります。",
    };
  }
}
export function writeSave(data: SaveData): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
export const defaultSettings: Settings = {
  bgm: false,
  se: true,
  comments: true,
  shake: true,
};
export function loadSettings(): Settings {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    const s = { ...defaultSettings };
    if (record(v))
      for (const k of Object.keys(s) as (keyof Settings)[])
        if (typeof v[k] === "boolean") s[k] = v[k];
    return s;
  } catch {
    return { ...defaultSettings };
  }
}
export function writeSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* Settings remain usable for this session. */
  }
}
