import { expect, test } from "@playwright/test";
import { localAgo, onboard, text, tickAllSets } from "./helpers";

// 2026-10-19 is a Monday; 09:00 in Denver.
const MONDAY = new Date("2026-10-19T15:00:00Z");
const FRIDAY = new Date("2026-10-23T15:00:00Z");

test("Monday shows A, and Short Day is its 20-min version", async ({ page }) => {
  await page.clock.install({ time: MONDAY });
  await onboard(page);
  await expect(page.getByText("A · Bell & Carry")).toBeVisible();
  await page.goto("/train");
  await page.getByRole("button", { name: /Short Day/ }).click();
  await expect(page).toHaveURL(/v=short/);
  await expect(page.getByText("20 min", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "McGill Big 3" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^S&S/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Block 2/ })).toHaveCount(0);
});

test("the swing moves to one-hand after 2 qualifying sessions", async ({ page }) => {
  await page.clock.install({ time: MONDAY });
  await onboard(page);
  for (let n = 0; n < 2; n++) {
    await page.goto("/train/log?id=A&v=full&d=0");
    await tickAllSets(page);
    await page.getByRole("button", { name: "Finish" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "7", exact: true }).click();
    await page.getByRole("button", { name: "Save session" }).click();
    await expect(page).toHaveURL(/\/train$/);
  }
  await page.goto("/train/program");
  await expect(page.getByText("One-hand alternating 10×10, crisp")).toBeVisible();
  await page.goto("/train/session?id=A");
  await expect(page.getByText("One-hand kettlebell swing")).toBeVisible();
});

test("Q1: 3:00 prep, 15 one-minute rounds swing → clean & press → goblet squat, survives 2 min in the background", async ({ page }) => {
  await page.clock.install({ time: FRIDAY });
  await onboard(page);
  await page.goto("/train/quick");
  await expect(page.getByText("Next in the cycle")).toBeVisible();
  await page.getByRole("button", { name: "Start Q1" }).click();
  await expect(page.getByText("Prep", { exact: true }).first()).toBeVisible();
  await expect(page.locator('[role="timer"]')).toHaveText(/0[23]:\d\d/);

  await page.clock.runFor(181_000);
  await expect(page.getByText("EMOM 15 · 1/15")).toBeVisible();
  await expect(page.getByText("Two-hand kettlebell swing")).toBeVisible();
  await page.clock.runFor(60_000);
  await expect(page.getByText("Single-arm kettlebell press")).toBeVisible();
  await expect(page.getByText("clean + press", { exact: false })).toBeVisible();

  // Two minutes away with no timers firing, then a reload: still on time.
  await page.clock.fastForward(120_000);
  await page.reload();
  await expect(page.getByText("EMOM 15 · 4/15")).toBeVisible();
  await expect(page.getByText("Two-hand kettlebell swing")).toBeVisible();
});

test("the Q4 score saves and the next Q4 shows it", async ({ page }) => {
  await page.clock.install({ time: FRIDAY });
  await onboard(page);
  await page.goto("/train/quick?id=Q4");
  await page.getByRole("button", { name: "Start Q4" }).click();
  await page.clock.runFor(181_000);
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "+1" }).click();
  await expect.poll(() => text(page)).toContain("Rounds 5");
  await page.clock.runFor(1_100_000);
  await expect(page.getByRole("heading", { name: "Nice work" })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.goto("/train/quick?id=Q4");
  await expect(page.getByText("Last Q4: 5 rounds")).toBeVisible();
});

test("during a fast over 24 h, Train shows only easy options", async ({ page }) => {
  await page.clock.install({ time: MONDAY });
  await onboard(page);
  await page.goto("/fast");
  await page.getByRole("radio", { name: /24 h/ }).click();
  await page.getByLabel("I started earlier (backdate)").check();
  await page.locator('input[type="datetime-local"]').fill(await localAgo(page, 25 * 3_600_000));
  await page.getByRole("button", { name: "Start 24h fast" }).click();
  await expect(page.locator('[role="timer"]')).toBeVisible();
  await page.goto("/train");
  await expect(page.getByRole("heading", { name: "Easy options" })).toBeVisible();
  const t = await text(page);
  expect(t).not.toContain("C · Norwegian 4×4");
  expect(t).not.toContain("Q5 ·");
  expect(t).toContain("M · Mobility & Core");
  await page.goto("/train/quick?id=Q5");
  await expect(page.getByText(/Quick 20s are off today/)).toBeVisible();
  await page.goto("/train/session?id=C");
  await expect(page.getByRole("button", { name: /^Start/ })).toBeDisabled();
});

test("week 6 is flagged as a deload", async ({ page }) => {
  await page.clock.install({ time: MONDAY });
  await onboard(page);
  await page.clock.setSystemTime(new Date("2026-11-23T15:00:00Z"));
  await page.goto("/train/program");
  await expect.poll(() => text(page)).toContain("Cycle week 6/6");
  await page.goto("/train");
  await expect(page.getByText("Deload", { exact: true }).first()).toBeVisible();
});

test("ending a Quick 20 early saves a partial session", async ({ page }) => {
  await page.clock.install({ time: FRIDAY });
  await onboard(page);
  page.on("dialog", (d) => d.accept());
  await page.goto("/train/quick?id=Q1");
  await page.getByRole("button", { name: "Start Q1" }).click();
  await page.clock.runFor(5 * 60_000 + 1_000);
  await page.getByRole("button", { name: "End" }).click();
  await expect(page.getByText("Ended early: partial session")).toBeVisible();
  await expect(page.getByLabel("Rounds done")).toHaveValue("2");
});

test("hard sessions can't be reached by URL during a fast over 24 h", async ({ page }) => {
  await page.clock.install({ time: MONDAY });
  await onboard(page);
  await page.goto("/fast");
  await page.getByRole("radio", { name: /36 h/ }).click();
  await page.getByText(/I've checked with my doctor/).click();
  await page.getByRole("button", { name: "Start 36h fast" }).click();
  await expect(page.locator('[role="timer"]')).toBeVisible();
  for (const url of ["/train/4x4", "/train/log?id=A", "/train/follow?id=B"]) {
    await page.goto(url);
    await expect(page.getByText(/Hard sessions are off/), url).toBeVisible();
  }
  // M still runs, without its 40 lb suitcase march.
  await page.goto("/train/session?id=M");
  await expect(page.getByText("the 40 lb carries are left out today")).toBeVisible();
  await expect(page.getByText("Suitcase march in place")).toHaveCount(0);
});
