import { test, expect } from "@playwright/test";

test("drag → region pin → save note → copy markdown contains region fields", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/examples/static-html/index.html");

  // Drag across the demo section (it contains <h2> and <p>)
  const section = page.locator("section");
  const sectionBox = await section.boundingBox();
  if (!sectionBox) throw new Error("section not found");

  await page.mouse.move(sectionBox.x + 5, sectionBox.y + 5);
  await page.mouse.down();
  await page.mouse.move(sectionBox.x + sectionBox.width - 5, sectionBox.y + sectionBox.height - 5, { steps: 10 });
  await page.mouse.up();

  // Region renders
  await expect(page.locator(".f2c-region")).toBeVisible();
  await expect(page.locator(".f2c-region-tag")).toHaveText("#1");

  // Popover opens after commit
  const popover = page.locator(".f2c-popover");
  await expect(popover).toBeVisible();

  // Type a note and save
  await popover.locator("textarea").fill("two-column on desktop");
  await popover.locator(".f2c-save").click();

  // Copy all, then read clipboard
  await page.locator(".f2c-copy").click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());

  expect(clipboard).toContain("## Pin #1");
  expect(clipboard).toContain("**Container:**");
  expect(clipboard).toContain("**Contains:**");
  expect(clipboard).toContain("**Size:**");
  expect(clipboard).toContain("two-column on desktop");
});

test("small click (≤6px) creates a point pin, not a region", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/examples/static-html/index.html");

  await page.mouse.move(300, 300);
  await page.mouse.down();
  await page.mouse.move(303, 302);
  await page.mouse.up();

  await expect(page.locator(".f2c-pin")).toBeVisible();
  await expect(page.locator(".f2c-region")).toHaveCount(0);
});
