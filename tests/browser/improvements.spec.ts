import { test, expect } from "@playwright/test";
import { CHECKPOINTS, checkpointPosition, STAGE } from "../../src/game/stage";
import { initialStats } from "../../src/game/model";
import type { SaveData } from "../../src/game/model";

const key = "stream-climber-save-v1";
const at = checkpointPosition(2);
const body = (x: number, y: number) => ({
  position: { x, y },
  velocity: { x: 0, y: 0 },
  rotation: 0,
  angularVelocity: 0,
});
const recoverySave: SaveData = {
  version: 2,
  updatedAt: 1,
  player: body(10, CHECKPOINTS[2].y - 3.5),
  mic: body(11, CHECKPOINTS[2].y - 3),
  anchor: null,
  cableLength: 4.5,
  stats: {
    ...initialStats(),
    elapsed: 123,
    maxHeight: 80,
    peak: 80,
    falling: true,
    fallStart: 80,
    fallCount: 1,
  },
  cleared: false,
  bestTime: 55,
  bestCheckpointTime: 72,
  checkpointZone: 2,
  respawns: 0,
  tutorialStep: 4,
};

test("recovery persists without erasing progress and records", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(
    ({ key, save }) => localStorage.setItem(key, JSON.stringify(save)),
    { key, save: recoverySave },
  );
  await page.reload();
  await page.getByRole("button", { name: /CONTINUE/ }).click();
  await expect(page.locator(".checkpoint-status")).toHaveCount(0);
  await expect(page.locator(".comments .fall-comment")).toContainText("チェックポイントから");
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    const comment = page.locator(".comments .fall-comment");
    await expect(comment).toBeVisible();
    await expect(comment).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(comment).toHaveCSS("color", "rgb(48, 66, 118)");
    await page.screenshot({
      path: `test-results/recovery-comment-${viewport.width}.png`,
      animations: "disabled",
    });
  }
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await expect(page.locator(".checkpoint-recovery")).toContainText("保存地点 03 / 08 · ギフトタワー");
  await expect(page.locator(".checkpoint-recovery")).toContainText("復帰 1回");
  const save = (await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    key,
  )) as SaveData;
  expect(save.player.position.x).toBeCloseTo(at.x, 1);
  expect(save.player.position.y).toBeCloseTo(at.y, 0);
  expect(save.stats.elapsed).toBeGreaterThanOrEqual(123);
  expect(save.stats.maxHeight).toBe(80);
  expect(save.stats.fallCount).toBe(1);
  expect(save.stats.totalFallDistance).toBeGreaterThan(20);
  expect(save.bestTime).toBe(55);
  expect(save.bestCheckpointTime).toBe(72);
  await page
    .getByRole("button", { name: "チェックポイントへ戻る", exact: true })
    .click();
  await expect(page.locator(".checkpoint-status")).toHaveCount(0);
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await expect(page.locator(".checkpoint-recovery")).toContainText("復帰 2回");
  await page.reload();
  await expect(page.locator(".continue-summary")).toContainText(
    "ギフトタワーで保存済み",
  );
  await page.getByRole("button", { name: /CONTINUE/ }).click();
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await expect(page.locator(".checkpoint-recovery")).toContainText("復帰 2回");
  await page.getByRole("button", { name: "最初から", exact: true }).click();
  await page.getByRole("button", { name: "最初から", exact: true }).click();
  await expect(page.locator(".checkpoint-status")).toHaveCount(0);
  const fresh = (await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    key,
  )) as SaveData;
  expect(fresh.checkpointZone).toBeNull();
  expect(fresh.respawns).toBe(0);
  expect(fresh.bestTime).toBe(55);
  expect(fresh.bestCheckpointTime).toBe(72);
});

test("legacy migration restores the exact in-flight state before play", async ({
  page,
}) => {
  const legacy = {
    version: 1,
    updatedAt: recoverySave.updatedAt,
    player: { ...body(10, 75), velocity: { x: 0.2, y: -12 } },
    mic: body(11, 76),
    cableLength: recoverySave.cableLength,
    anchor: null,
    stats: { ...recoverySave.stats, maxHeight: 100 },
    cleared: false,
    bestTime: recoverySave.bestTime,
  };
  await page.goto("/?debug=true");
  await page.evaluate(
    ({ key, save }) => localStorage.setItem(key, JSON.stringify(save)),
    { key, save: legacy },
  );
  await page.reload();
  await expect(page.getByRole("button", { name: /CONTINUE/ })).toBeEnabled();
  const snapshot = await page.evaluate(() => window.climberDebug.snapshot());
  expect(snapshot.version).toBe(2);
  expect(snapshot.player.position).toEqual(legacy.player.position);
  expect(snapshot.player.velocity.x).toBeCloseTo(0.2, 5);
  expect(snapshot.player.velocity.y).toBe(-12);
  expect(snapshot.stats).toEqual(legacy.stats);
  expect(snapshot.checkpointZone).toBe(3);
  expect(snapshot.bestTime).toBe(55);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).version,
      key,
    ),
  ).toBe(1);
});

