import { expect, test } from "@playwright/test";

test("hub code 9RQT opens capture modal", async ({ page }) => {
  await page.goto("/mobile.html", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /Go-Toolkit Hub/i })).toBeVisible();

  await page.click("#scanCodeBtn");
  await expect(page.locator("#codeModal")).toHaveClass(/open/);

  await page.fill("#codeInput", "9RQT");
  await page.click("#codeSubmitBtn");

  await expect(page.locator("#codeModal")).not.toHaveClass(/open/);
  await expect(page.locator("#captureModal")).toHaveClass(/open/);
  await expect(page.locator("#captureDocTitle")).toHaveText(/Doc 1/i);
});
