import { expect, test } from "@playwright/test";

test("Analyzer uses only checked frozen Knowledge and leaves Conversation selection intact", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("palos-db", 1);
      request.onupgradeneeded = () => {
        for (const name of ["conversations", "messages", "rounds", "sources", "proposals", "knowledge-cards", "conversation-versions"]) {
          if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
    const now = "2026-09-27T00:00:00.000Z";
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["conversations", "sources", "knowledge-cards"], "readwrite");
      tx.objectStore("conversations").put({ id: "sprint3", title: "Analyzer Knowledge test", sourceType: "Manual",
        createdAt: now, updatedAt: now, lastOpenedAt: now,
        knowledgeContextRefs: ["one", "two"].map((id, order) => ({ knowledgeCardId: id,
          titleSnapshot: `Card ${id}`, contentSnapshot: `Frozen ${id}`, knowledgeUpdatedAtSnapshot: now,
          order, originalContentLength: `Frozen ${id}`.length, contentTruncated: false })) });
      tx.objectStore("sources").put({ id: "sprint3-source", conversationId: "sprint3", kind: "text",
        name: "primary.txt", content: "Primary evidence text", importedAt: now, updatedAt: now });
      tx.objectStore("knowledge-cards").put({ id: "one", proposalId: "p-one", title: "Card one",
        content: "Changed after snapshot", summary: "", sourceFile: "", tagIds: [], createdAt: now,
        updatedAt: "2026-09-28T00:00:00.000Z", status: "Active" });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.goto("/conversation/sprint3");
  await expect(page.getByText("Referenced Knowledge for this run · 2/2")).toBeVisible();
  await expect(page.getByText("Source updated, using saved snapshot")).toBeVisible();
  await expect(page.getByText("Source unavailable, saved snapshot")).toBeVisible();
  await page.getByLabel("Use Card two").uncheck();
  await expect(page.getByText("Referenced Knowledge for this run · 1/2")).toBeVisible();
  await page.getByRole("button", { name: "可选：生成 AI 整理建议" }).click();
  await expect(page.getByText("Referenced Knowledge used in this analysis · 1").first()).toBeVisible();
  await expect(page.locator("#section-proposal")).toContainText("Completed");
  await expect(page.locator("#referenced-knowledge li")).toHaveCount(2);
  await page.reload();
  await expect(page.locator("#referenced-knowledge li")).toHaveCount(2);
  await expect(page.getByText("Referenced Knowledge used in this analysis · 1").first()).toBeVisible();
  const snapshotsBeforeRefresh = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("palos-db", 1);
      request.onsuccess = () => resolve(request.result);
    });
    return new Promise<string[]>((resolve) => {
      const request = db.transaction("proposals").objectStore("proposals").getAll();
      request.onsuccess = () => resolve(request.result.map((proposal) => proposal.knowledgeReuseAudit?.[0]?.contentSnapshot));
    });
  });
  expect(snapshotsBeforeRefresh).toEqual(["Frozen one"]);
  await page.locator("#referenced-knowledge li").first().getByRole("button", { name: "Refresh snapshot" }).click();
  await expect(page.getByText("Source updated · Refresh snapshot available")).toHaveCount(0);
  await expect(page.getByText("Referenced Knowledge for this run · 2/2")).toBeVisible();
  await page.getByLabel("Use Card two").uncheck();
  await page.getByRole("button", { name: "可选：生成 AI 整理建议" }).click();
  await expect(page.getByText("Proposal 已生成")).toBeVisible();
  const snapshotsAfterRefresh = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("palos-db", 1);
      request.onsuccess = () => resolve(request.result);
    });
    return new Promise<string[]>((resolve) => {
      const request = db.transaction("proposals").objectStore("proposals").getAll();
      request.onsuccess = () => resolve(request.result.map((proposal) => proposal.knowledgeReuseAudit?.[0]?.contentSnapshot));
    });
  });
  expect(snapshotsAfterRefresh.sort()).toEqual(["Changed after snapshot", "Frozen one"].sort());
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("palos-db", 1);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("conversations", "readwrite");
      const store = tx.objectStore("conversations");
      const request = store.get("sprint3");
      request.onsuccess = () => store.put({ ...request.result,
        knowledgeContextRefs: [request.result.knowledgeContextRefs[1]].map((ref: { order: number }) => ({ ...ref, order: 0 })) });
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.getByRole("button", { name: "可选：生成 AI 整理建议" }).click();
  await expect(page.getByText(/Referenced Knowledge (selection )?changed before this run/)).toBeVisible();
});

test("failed provider run keeps its Knowledge audit and retry creates a separate run", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const now = "2026-09-27T00:00:00.000Z";
    localStorage.setItem("ai-learning-os.provider-configurations", JSON.stringify([{
      providerId: "ollama", displayName: "Ollama", baseUrl: "http://127.0.0.1:11434", model: "test",
      timeout: 5000, enabled: true, requiresApiKey: false, supportsStreaming: false, supportsVision: false,
      supportsToolCalling: false, supportsJsonMode: true, capabilities: ["chat", "json_output"],
      lastTestStatus: "Success", createdAt: now, updatedAt: now,
    }]));
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("palos-db", 1);
      request.onupgradeneeded = () => {
        for (const name of ["conversations", "messages", "rounds", "sources", "proposals", "knowledge-cards", "conversation-versions"]) {
          if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction(["conversations", "sources"], "readwrite");
      tx.objectStore("conversations").put({ id: "sprint3-fail", title: "Failure audit", sourceType: "Manual",
        createdAt: now, updatedAt: now, lastOpenedAt: now, knowledgeContextRefs: [{ knowledgeCardId: "deleted",
          titleSnapshot: "Deleted card", contentSnapshot: "Frozen deleted content", knowledgeUpdatedAtSnapshot: now,
          order: 0, originalContentLength: 22, contentTruncated: false }] });
      tx.objectStore("sources").put({ id: "fail-source", conversationId: "sprint3-fail", kind: "text",
        name: "primary.txt", content: "Primary evidence", importedAt: now, updatedAt: now });
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.route("http://127.0.0.1:11434/**", (route) => route.fulfill({ status: 503,
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" }, body: "fixture failure" }));
  await page.goto("/conversation/sprint3-fail");
  await expect(page.getByText("Referenced Knowledge for this run · 1/1")).toBeVisible();
  await page.getByLabel("本次 Analyze Provider").selectOption("ollama");
  await page.getByRole("button", { name: "可选：生成 AI 整理建议" }).click();
  await expect(page.getByText("Referenced Knowledge used in this analysis · 1")).toBeVisible();
  await expect(page.getByText(/ANALYZER_FAILED/)).toBeVisible();
  const failedRun = await page.evaluate(() => {
    const runs = JSON.parse(localStorage.getItem("ai-learning-os.analyzer-runs") ?? "[]");
    return runs.find((run: { status: string }) => run.status === "failed");
  });
  expect(failedRun.knowledgeReuseAudit[0].contentSnapshot).toBe("Frozen deleted content");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Referenced Knowledge used in this analysis · 1").first()).toBeVisible();
  await expect(page.locator("#section-proposal")).toContainText("Completed");
  const runs = await page.evaluate(() => JSON.parse(localStorage.getItem("ai-learning-os.analyzer-runs") ?? "[]"));
  expect(runs).toHaveLength(2);
  expect(runs[0].id).not.toBe(runs[1].id);
  expect(runs.find((run: { id: string }) => run.id === failedRun.id).knowledgeReuseAudit[0].contentSnapshot).toBe("Frozen deleted content");
});
