import { test, expect } from "@playwright/test";
import { STAGE } from "../../src/game/stage";
test("successive real throws climb beyond the first ledge", async ({
  page,
}) => {
  await page.goto("/?debug=true");
  await page.getByRole("button", { name: /START STREAM/ }).click();
  await page.waitForTimeout(500);
  for (const ledge of STAGE.slice(1, 3)) {
    const pos = await page.evaluate(() =>
      window.climberDebug.player.translation(),
    );
    const target = {
      x: ledge.x + (pos.x < ledge.x ? -1 : 1) * (ledge.w / 2 - 0.13),
      y: ledge.y + ledge.h / 2 + 0.12,
    };
    const point = await page.evaluate(
      (t) => window.climberDebug.renderer.screen(t, window.climberDebug.camera),
      target,
    );
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    for (let i = 0; i < 25; i++) {
      const pt = await page.evaluate(
        (t) =>
          window.climberDebug.renderer.screen(t, window.climberDebug.camera),
        target,
      );
      await page.mouse.move(pt.x, pt.y);
      await page.waitForTimeout(100);
      if (await page.evaluate(() => !!window.climberDebug.anchor)) break;
    }
    expect(await page.evaluate(() => !!window.climberDebug.anchor)).toBe(true);
    for (let i = 0; i < 12; i++) {
      const pt = await page.evaluate(() =>
        window.climberDebug.renderer.screen(
          window.climberDebug.player.translation(),
          window.climberDebug.camera,
        ),
      );
      await page.mouse.move(pt.x, pt.y);
      await page.waitForTimeout(100);
    }
    for (let i = 0; i < 30; i++) {
      const pt = await page.evaluate(() => {
        const e = window.climberDebug,
          p = e.player.translation();
        return e.renderer.screen({ x: p.x - 0.7, y: p.y }, e.camera);
      });
      await page.mouse.move(pt.x, pt.y);
      await page.waitForTimeout(100);
      const y = await page.evaluate(
        () => window.climberDebug.player.translation().y,
      );
      if (y > ledge.y + 0.8) break;
    }
    await page.mouse.up();
  }
  const h = await page.evaluate(() => window.climberDebug.stats.maxHeight);
  await page.screenshot({ path: "test-results/journey.png" });
  expect(h).toBeGreaterThan(4);
});
