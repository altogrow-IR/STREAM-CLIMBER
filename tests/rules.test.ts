import { describe, it, expect } from "vitest";
import {
  initialStats,
  updateFall,
  progress,
  formatTime,
  PHYSICS,
} from "../src/game/model";
import {
  CHECKPOINTS,
  checkpointPosition,
  STAGE,
  ZONES,
  zoneAt,
} from "../src/game/stage";
import { migrateSave, validSave } from "../src/game/save";
import type { LegacySaveData } from "../src/game/model";
describe("progress and fall accounting", () => {
  it("clamps progress and formats hours", () => {
    expect(progress(-8)).toBe(0);
    expect(progress(240.65)).toBe(100);
    expect(formatTime(3661)).toBe("01:01:01");
  });
  it("ignores small hops, counts one sustained fall, accumulates landing distance", () => {
    const s = initialStats();
    updateFall(s, 20, 0);
    updateFall(s, 19, -2);
    expect(s.fallCount).toBe(0);
    updateFall(s, 16, -5);
    updateFall(s, 10, -8);
    expect(s.fallCount).toBe(1);
    expect(updateFall(s, 5, 0)).toBe(15);
    expect(s.totalFallDistance).toBe(15);
    expect(s.maxFallDistance).toBe(15);
    updateFall(s, 5, 0);
    expect(s.fallCount).toBe(1);
  });
  it("keeps maximum altitude after descent", () => {
    const s = initialStats();
    updateFall(s, 30, 0);
    updateFall(s, 10, -10);
    expect(s.maxHeight).toBe(30);
  });
});
describe("continuous authored stage", () => {
  it("has all eight zones with no gap", () => {
    expect(new Set(STAGE.map((p) => p.zone)).size).toBe(8);
    expect(ZONES[0].start).toBe(0);
    ZONES.slice(1).forEach((z, i) => expect(z.start).toBe(ZONES[i].end));
    expect(zoneAt(100)).toBe(7);
  });
  it("successive platform edge distances stay within cable reach", () => {
    for (let i = 2; i < STAGE.length; i++) {
      const a = STAGE[i - 1],
        b = STAGE[i];
      const edgeGap = Math.max(0, Math.abs(b.x - a.x) - (a.w + b.w) / 2);
      expect(Math.hypot(edgeGap, b.y - a.y), `platform ${b.id}`).toBeLessThan(
        PHYSICS.cableMax,
      );
    }
  });
});
describe("save validation", () => {
  const b = {
    position: { x: 0, y: 1 },
    velocity: { x: 0, y: -15 },
    rotation: 0,
    angularVelocity: 0,
  };
  const save: LegacySaveData = {
    version: 1,
    updatedAt: 1,
    player: b,
    mic: b,
    cableLength: 3,
    anchor: null,
    stats: initialStats(),
    cleared: false,
    bestTime: null,
  };
  it("accepts falling physics states", () =>
    expect(validSave(save)).toBe(true));
  it("rejects corrupt, unknown-version, nonfinite and incomplete saves", () => {
    for (const s of [
      null,
      {},
      "bad",
      { ...save, version: 3 },
      { ...save, cableLength: -1 },
      { ...save, player: { ...b, rotation: Infinity } },
      { ...save, stats: {} },
    ])
      expect(validSave(s)).toBe(false);
  });
  it("migrates old progress without changing physics, falls or records", () => {
    const old = {
      ...save,
      bestTime: 88,
      stats: {
        ...initialStats(),
        maxHeight: 60,
        elapsed: 42,
        fallCount: 2,
        falling: true,
      },
    };
    const next = migrateSave(old);
    expect(next.version).toBe(2);
    expect(next.player).toEqual(old.player);
    expect(next.stats).toEqual(old.stats);
    expect(next.bestTime).toBe(88);
    expect(next.bestCheckpointTime).toBeNull();
    expect(next.checkpointZone).toBe(2);
    expect(validSave(next)).toBe(true);
  });
  it("rejects invalid recovery data and preserves current-format saves", () => {
    const next = migrateSave(save);
    for (const invalid of [
      { ...next, checkpointZone: -1 },
      { ...next, checkpointZone: 8 },
      { ...next, checkpointZone: 1.2 },
      { ...next, respawns: -1 },
      { ...next, tutorialStep: 5 },
      { ...next, bestCheckpointTime: Infinity },
    ])
      expect(validSave(invalid)).toBe(false);
    expect(migrateSave(next)).toEqual(next);
  });
});
describe("checkpoint safety", () => {
  it("provides a flat, wide, non-slippery recovery platform in every area", () => {
    expect(CHECKPOINTS).toHaveLength(8);
    for (const cp of CHECKPOINTS) {
      expect(cp.angle).toBe(0);
      expect(cp.slippery).toBe(false);
      expect(cp.w).toBeGreaterThanOrEqual(2.9);
      const spawn = checkpointPosition(cp.zone);
      expect(spawn.y - PHYSICS.playerRadius).toBeGreaterThan(cp.y + cp.h / 2);
      expect(spawn.x).toBe(cp.x);
    }
  });
});
