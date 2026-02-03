import { expect, test } from "@playwright/test";

test.describe("Mermaid arrows rendering", () => {
  test("should render arrows in modal and preview", async ({ page }) => {
    const baseUrl = "http://127.0.0.1:5000";
    const code = `%% Processus de recrutement
flowchart TD
    A[Début] --> B[Publier offre]
    B --> C[Réception CV]
    C --> D{CV ok ?}
    D -- Oui --> E[Tri des CV]
    D -- Non --> F[Rejet CV]
    E --> G[Entretien téléphonique]
    G --> H{Téléphone OK ?}
    H -- Oui --> I[Entretien physique]
    H -- Non --> J[Rejet téléphonique]
    I --> K[Évaluation]
    K --> L{Candidat retenu ?}
    L -- Oui --> M[Faire offre]
    L -- Non --> N[Rejet final]
    M --> O[Signature contrat]
    O --> P[Intégration]
    P --> Q[Fin]`;

    await page.goto(`${baseUrl}/docs.html`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean((window as any).MemoEditor));

    // Clear doc and insert mermaid block, then open modal via double-click
    await page.evaluate(() => {
      const editor = (window as any).MemoEditor;
      editor.commands.setContent("");
      editor.chain().focus().insertContent({
        type: "mermaidDiagram",
        attrs: { code: "flowchart TD\n  X-->Y;" }
      }).run();
    });

    const modal = page.locator('.mermaid-modal');
    await expect(page.locator('.mermaid-diagram-container')).toBeAttached({ timeout: 10000 });
    await page.evaluate(() => {
      const el = document.querySelector('.mermaid-diagram-container');
      if (el) {
        el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      }
    });
    await expect(modal).toBeVisible({ timeout: 10000 });

    const textarea = page.locator('.mermaid-modal-textarea');
    await textarea.fill(code, { force: true });

    await page.locator('button.mermaid-modal-sync').click({ force: true });

    // Wait for arrows to appear in Excalidraw scene
    await page.waitForFunction(() => {
      const api = (window as any).GoToolkitDrawMemo?.getApi?.();
      if (!api) return false;
      const elements = api.getSceneElements?.() || [];
      return elements.some((el: any) => el?.type === "arrow" && !!el?.endArrowhead);
    });

    // Close modal
    await page.locator('button.mermaid-modal-close').click();
    await expect(modal).toBeHidden();

    // Ensure preview SVG exists
    const previewSvg = page.locator('.mermaid-svg-container svg');
    await expect(previewSvg).toBeVisible();

    // Ensure stored JSON contains arrows
    const arrowCount = await page.evaluate(() => {
      const editor = (window as any).MemoEditor;
      let json = "";
      editor.state.doc.descendants((node: any) => {
        if (node.type.name === "mermaidDiagram") {
          json = node.attrs.excalidrawJSON || "";
        }
      });
      if (!json) return 0;
      try {
        const parsed = JSON.parse(json);
        const elements = parsed?.elements || [];
        return elements.filter((el: any) => el?.type === "arrow" && !!el?.endArrowhead).length;
      } catch {
        return 0;
      }
    });
    expect(arrowCount).toBeGreaterThan(0);
  });
});
