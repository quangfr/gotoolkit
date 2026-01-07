import { expect, test } from "@playwright/test";

test.describe("SVG Editor Layout", () => {
  test("left and right panels both visible", async ({ page }) => {
    const baseUrl = "http://127.0.0.1:5000";
    
    await page.goto(`${baseUrl}/svg.html`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Check both sections exist
    const leftSection = await page.locator("section.left").count();
    console.log(`✓ Left section exists: ${leftSection}`);
    expect(leftSection).toBe(1);

    const rightSection = await page.locator("section.right").count();
    console.log(`✓ Right section exists: ${rightSection}`);
    expect(rightSection).toBe(1);

    // Check if right panel is visible
    const rightIsVisible = await page.locator("section.right").isVisible();
    console.log(`✓ Right section is visible: ${rightIsVisible}`);
    expect(rightIsVisible).toBe(true);

    // Check bounding boxes
    const leftBox = await page.locator("section.left").boundingBox();
    const rightBox = await page.locator("section.right").boundingBox();
    
    console.log(`Left panel: x=${leftBox?.x}, y=${leftBox?.y}, width=${leftBox?.width}, height=${leftBox?.height}`);
    console.log(`Right panel: x=${rightBox?.x}, y=${rightBox?.y}, width=${rightBox?.width}, height=${rightBox?.height}`);

    // Verify right panel is to the right of left panel
    if (rightBox && leftBox) {
      expect(rightBox.x).toBeGreaterThan(leftBox.x);
      console.log(`✓ Right panel is positioned to the right of left panel`);
    }

    // Check app grid
    const appGrid = await page.locator(".app").evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        display: style.display,
        gridTemplateColumns: style.gridTemplateColumns,
        gap: style.gap,
      };
    });
    console.log("App grid computed style:", appGrid);
  });
});
