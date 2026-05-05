import { test, expect } from "@playwright/test";

test("place a pin, copy markdown, see it in clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/examples/static-html/index.html");

  // toolbar mounts
  await expect(page.locator("[data-f2c-toolbar]")).toBeVisible();

  // place a pin via the page API (avoids brittle DOM clicks during port-in-progress)
  await page.evaluate(() => {
    // @ts-ignore
    window.__f2c.savePin({ id: "p1", target: "<h1> Demo page", note: "make hero bolder", ts: Date.now(), x: 100, y: 100 });
  });

  // copy markdown
  // @ts-ignore
  await page.evaluate(() => window.__f2c.copyMarkdown());

  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("# Feedback on /examples/static-html/index.html");
  expect(clip).toContain("**Note:**");
  expect(clip).toContain("make hero bolder");
});
