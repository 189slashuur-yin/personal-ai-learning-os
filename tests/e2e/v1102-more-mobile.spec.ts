import { expect, test } from "@playwright/test";

test("More menu stays within a narrow viewport and closes with Escape or outside click", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 320 });
  await page.goto("/");
  const pageWidthBefore = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.getByRole("button", { name: "More", exact: true }).click();
  const menu = page.locator('div[style*="z-index: 9999"]');
  await expect(menu).toBeVisible();
  const bounds = await menu.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(pageWidthBefore);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await expect(menu).toHaveCount(0);
});
