import { test, expect } from "@playwright/test";
const key = "stream-climber-save-v1";
test("title, settings, start, pause, save and continue", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /START STREAM/ }),
  ).toBeEnabled();
  await page.screenshot({ path: "test-results/title-desktop.png" });
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page.getByLabel("BGM", { exact: true }).check();
  await page.getByRole("button", { name: "完了", exact: true }).click();
  await page.getByRole("button", { name: /START STREAM/ }).click();
  await page.waitForTimeout(1300);
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const s = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!),
    key,
  );
  expect(s.stats.elapsed).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByRole("button", { name: /CONTINUE/ })).toBeEnabled();
  await page.getByRole("button", { name: /CONTINUE/ }).click();
  await page.screenshot({ path: "test-results/game-desktop.png" });
  expect(errors).toEqual([]);
});
test("corrupt save and new game confirmation", async ({ page }) => {
  await page.addInitScript((k) => localStorage.setItem(k, "broken"), key);
  await page.goto("/");
  await expect(
    page.getByText(/保存データを読み込めませんでした/),
  ).toBeVisible();
  await page.getByRole("button", { name: /START STREAM/ }).click();
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await page.getByRole("button", { name: "最初から", exact: true }).click();
  await expect(
    page.getByText("現在の挑戦を最初からやり直しますか？"),
  ).toBeVisible();
  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.getByText("ひとやすみ。")).toBeVisible();
});
test("debug zones and complete presentation", async ({ page }) => {
  await page.goto("/?debug=true");
  await page.getByRole("button", { name: /START STREAM/ }).click();
  for (const zone of ["1", "2", "3", "4", "5", "6", "7"]) {
    await page.getByLabel("デバッグエリア").selectOption(zone);
    await page.waitForTimeout(150);
  }
  await page.getByRole("button", { name: "ゴール検証" }).click();
  await expect(
    page.getByRole("heading", { name: /STREAM COMPLETE/ }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/clear.png" });
});
for (const [width, height] of [
  [1280, 720],
  [1920, 1080],
  [390, 844],
  [844, 390],
  [412, 915],
  [915, 412],
])
  test(`viewport ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: /START STREAM/ }).click();
    await page.waitForTimeout(250);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    await page.screenshot({ path: `test-results/game-${width}x${height}.png` });
    await page.getByRole("button", { name: "一時停止", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /配信をつづける/ }),
    ).toBeInViewport();
  });
