import { expect, test } from "@playwright/test";

test("blockquote drag handle stays put on hover", async ({ page }) => {
  const baseUrl = "http://127.0.0.1:5000";
  await page.goto(`${baseUrl}/memo.html`, { waitUntil: "networkidle" });

  await page.waitForFunction(() => Boolean((window as any).MemoEditor));

  await page.evaluate(() => {
    const markdown = "> Important\n> Ceci est une citation\n\nTexte";
    (window as any).setEditorMarkdown(markdown);
  });

  const wrapper = page.locator('.alert-wrapper').first();
  await expect(wrapper).toBeAttached();
  await wrapper.scrollIntoViewIfNeeded();

  const box = await wrapper.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const readHandle = async () => {
    return page.evaluate(() => {
      const handle = document.querySelector('.quote-handle') as HTMLElement | null;
      if (!handle) return null;
      const top = parseFloat(handle.style.top || '0');
      const left = parseFloat(handle.style.left || '0');
      return { top, left };
    });
  };

  await page.mouse.move(box.x + 10, box.y + 10);
  await page.waitForTimeout(100);
  const first = await readHandle();
  expect(first).not.toBeNull();

  await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10);
  await page.waitForTimeout(100);
  const second = await readHandle();
  expect(second).not.toBeNull();

  if (!first || !second) return;

  expect(Math.abs(first.top - second.top)).toBeLessThan(2);
  expect(Math.abs(first.left - second.left)).toBeLessThan(2);
});
