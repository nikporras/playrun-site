import { test, expect, devices } from "@playwright/test";

/**
 * Home on a phone: a real device profile (touch, mobile viewport, 390 by 844). The reveals must
 * never leave a heading clipped, the first screen must hold the button, the HUD must stay slim.
 */
test.use({ ...devices["Pixel 7"], viewport: { width: 390, height: 844 } });

test.describe("Home on a phone", () => {
  test("every level heading is revealed on a phone, and the first screen holds the button", async ({
    page,
  }) => {
    await page.goto("/");
    const button = page.getByRole("link", { name: "Get in touch" }).first();
    const box = await button.boundingBox();
    const hud = await page.evaluate(
      () => document.querySelector("#hud")?.getBoundingClientRect().height ?? 0,
    );
    expect(box, "the hero button has a box").not.toBeNull();
    expect(
      box!.y + box!.height,
      "Get in touch sits on the first screen above the HUD",
    ).toBeLessThanOrEqual(844 - hud);

    const heads = page.locator("[data-level] h1, [data-level] h2");
    const n = await heads.count();
    expect(n).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < n; i++) {
      const h = heads.nth(i);
      await h.scrollIntoViewIfNeeded();
      await expect(h).toBeVisible();
      await expect
        .poll(() => h.evaluate((el) => getComputedStyle(el).clipPath), {
          message: `heading ${i} is not clipped`,
        })
        .toMatch(/^(none|inset\(0(px)?\))$/);
      const r = await h.boundingBox();
      expect(r && r.width > 0 && r.height > 0, `heading ${i} has a box`).toBe(
        true,
      );
    }
  });

  test("the HUD is one slim row and the Games button opens the panel", async ({
    page,
  }) => {
    await page.goto("/");
    const hud = page.locator("#hud");
    await expect(hud).toBeVisible();
    const h = await hud.evaluate((el) => el.getBoundingClientRect().height);
    expect(h).toBeLessThanOrEqual(48);
    await expect(page.locator(".hud__panel")).toBeHidden();
    await page.getByRole("button", { name: "Games", exact: true }).tap();
    await expect(page.locator(".hud__panel")).toBeVisible();
    await expect(page.locator("[data-hud-bugs]")).toBeVisible();
    await page.getByRole("button", { name: "Games", exact: true }).tap();
    await expect(page.locator(".hud__panel")).toBeHidden();
  });

  test("phone bugs sit in the top right corner of their level and the final level has none", async ({
    page,
  }) => {
    await page.goto("/");
    const bugs = page.locator("[data-bug]:visible");
    expect(await bugs.count()).toBe(4);
    expect(await page.locator(".final [data-bug]").count()).toBe(0);
    for (const b of await bugs.all()) {
      const near = await b.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const level = el.closest("[data-level]")!.getBoundingClientRect();
        return level.right - r.right < 24 && r.top - level.top < 24;
      });
      expect(near).toBe(true);
    }
  });
});
