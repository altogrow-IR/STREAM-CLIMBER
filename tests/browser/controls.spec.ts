import { test, expect } from "@playwright/test";
import type { Engine } from "../../src/game/engine";
declare global {
  interface Window {
    climberDebug: Engine;
  }
}
test("mouse can throw, hook and reel the capsule upward", async ({ page }) => {
  await page.goto("/?debug=true");
  await page.getByRole("button", { name: /START STREAM/ }).click();
  await page.waitForTimeout(300);
  const point = await page.evaluate(() =>
    window.climberDebug.renderer.screen(
      { x: -1.3, y: 2.05 },
      window.climberDebug.camera,
    ),
  );
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  for (let i = 0; i < 20; i++) {
    const target = await page.evaluate(() =>
      window.climberDebug.renderer.screen(
        { x: -1.3, y: 2.05 },
        window.climberDebug.camera,
      ),
    );
    await page.mouse.move(target.x, target.y);
    await page.waitForTimeout(100);
    if (await page.evaluate(() => !!window.climberDebug.anchor)) break;
  }
  const before = await page.evaluate(() => ({
    p: { ...window.climberDebug.player.translation() },
    a: window.climberDebug.anchor,
  }));
  const reel = await page.evaluate(() =>
    window.climberDebug.renderer.screen(
      window.climberDebug.player.translation(),
      window.climberDebug.camera,
    ),
  );
  await page.mouse.move(reel.x, reel.y, { steps: 20 });
  await page.waitForTimeout(1600);
  const after = await page.evaluate(() => ({
    p: { ...window.climberDebug.player.translation() },
    a: window.climberDebug.anchor,
    max: window.climberDebug.stats.maxHeight,
  }));
  await page.screenshot({ path: "test-results/reel.png" });
  await page.mouse.up();
  expect(before.a).not.toBeNull();
  expect(after.max).toBeGreaterThan(1);
});
test("single finger input survives rotation and cancel", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto("/?debug=true");
  await page.getByRole("button", { name: /START STREAM/ }).click();
  const session = await context.newCDPSession(page);
  await page.waitForTimeout(300);
  const point = await page.evaluate(() =>
    window.climberDebug.renderer.screen(
      { x: -1.3, y: 2.05 },
      window.climberDebug.camera,
    ),
  );
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: point.x, y: point.y, id: 1 }],
  });
  for (let i = 0; i < 20; i++) {
    const target = await page.evaluate(() =>
      window.climberDebug.renderer.screen(
        { x: -1.3, y: 2.05 },
        window.climberDebug.camera,
      ),
    );
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: target.x, y: target.y, id: 1 }],
    });
    await page.waitForTimeout(100);
    if (await page.evaluate(() => !!window.climberDebug.anchor)) break;
  }
  expect(
    await page.evaluate(() => window.climberDebug.pointerId),
  ).not.toBeNull();
  const reel = await page.evaluate(() =>
    window.climberDebug.renderer.screen(
      window.climberDebug.player.translation(),
      window.climberDebug.camera,
    ),
  );
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: reel.x, y: reel.y, id: 1 }],
  });
  await page.waitForTimeout(1000);
  expect(
    await page.evaluate(() => window.climberDebug.stats.maxHeight),
  ).toBeGreaterThan(1);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/touch-portrait.png" });
  expect(await page.evaluate(() => window.climberDebug.pointerId)).toBeNull();
  await context.close();
});
