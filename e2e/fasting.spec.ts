import { expect, test } from "@playwright/test";
import { localAgo, onboard, text } from "./helpers";

const H = 3_600_000;

test("16:8 backdated 2 h, time stays right after 30 min away, Breakfast ends it at that time", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-19T14:00:00Z") });
  await onboard(page);
  await page.goto("/fast");
  await page.getByLabel("I started earlier (backdate)").check();
  await page.locator('input[type="datetime-local"]').fill(await localAgo(page, 2 * H));
  await page.getByRole("button", { name: "Start 16:8 fast" }).click();
  await expect(page.locator('[role="timer"]')).toContainText("2:00:");

  // "Lock the phone for 30 min": jump the clock with no timers firing in between.
  await page.clock.fastForward(30 * 60_000);
  await page.reload();
  await expect(page.locator('[role="timer"]')).toContainText("2:30:");
  await expect(page.locator('[role="timer"]')).toContainText("13:29:");

  // Fast-safe drinks don't prompt.
  await page.getByRole("button", { name: "+ Water 16 oz" }).click();
  await expect(page.getByText(/End fast at/)).toBeHidden();

  // Breakfast mid-fast prompts to end it, at the entry's time.
  await page.goto("/log");
  await page.getByRole("button", { name: "+ Add food or drink" }).click();
  await page.getByPlaceholder("Breakfast, eggs, protein shake…").fill("Breakfast");
  await page.getByLabel("Protein g").fill("40");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: /End fast at/ })).toBeVisible();
  await expect(page.getByText("Experts disagree", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "End fast", exact: true }).click();
  await expect(page.getByText("How did that fast feel?")).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();

  await page.goto("/fast/history");
  await expect(page.getByText(/2h 30m of 16 h/)).toBeVisible();
});

test("fasts over 24 h need the doctor note and show the stop-if-dizzy warning", async ({ page }) => {
  await onboard(page);
  await page.goto("/fast");
  await page.getByRole("radio", { name: /24 h/ }).click();
  await expect(page.getByRole("button", { name: "Start 24h fast" })).toBeEnabled();
  await page.getByRole("radio", { name: /36 h/ }).click();
  await expect(page.getByRole("button", { name: "Start 36h fast" })).toBeDisabled();
  await expect(page.getByText(/Stop the fast if you feel dizzy/)).toBeVisible();
  await page.getByText(/I've checked with my doctor/).click();
  await expect(page.getByRole("button", { name: "Start 36h fast" })).toBeEnabled();
});

test("the disclaimer shows on onboarding and on the fasting screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Not medical advice. Check with your doctor/).first()).toBeVisible();
  await onboard(page);
  await page.goto("/fast");
  await expect(page.getByText(/Not medical advice. Check with your doctor/)).toBeVisible();
});

test("backup: export → wipe → import restores everything", async ({ page }) => {
  await onboard(page);
  await page.goto("/fast");
  await page.getByRole("button", { name: "Start 16:8 fast" }).click();
  await page.getByRole("button", { name: "+ Black coffee" }).click();
  page.on("dialog", (d) => d.accept());
  await page.goto("/settings");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export backup (JSON)" }).click()]);
  const file = await download.path();
  await page.getByRole("button", { name: "Erase all data" }).click();
  await page.goto("/fast");
  await expect(page.getByText("Pick a protocol")).toBeVisible();
  await page.goto("/settings");
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText(/Restored \d+ records/)).toBeVisible();
  await page.goto("/fast");
  await expect(page.locator('[role="timer"]')).toBeVisible();
  await expect(page.getByText("Coffee", { exact: true })).toBeVisible();
});

test("Home, Fast and Train open offline", async ({ page, context }) => {
  await onboard(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  // Let the worker finish precaching.
  await page.waitForTimeout(3000);
  await context.setOffline(true);
  for (const [path, heading] of [
    ["/", "Fast & Move"],
    ["/fast", "Fast"],
    ["/train", "Train"],
    ["/train/session?id=A", "A · Bell & Carry"],
    ["/log", "Food & drink"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  }
  expect(await text(page)).not.toContain("ERR_INTERNET_DISCONNECTED");
});
