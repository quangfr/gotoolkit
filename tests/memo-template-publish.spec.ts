import { expect, test } from "@playwright/test";

test.describe("Memo template publish + fetch", () => {
  test("publishes two templates and verifies they appear in the template list", async ({ page }) => {
    test.setTimeout(90_000);
    const baseUrl = "http://127.0.0.1:5000";
    const adminToken = "golive";
    const templateLabelA = `E2E Template A ${Date.now()}`;
    const templateLabelB = `E2E Template B ${Date.now()}`;

    await page.goto(`${baseUrl}/index.html`, { waitUntil: "load" });
    await page.click("#openSettingsBtn");
    await page.waitForSelector("#settingsModal.open");
    await page.fill("#ownerToken", adminToken);
    await page.click("#saveSettingsBtn");
    await page.waitForFunction(
      token => localStorage.getItem("feedback-admin-token") === token,
      adminToken
    );

    await page.goto(`${baseUrl}/memo.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoCreateAutoDocument));
    await page.evaluate(async () => {
      await (window as any).GoToolkitMemoCreateAutoDocument?.();
    });
    await page.waitForFunction(() => Boolean((window as any).GoToolkitMemoGetActiveDocumentId?.()));

    await page.click("#gtTemplateModalTrigger");
    await page.waitForSelector("#gtTemplateModal.open");
    await page.waitForSelector("#publishTemplateBtn", { state: "visible" });

    const publishTemplate = async (label: string) => {
      const publishResponsePromise = page.waitForResponse(response => {
        const request = response.request();
        return (
          request.method() === "POST" &&
          response.url().includes("/v1/shares/template-memos")
        );
      });

      await page.click("#publishTemplateBtn");
      await page.waitForSelector("#document-explorer-name-input");
      await page.fill("#document-explorer-name-input", label);
      await page.fill("#document-explorer-description-input", "E2E publish");
      await page.click('[data-confirm]');

      const publishResponse = await publishResponsePromise;
      expect(publishResponse.ok()).toBeTruthy();
    };

    await publishTemplate(templateLabelA);
    await page.click("#gtTemplateModalClose");
    await page.waitForSelector("#gtTemplateModal.open", { state: "hidden" });
    await page.click("#gtTemplateModalTrigger");
    await page.waitForSelector("#gtTemplateModal.open");
    await publishTemplate(templateLabelB);

    const fetchTemplatesPromise = page.waitForResponse(response => {
      return (
        response.request().method() === "GET" &&
        response.url().includes("/v1/shares/template-memos")
      );
    });

    await page.click("#gtTemplateModalClose");
    await page.waitForSelector("#gtTemplateModal.open", { state: "hidden" });
    await page.click("#gtTemplateModalTrigger");
    await fetchTemplatesPromise;
    await page.waitForSelector("#gtTemplateModal.open");

    await expect(
      page.locator(".gt-template-card h4", { hasText: templateLabelA })
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator(".gt-template-card h4", { hasText: templateLabelB })
    ).toBeVisible({ timeout: 30_000 });
  });
});
