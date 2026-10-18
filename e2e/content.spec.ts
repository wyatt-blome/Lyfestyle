import { expect, test } from "@playwright/test";
import { onboard } from "./helpers";

const SESSIONS = ["A", "B", "C", "M", "Z", "DAILY10", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9"];
const PROTOCOLS = ["13:11", "16:8", "18:6", "20:4", "OMAD", "24 h", "36 h", "48 h", "Custom"];

test.beforeEach(async ({ page }) => onboard(page));

test("every session shows a why card with a chapter deep link", async ({ page }) => {
  for (const id of SESSIONS) {
    await page.goto(`/train/session?id=${id}`);
    const card = page.locator("article").first();
    await card.getByRole("button").first().click();
    const link = card.getByRole("link", { name: /^Open at \d/ }).first();
    await expect(link, id).toHaveAttribute("href", /youtube\.com\/watch\?v=.+&t=\d+s$/);
    await expect(card.getByText(/Summarized from official show notes\/chapter titles/)).toBeVisible();
  }
});

test("every protocol shows a why card with a chapter deep link", async ({ page }) => {
  await page.goto("/fast");
  for (const p of PROTOCOLS) {
    await page.getByRole("radio", { name: new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).click();
    const card = page.locator("article").first();
    await card.getByRole("button").first().click();
    await expect(card.getByRole("link", { name: /^Open at \d/ }).first(), p).toHaveAttribute("href", /&t=\d+s$/);
    await card.getByRole("button").first().click();
  }
});

test("the OMAD card shows its ⚠ line and the protein card says Experts disagree", async ({ page }) => {
  await page.goto("/why#why-fast-omad");
  await expect(page.locator("#why-fast-omad").getByText(/⚠ No verified show notes recommend OMAD/)).toBeVisible();
  await expect(page.locator("#why-protein").getByText("Experts disagree", { exact: true })).toBeVisible();
});

test("every exercise shows a demo or a clear follow-the-cues state, and Credits lists the sources", async ({ page }) => {
  await page.goto("/train/exercises");
  const hrefs = await page.locator('a[href^="/train/exercises/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  expect(hrefs.length).toBeGreaterThanOrEqual(43);
  for (const h of hrefs) {
    await page.goto(h);
    const demo = page.locator("figure img, figure video");
    const cues = page.getByText(/No demo: follow the cues/i);
    await expect(demo.or(cues).first(), h).toBeVisible();
  }
  await page.goto("/settings/credits");
  for (const s of ["ExerciseDB by AscendAPI", "wger.de", "Open Food Facts", "USDA FoodData Central", "The Diary Of A CEO"]) {
    await expect(page.getByText(s).first()).toBeVisible();
  }
});

test("the light theme sticks across a reload without a dark flash", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  // Read before hydration: the boot script in <head> must already have set it.
  await page.reload({ waitUntil: "commit" });
  await page.waitForSelector("body");
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "light");
});