test("a clear after recovery updates only the recovery record", async ({
  page,
}) => {
  const goal = STAGE[STAGE.length - 1];
  const save: SaveData = {
    ...recoverySave,
    player: body(goal.x, goal.y + 0.9),
    mic: body(goal.x + 0.4, goal.y + 1),
    stats: { ...initialStats(), elapsed: 123, maxHeight: goal.y + 0.9 },
    checkpointZone: 7,
    respawns: 2,
    bestCheckpointTime: null,
  };
  await page.goto("/");
  await page.evaluate(
    ({ key, save }) => localStorage.setItem(key, JSON.stringify(save)),
    { key, save },
  );
  await page.reload();
  await page.getByRole("button", { name: /CONTINUE/ }).click();
  await expect(
    page.getByRole("heading", { name: /STREAM COMPLETE/ }),
  ).toBeVisible();
  const completed = (await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    key,
  )) as SaveData;
  expect(completed.bestTime).toBe(55);
  expect(completed.bestCheckpointTime).toBeGreaterThanOrEqual(123);
  expect(completed.cleared).toBe(true);
  expect(completed.respawns).toBe(2);
});

test("checkpoint requires a landing; cancellation pauses and keeps the anchor safe", async ({
  page,
}) => {
  await page.goto("/?debug=true");
  await page.getByRole("button", { name: /START STREAM/ }).click();
  await page.evaluate(() => {
    const e = window.climberDebug;
    e.teleport(3);
    e.player.setTranslation(
      { x: e.player.translation().x + 8, y: e.player.translation().y },
      true,
    );
  });
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => window.climberDebug.checkpointZone),
  ).toBeNull();
  await page.evaluate(() => window.climberDebug.teleport(3));
  await expect
    .poll(() => page.evaluate(() => window.climberDebug.checkpointZone))
    .toBe(3);
  const point = await page.evaluate(() =>
    window.climberDebug.renderer.screen(
      {
        x: window.climberDebug.player.translation().x + 0.4,
        y: window.climberDebug.player.translation().y + 1,
      },
      window.climberDebug.camera,
    ),
  );
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.locator("canvas").dispatchEvent("pointercancel", { pointerId: 1 });
  await expect(
    page.getByRole("dialog", { name: "一時停止", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.climberDebug.pointerId)).toBeNull();
  const before = await page.evaluate(() => window.climberDebug.stats.elapsed);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.climberDebug.stats.elapsed)).toBe(
    before,
  );
  await page.mouse.up();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () => !!document.activeElement?.closest("[role=dialog]"),
      ),
    ).toBe(true);
  }
});

test("only title artwork loads before play and debug recovery never writes a save", async ({
  page,
}) => {
  const images: string[] = [];
  page.on("request", (request) => {
    if (/assets\/.*\.png/.test(request.url())) images.push(request.url());
  });
  await page.goto("/?debug=true");
  await expect(
    page.getByRole("button", { name: /START STREAM/ }),
  ).toBeEnabled();
  expect(images.some((url) => url.endsWith("player.png"))).toBe(false);
  expect(images.some((url) => url.endsWith("studio-sky.png"))).toBe(false);
  await page.getByRole("button", { name: /START STREAM/ }).click();
  await page.evaluate(() => window.climberDebug.teleport(4));
  await expect
    .poll(() => page.evaluate(() => window.climberDebug.checkpointZone))
    .toBe(4);
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await page
    .getByRole("button", { name: "チェックポイントへ戻る", exact: true })
    .click();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), key),
  ).toBeNull();
  expect(images.some((url) => url.endsWith("player.png"))).toBe(true);
});

for (const [width, height] of [
  [320, 568],
  [360, 640],
  [390, 844],
  [568, 320],
  [844, 390],
  [1280, 720],
]) {
  test(`readable UI and accessible menus at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: /START STREAM/ }),
    ).toBeEnabled();
    await page.waitForTimeout(850);
    const menu = await page.locator(".sub-menu").boundingBox();
    const footer = await page.locator(".title-footer").boundingBox();
    expect(menu!.y + menu!.height).toBeLessThanOrEqual(footer!.y);
    await expect(
      page.getByRole("button", { name: /HOW TO PLAY/ }),
    ).toBeInViewport();
    await page.screenshot({ path: `test-results/title-improved-${width}.png` });
    await page.getByRole("button", { name: /START STREAM/ }).click();
    expect(
      await page
        .locator(".control-hint small")
        .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
    ).toBeGreaterThanOrEqual(12);
    const pause = page.getByRole("button", { name: "一時停止", exact: true });
    expect((await pause.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `test-results/game-improved-${width}.png` });
    await pause.click();
    const pauseDialog = page.getByRole("dialog");
    const bounds = await pauseDialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(await pauseDialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/pause-improved-${width}.png`, animations: "disabled" });
    await page.getByRole("button", { name: "遊び方", exact: true }).click();
    await page
      .getByRole("button", { name: "操作ガイドをもう一度", exact: true })
      .click();
    await expect(page.locator(".lesson-count")).toContainText("1 / 4");
    await page.getByRole("button", { name: "一時停止", exact: true }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: /CONTINUE/ })).toBeEnabled();
    await page.waitForTimeout(850);
    const continuedMenu = await page.locator(".sub-menu").boundingBox();
    const continuedFooter = await page.locator(".title-footer").boundingBox();
    expect(continuedMenu!.y + continuedMenu!.height).toBeLessThanOrEqual(
      continuedFooter!.y,
    );
    const summary = await page.locator(".continue-summary").boundingBox();
    expect(summary!.y + summary!.height).toBeLessThanOrEqual(
      continuedFooter!.y,
    );
    expect(summary!.x + summary!.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `test-results/continue-improved-${width}.png`,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
