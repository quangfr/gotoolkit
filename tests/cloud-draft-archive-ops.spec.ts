import { expect, test } from "@playwright/test";

test.describe("Cloud draft archive ops", () => {
  test("preserves archive/delete drafts when later non-terminal updates arrive", async ({ page }) => {
    test.setTimeout(120_000);
    const baseUrl = "http://127.0.0.1:5000";

    await page.goto(`${baseUrl}/index.html`, { waitUntil: "commit", timeout: 20_000 });
    await page.waitForFunction(() => Boolean((window as any).goToolkitCloudDrafts?.set && (window as any).goToolkitCloudDrafts?.readAll), null, { timeout: 120_000 });

    const result = await page.evaluate(async () => {
      const drafts = (window as any).goToolkitCloudDrafts;
      if (!drafts) throw new Error("drafts indisponibles");

      const archiveId = "share:pw-terminal-archive";
      const deleteId = "share:pw-terminal-delete";

      drafts.set(archiveId, {
        id: archiveId,
        token: "pw-terminal-archive",
        opType: "archive",
        reason: "moved-to-local",
        title: "Archive draft",
        spaceId: "gotoolkit",
        parentId: "",
        updatedAt: new Date().toISOString()
      });
      drafts.set(archiveId, {
        id: archiveId,
        opType: "edit",
        title: "Should not replace archive",
        spaceId: "gotoolkit",
        updatedAt: new Date().toISOString()
      });

      drafts.set(deleteId, {
        id: deleteId,
        token: "pw-terminal-delete",
        opType: "delete",
        reason: "delete",
        title: "Delete draft",
        spaceId: "gotoolkit",
        updatedAt: new Date().toISOString()
      });
      drafts.set(deleteId, {
        id: deleteId,
        opType: "move",
        title: "Should not replace delete",
        spaceId: "gotoolkit",
        updatedAt: new Date().toISOString()
      });

      const all = await drafts.readAll();
      const archive = all?.[archiveId] || null;
      const deletion = all?.[deleteId] || null;

      drafts.remove(archiveId);
      drafts.remove(deleteId);

      return {
        archiveOpType: String(archive?.opType || ""),
        archiveReason: String(archive?.reason || ""),
        deleteOpType: String(deletion?.opType || ""),
        deleteReason: String(deletion?.reason || "")
      };
    });

    expect(result.archiveOpType).toBe("archive");
    expect(result.archiveReason).toBe("moved-to-local");
    expect(result.deleteOpType).toBe("delete");
    expect(result.deleteReason).toBe("delete");
  });
});
