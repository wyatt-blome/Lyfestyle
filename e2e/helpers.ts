import { expect, type Page } from "@playwright/test";

/** First run: tick the disclaimer and start. */
export async function onboard(page: Page) {
  await page.goto("/");
  await page.getByLabel("I understand this is not medical advice.").check();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByText("Welcome to Fast & Move")).toBeHidden();
}

/** Visible text of the page with whitespace collapsed. */
export async function text(page: Page): Promise<string> {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

/** datetime-local value for `ms` ago, in the page's zone. */
export async function localAgo(page: Page, ms: number): Promise<string> {
  return page.evaluate((ago) => {
    const d = new Date(Date.now() - ago);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }, ms);
}

/** Tick every "Mark set done" button, waiting for each tap to land. */
export async function tickAllSets(page: Page) {
  await expect(page.getByRole("button", { name: "Mark set done" }).first()).toBeVisible();
  const total = await page.getByRole("button", { name: "Mark set done" }).count();
  for (let left = total; left > 0; left--) {
    await page.getByRole("button", { name: "Mark set done" }).first().click();
    await expect(page.getByRole("button", { name: "Mark set done" })).toHaveCount(left - 1);
  }
  return total;
}
