import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 45000,
  use: { baseURL: "http://localhost:5183", channel: "msedge", headless: true },
  workers: 1,
  reporter: "list",
});
