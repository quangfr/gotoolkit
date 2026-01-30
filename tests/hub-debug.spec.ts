import { expect, test } from "@playwright/test";

test("hub code 6NQR scan with test data", async ({ page }) => {
  // Use a longer timeout for the whole test
  test.setTimeout(120_000);

  const baseUrl = "http://127.0.0.1:5000";

  // Mock share worker responses to avoid actual network calls and use the requested code
  await page.addInitScript(() => {
    (window as any)._handoffMocksEnabled = true;

    // We will override fetch in the page to intercept share-proxy calls
    const originalFetch = window.fetch;
    (window as any).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : (input as any).url || input.toString();
      if (typeof url === "string" && url.includes("/shares/codes_map/6NQR")) {
        console.log("Mocking fetch for code 6NQR");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            payload: {
              docId: "doc-test-123",
              title: "Test Document"
            }
          })
        } as any;
      }
      
      if (typeof url === "string" && url.includes("/shares/codes_map/6NQR") && init?.method === "DELETE") {
        return { ok: true, status: 200, json: async () => ({}) } as any;
      }

      // Mock OCR response
      if (typeof url === "string" && url.includes("https://openrouter.ai/api/v1/chat/completions")) {
         return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{
              message: {
                content: "This is the OCR data from test image."
              }
            }]
          })
        } as any;
      }

      return originalFetch(input, init);
    };
  });

  await page.goto(`${baseUrl}/hub.html`, { waitUntil: "networkidle" });
  
  // Log the page title and some content to debug
  const title = await page.title();
  console.log("Page Title:", title);
  
  // Wait for the button instead of heading
  await page.waitForSelector("#scanCodeBtn", { timeout: 10000 });

  // Click on enter code button
  await page.click("#scanCodeBtn");
  await expect(page.locator("#codeModal")).toHaveClass(/open/);

  // Fill the specific code 6NQR
  await page.fill("#codeInput", "6NQR");
  
  // Submit code
  await page.click("#codeSubmitBtn");

  // Code modal should close and capture modal should open
  await expect(page.locator("#codeModal")).not.toHaveClass(/open/);
  await expect(page.locator("#captureModal")).toHaveClass(/open/);
  await expect(page.locator("#captureDocTitle")).toHaveText(/Test Document/i);

  // --- Scan with test data ---
  // The test data scan usually involves selecting a file
  // We need to find the captureInput and upload a file
  const fileInput = page.locator("#captureInput");
  
  // Use a dummy png/jpg content for testing OCR locally if possible
  // Or just mock the file upload behavior if we can't easily provide a real image
  // Here we'll try to provide a minimal valid image buffer
  const pixelBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
  const buffer = Buffer.from(pixelBase64, 'base64');
  
  await fileInput.setInputFiles({
    name: 'test.png',
    mimeType: 'image/png',
    buffer: buffer
  });

  // Wait for the OCR process to complete
  // The UI should show a loader and then the results
  await expect(page.locator("#captureLoader")).toBeVisible();
  
  // Wait for the loader to disappear or for step 2 (review) to appear
  // Depending on how scan.js is structured
  // In scan.js handleCaptureFiles calls runOcr
  await expect(page.locator("#captureLoader")).not.toBeVisible({ timeout: 60000 });
  
  // Check if we are at step 2
  await expect(page.locator("#captureStep2")).toBeVisible();
  
  // Verify OCR result in capturePreview (if it's shown there as text)
  // Let's check what capturePreview is used for
  // It's a div in hub.html
  await expect(page.locator("#capturePreview")).toContainText(/OCR data from test image/i);
});
