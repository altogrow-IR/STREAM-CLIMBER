import { test, expect } from "@playwright/test";
const key = "stream-climber-save-v1";
const body = (x: number, y: number, vy: number) => ({
  position: { x, y },
  velocity: { x: 0, y: vy },
  rotation: 0.1,
  angularVelocity: 0.2,
});
const fallingSave = {
  version: 2,
  updatedAt: 1,
  player: body(10, 75, -12),
  mic: body(11, 76, -12),
  cableLength: 3,
  anchor: null,
  stats: {
    elapsed: 40,
    maxHeight: 100,
    fallCount: 1,
    maxFallDistance: 25,
    totalFallDistance: 0,
    peak: 100,
    falling: true,
    fallStart: 100,
  },
  cleared: false,
  bestTime: null,
  bestCheckpointTime: null,
  checkpointZone: null,
  respawns: 0,
  tutorialStep: 4,
};
test("reload restores a fall in progress and preserves fall accounting", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key, data: fallingSave },
  );
  await page.reload();
  await page.getByRole("button", { name: /CONTINUE/ }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  const data = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!),
    key,
  );
  expect(data.player.position.y).toBeLessThan(75);
  expect(data.player.velocity.y).toBeLessThan(-12);
  expect(data.stats.fallCount).toBe(1);
  expect(data.stats.maxHeight).toBe(100);
});
test("cleared save survives title and reload", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(
    ({ key, data }) =>
      localStorage.setItem(
        key,
        JSON.stringify({ ...data, cleared: true, bestTime: 40 }),
      ),
    { key, data: fallingSave },
  );
  await page.reload();
  await page.getByRole("button", { name: /CONTINUE/ }).click();
  await expect(
    page.getByRole("heading", { name: /STREAM COMPLETE/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "タイトルへ", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /CONTINUE/ }).click();
  await expect(
    page.getByRole("heading", { name: /STREAM COMPLETE/ }),
  ).toBeVisible();
});
test("hidden document pauses and captures physical state", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /START STREAM/ }).click();
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByText("ひとやすみ。")).toBeVisible();
  expect(await page.evaluate((k) => !!localStorage.getItem(k), key)).toBe(true);
});
test("blocked storage and missing artwork keep the game usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error("denied");
    };
  });
  await page.route("**/assets/*.png", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: /START STREAM/ }).click();
  await expect(
    page.getByText("このブラウザでは進行状況を保存できません。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await expect(page.getByText("ひとやすみ。")).toBeVisible();
});
