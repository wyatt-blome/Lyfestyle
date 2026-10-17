#!/usr/bin/env node
/**
 * Browser tests for the acceptance criteria (docs/SPEC.md Part 8), against a production build.
 *
 *   npm run build && npm run test:e2e
 *
 * Playwright is installed on first run into .e2e-tools (git-ignored), not into package.json, so
 * the app's dependencies stay as they are (DECISIONS D25). Set PW_CHROMIUM to use an installed
 * Chromium; otherwise Playwright's own is downloaded once.
 */
import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const tools = join(root, ".e2e-tools");
const bin = join(tools, "node_modules/.bin/playwright");
const PORT = process.env.E2E_PORT ?? "3123";

if (!existsSync(bin)) {
  console.log("[e2e] installing Playwright into .e2e-tools …");
  execSync(`npm install --no-save --no-audit --no-fund --prefix "${tools}" @playwright/test@1.56.1`, { stdio: "inherit" });
}
if (!process.env.PW_CHROMIUM) execSync(`"${bin}" install chromium${process.env.CI ? " --with-deps" : ""}`, { stdio: "inherit", cwd: root });
if (!existsSync(join(root, ".next/BUILD_ID"))) {
  console.error("[e2e] no production build: run `npm run build` first");
  process.exit(1);
}

const server = spawn(join(root, "node_modules/.bin/next"), ["start", "-p", PORT], { cwd: root, stdio: "ignore" });
const stop = () => server.kill("SIGTERM");
process.on("exit", stop);

const base = `http://localhost:${PORT}`;
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {
    // not up yet
  }
  await new Promise((r) => setTimeout(r, 500));
}

const run = spawn(bin, ["test", "-c", "e2e/playwright.config.ts", ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, NODE_PATH: join(tools, "node_modules"), E2E_BASE: base },
});
run.on("exit", (code) => {
  stop();
  process.exit(code ?? 1);
});
