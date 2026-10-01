/* global console, window, PointerEvent, process */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  page.on("console", (message) => {
    if (message.type() === "log") console.log(message.text());
  });
  await page.goto("http://localhost:5183/?debug=true");
  await page.getByRole("button", { name: /START STREAM/ }).click();
  const result = await page.evaluate(
    async ({ limit, first }) => {
      const { STAGE } = await import("/src/game/stage.ts");
      const e = window.climberDebug;
      e.mode = "paused";
      const aim = (target) => {
        e.pointer = e.renderer.screen(target, e.camera);
        e.step(1 / 120);
      };
      const release = () => {
        e.pointerId = 1;
        e.canvas.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
      };
      const attempts = [];
      for (let index = first; index < STAGE.length && index <= limit; index++) {
        const previous = STAGE[index - 1],
          required = STAGE[index];
        let passed = false;
        let recipe = null;
        for (const next of STAGE.slice(index, index + 3)) {
          for (let variant = 0; variant < 120; variant++) {
            const side =
              (previous.x < next.x ? -1 : 1) * (variant % 2 ? -1 : 1);
            const start = {
              x:
                index === 1
                  ? -1.5
                  : previous.x +
                    (variant >= 12
                      ? side * Math.min(previous.w * 0.3, 0.5)
                      : 0),
              y: previous.y + previous.h / 2 + 0.46,
            };
            const snapshot = e.snapshot();
            e.restore({
              ...snapshot,
              player: {
                position: start,
                velocity: { x: 0, y: 0 },
                rotation: 0,
                angularVelocity: 0,
              },
              mic: {
                position: { x: start.x + 0.65, y: start.y + 0.15 },
                velocity: { x: 0, y: 0 },
                rotation: 0,
                angularVelocity: 0,
              },
              anchor: null,
              checkpointZone: null,
              stats: { ...snapshot.stats, falling: false, peak: start.y },
            });
            e.mode = "paused";
            e.cableLength = 4.5;
            const top = next.y + next.h / 2;
            const edge = next.x + (side * next.w) / 2;
            let approach = 0;
            for (let i = 0; i < 480 && !e.anchor; i++) {
              const m = e.mic.translation();
              if ((m.x - edge) * side > 0.24) approach = Math.max(approach, 1);
              if (m.y > top + 0.22) approach = 2;
              aim({
                x: edge + side * (approach === 2 ? 0.08 : 0.48),
                y:
                  approach === 0
                    ? Math.min(start.y + 0.1, top - 0.45)
                    : top + (approach === 2 ? 0.17 : 0.55),
              });
            }
            if (!e.anchor || Math.abs(e.anchor.y - top) > 0.8) {
              release();
              continue;
            }
            for (let i = 0; i < [120, 60, 20][Math.floor(variant / 4) % 3]; i++)
              aim(e.player.translation());
            let rose = false;
            let seed = index * 991 + variant * 277;
            const random = () => {
              seed = (seed * 1664525 + 1013904223) >>> 0;
              return seed / 4294967296;
            };
            let radius = variant % 4 >= 2 ? 1.1 : 0.55;
            let direction = side;
            for (let i = 0; i < (variant >= 24 ? 720 : 420); i++) {
              const p = e.player.translation();
              if (p.y > top + 0.47) rose = true;
              if (variant >= 24 && i % 60 === 0) {
                radius = [0.5, 0.7, 1, 1.4, 1.8, 2.2][Math.floor(random() * 6)];
                direction = random() > 0.2 ? side : -side;
              }
              aim({ x: p.x + direction * radius, y: p.y });
              const v = e.player.linvel();
              if (
                rose &&
                p.y > top + 0.43 &&
                (p.x - next.x) * side < next.w / 2 - 0.05 &&
                v.x * side < 0
              )
                break;
            }
            release();
            for (let i = 0; i < 150; i++) {
              e.pointer = null;
              e.step(1 / 120);
              const p = e.player.translation(),
                v = e.player.linvel();
              if (
                p.y >= required.y + required.h / 2 + 0.3 &&
                Math.abs(v.y) < 1.5 &&
                STAGE.some(
                  (platform) =>
                    platform.y >= required.y &&
                    Math.abs(p.x - platform.x) < platform.w / 2 &&
                    Math.abs(p.y - platform.y - platform.h / 2 - 0.42) < 0.12,
                )
              ) {
                passed = true;
                break;
              }
            }
            if (passed) {
              recipe = {
                targetId: next.id,
                variant,
                start,
                swingSeed: index * 991 + variant * 277,
              };
              break;
            }
          }
          if (passed) break;
        }
        attempts.push({ id: required.id, zone: required.zone, passed, recipe });
      }
      return {
        mode: "individual passages from the previous platform to the target or a higher platform, with state reset between attempts; not a continuous playthrough",
        total: attempts.length,
        passed: attempts.filter((a) => a.passed).length,
        failed: attempts.filter((a) => !a.passed),
        attempts,
      };
    },
    {
      limit: Number(process.argv[2] ?? 1000),
      first: Number(process.argv[3] ?? 1),
    },
  );
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/route-report.json",
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify({
      total: result.total,
      passed: result.passed,
      failed: result.failed,
    }),
  );
  if (result.failed.length) process.exitCode = 1;
} finally {
  await browser.close();
}
