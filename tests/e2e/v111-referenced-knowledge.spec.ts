import { expect, test } from "@playwright/test";

test("Conversation keeps ordered frozen Knowledge through reload, refresh, removal and Continue Topic", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("palos-db", 1);
      request.onupgradeneeded = () => {
        for (const name of ["conversations", "messages", "rounds", "sources", "proposals", "knowledge-cards", "conversation-versions"]) {
          if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["conversations", "knowledge-cards"], "readwrite");
      const time = "2026-09-27T00:00:00.000Z";
      tx.objectStore("conversations").put({ id: "v111-ui", title: "Knowledge selection test",
        sourceType: "Manual", createdAt: time, updatedAt: time, lastOpenedAt: time });
      for (const [id, content] of [["one", "First frozen text"], ["two", "Second frozen text"], ["long", "L".repeat(4001)]]) {
        tx.objectStore("knowledge-cards").put({ id, proposalId: `proposal-${id}`, title: `Card ${id}`,
          content, summary: "", sourceFile: "", tagIds: [], createdAt: time, updatedAt: time, status: "Active" });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.goto("/conversation/v111-ui");
  const section = page.locator("#referenced-knowledge");
  await expect(section.getByRole("heading", { name: "Referenced Knowledge" })).toBeVisible();
  await section.getByLabel("Choose Knowledge").selectOption("one");
  await section.getByRole("button", { name: "Add" }).click();
  await expect(section.getByText("Saved and verified.")).toBeVisible();
  await section.getByLabel("Choose Knowledge").selectOption("two");
  await section.getByRole("button", { name: "Add" }).click();
  await expect(section.locator("li")).toHaveCount(2);
  await page.reload();
  await expect(section.locator("li")).toHaveCount(2);
  await section.locator("li").nth(1).getByRole("button", { name: "↑" }).click();
  await expect(section.locator("li").first()).toContainText("Card two");
  await page.reload();
  await expect(section.locator("li").first()).toContainText("Card two");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("palos-db", 1);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("knowledge-cards", "readwrite");
      const request = tx.objectStore("knowledge-cards").get("two");
      request.onsuccess = () => tx.objectStore("knowledge-cards").put({ ...request.result,
        content: "Second updated text", updatedAt: "2026-09-28T00:00:00.000Z" });
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.reload();
  await expect(section.getByText("Source updated · Refresh snapshot available")).toBeVisible();
  await section.locator("li").first().getByRole("button", { name: "Refresh snapshot" }).click();
  await expect(section.getByText("Source updated · Refresh snapshot available")).toHaveCount(0);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("palos-db", 1);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("knowledge-cards", "readwrite");
      tx.objectStore("knowledge-cards").delete("one");
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.reload();
  await expect(section.getByText("Source unavailable — using saved snapshot")).toBeVisible();
  await page.getByRole("button", { name: "继续这个主题" }).first().click();
  await expect(page.getByLabel("继续这个主题文本")).toContainText("## Referenced Knowledge");
  await expect(page.getByLabel("继续这个主题文本")).toContainText("Second updated text");
  await expect(page.getByLabel("继续这个主题文本")).toContainText("First frozen text");
  await section.locator("li").last().getByRole("button", { name: "Remove" }).click();
  await expect(section.locator("li")).toHaveCount(1);
  await section.getByLabel("Choose Knowledge").selectOption("long");
  page.once("dialog", (dialog) => dialog.dismiss());
  await section.getByRole("button", { name: "Add" }).click();
  await expect(section.locator("li")).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await section.getByRole("button", { name: "Add" }).click();
  await expect(section.locator("li")).toHaveCount(2);
  await expect(section.locator("li").last()).toContainText("4,000 characters of 4,001");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("palos-db", 1);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("knowledge-cards", "readwrite");
      const request = tx.objectStore("knowledge-cards").get("two");
      request.onsuccess = () => tx.objectStore("knowledge-cards").put({ ...request.result,
        status: "Archived", archivedAt: "2026-09-29T00:00:00.000Z" });
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.reload();
  await expect(section.getByText("Archived source")).toBeVisible();
});

test("five frozen refs near the 16,000-character budget render and continue", async ({ page }) => {
  const errors: string[] = [];
  let cancelledNavigationRequests = 0;
  page.on("pageerror", (error) => errors.push(`runtime: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("requestfailed", (request) => {
    const intentionalNavigationAbort = request.failure()?.errorText === "net::ERR_ABORTED" &&
      (request.url().includes("_rsc=") || request.url().includes("/_next/static/chunks/"));
    if (intentionalNavigationAbort) cancelledNavigationRequests++;
    else errors.push(`network: ${request.url()} ${request.failure()?.errorText}`);
  });
  await page.goto("/");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("palos-db", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const now = "2026-09-27T00:00:00.000Z";
    const lengths = [3999, 3999, 3999, 3999, 1];
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("conversations", "readwrite");
      tx.objectStore("conversations").put({ id: "v111-near-budget", title: "Near budget fixture",
        sourceType: "Manual", createdAt: now, updatedAt: now, lastOpenedAt: now,
        knowledgeContextRefs: lengths.map((length, order) => ({ knowledgeCardId: `budget-${order}`,
          titleSnapshot: `Budget card ${order + 1}`, contentSnapshot: String(order).repeat(length),
          knowledgeUpdatedAtSnapshot: now, originalContentLength: length, contentTruncated: false, order })) });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.goto("/conversation/v111-near-budget");
  await expect(page.locator("#referenced-knowledge li")).toHaveCount(5);
  await page.getByRole("button", { name: "继续这个主题" }).first().click();
  await expect(page.getByLabel("继续这个主题文本")).toContainText("Budget card 5");
  console.log(`NEAR_BUDGET browser errors ${errors.length}; cancelled navigation requests ${cancelledNavigationRequests}`);
  expect(errors).toEqual([]);
});
