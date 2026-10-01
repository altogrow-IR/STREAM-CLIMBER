/* global console, URL, performance, requestAnimationFrame */
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const root = resolve("dist");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (!p.startsWith("/stream-climber/")) {
      res.writeHead(404).end();
      return;
    }
    const path = resolve(
      root,
      p.slice("/stream-climber/".length) || "index.html",
    );
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    const data = await readFile(path);
    res
      .writeHead(200, {
        "Content-Type": mime[extname(path)] || "application/octet-stream",
      })
      .end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  const errors = [],
    external = [],
    failed = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith(`http://127.0.0.1:${port}`)) external.push(r.url());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(r.url());
  });
  await mkdir("test-results", { recursive: true });
  await page.goto(`http://127.0.0.1:${port}/stream-climber/`);
  await page
    .getByRole("button", { name: /START STREAM/ })
    .waitFor({ state: "visible" });
  await page.waitForTimeout(700);
  await page.screenshot({ path: "test-results/production-title.png" });
  await page.getByRole("button", { name: /START STREAM/ }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "test-results/production-game.png" });
  const timing = await page.evaluate(async () => {
    const times = [];
    let last = performance.now();
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const now = performance.now();
      times.push(now - last);
      last = now;
    }
    times.sort((a, b) => a - b);
    return {
      medianFrameMs: times[60],
      p95FrameMs: times[114],
      estimatedMedianFps: 1000 / times[60],
    };
  });
  await page.reload();
  await page
    .getByRole("button", { name: /CONTINUE/ })
    .waitFor({ state: "visible" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: "test-results/production-title-mobile.png" });
  await page.getByRole("button", { name: /CONTINUE/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/production-mobile.png" });
  // The host antivirus injects its own script into local HTTP pages; keep it separate from application dependencies.
  const environmentInjectedHosts = [
    ...new Set(
      external
        .map((u) => new URL(u).hostname)
        .filter((h) => h === "me.kis.v2.scr.kaspersky-labs.com"),
    ),
  ];
  const appExternalRequests = external.filter(
    (u) => new URL(u).hostname !== "me.kis.v2.scr.kaspersky-labs.com",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(appExternalRequests, []);
  assert.deepEqual(failed, []);
  const report = {
    subdirectory: "/stream-climber/",
    consoleErrors: errors,
    appExternalRequests,
    environmentInjectedHosts,
    failedRequests: failed,
    timing,
  };
  await writeFile(
    "test-results/production-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(report);
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
