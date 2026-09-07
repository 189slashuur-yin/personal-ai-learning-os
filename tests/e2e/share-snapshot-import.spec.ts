import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

type CanonicalRecord = Record<string, unknown> & { id: string };

type ShareSnapshotCanonicalState = {
  conversations: CanonicalRecord[];
  sources: CanonicalRecord[];
  messages: CanonicalRecord[];
  rounds: CanonicalRecord[];
};

async function readShareSnapshotCanonicalState(
  page: Page,
): Promise<ShareSnapshotCanonicalState> {
  return page.evaluate(
    () =>
      new Promise<ShareSnapshotCanonicalState>((resolve, reject) => {
        const openRequest = indexedDB.open("palos-db", 1);
        openRequest.onerror = () =>
          reject(openRequest.error ?? new Error("IndexedDB open failed."));
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          const transaction = database.transaction(
            ["conversations", "sources", "messages", "rounds"],
            "readonly",
          );
          const conversations = transaction
            .objectStore("conversations")
            .getAll();
          const sources = transaction.objectStore("sources").getAll();
          const messages = transaction.objectStore("messages").getAll();
          const rounds = transaction.objectStore("rounds").getAll();
          transaction.oncomplete = () => {
            resolve({
              conversations: conversations.result as CanonicalRecord[],
              sources: sources.result as CanonicalRecord[],
              messages: messages.result as CanonicalRecord[],
              rounds: rounds.result as CanonicalRecord[],
            });
            database.close();
          };
          transaction.onerror = () =>
            reject(
              transaction.error ??
                new Error("Canonical IndexedDB read failed."),
            );
          transaction.onabort = () =>
            reject(
              transaction.error ??
                new Error("Canonical IndexedDB read aborted."),
            );
        };
      }),
  );
}

test("local ChatGPT HTML creates and appends immutable canonical snapshots without a URL", async ({
  page,
}) => {
  const title = "PALOS Conversation Snapshot E2E";
  const chatGptRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://chatgpt.com/")) {
      chatGptRequests.push(request.url());
    }
  });

  await page.goto("/import?importPath=new&inputMode=share");
  await expect(
    page.getByText(
      "当前模式：新建 Conversation / ChatGPT Conversation Snapshot",
      {
      exact: true,
      },
    ),
  ).toBeVisible();
  await page.getByLabel("Conversation 标题").fill(title);
  await page.getByTestId("share-snapshot-saved-html-mode").click();
  await page
    .locator('input[type="file"][accept*=".html"]')
    .setInputFiles(
      path.resolve(
        "tests/fixtures/chatgpt-share-snapshot-initial.html",
      ),
    );
  await expect(
    page.getByRole("button", { name: "Preview Conversation Snapshot" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Preview Conversation Snapshot" })
    .click();

  const initialPreview = page.getByTestId("share-snapshot-preview");
  await expect(initialPreview).toContainText("NEW");
  await expect(initialPreview).toContainText(
    "0 existing · 3 in snapshot · 3 new",
  );
  await expect(initialPreview).toContainText("extend 0 · create 2 · total 2");
  await page
    .getByRole("button", { name: "Confirm save Conversation Snapshot" })
    .click();
  await expect(page).toHaveURL(/\/conversation\/[^/?]+\?imported=rounds$/);

  const conversationId = new URL(page.url()).pathname.split("/").pop();
  expect(conversationId).toBeTruthy();
  const initialState = await readShareSnapshotCanonicalState(page);
  expect(initialState.conversations).toHaveLength(1);
  expect(initialState.sources).toHaveLength(1);
  expect(initialState.messages).toHaveLength(3);
  expect(initialState.rounds).toHaveLength(2);
  const initialSource = initialState.sources[0];
  const initialTailRound = initialState.rounds.find(
    (round) => round.order === 2,
  );
  expect(initialTailRound).toBeDefined();
  expect(initialSource.shareSnapshot).toMatchObject({
    schemaVersion: 2,
    inputKind: "saved-html",
    snapshotMessageCount: 3,
    snapshotSequence: 1,
  });

  await page.goto(
    `/import?importPath=existing&inputMode=share&existingTargetId=${encodeURIComponent(conversationId!)}`,
  );
  await expect(
    page.getByText(`当前目标：${title}`, { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("选择目标 Conversation")).toHaveValue(
    conversationId!,
  );
  await page.getByTestId("share-snapshot-saved-html-mode").click();
  await page
    .locator('input[type="file"][accept*=".html"]')
    .setInputFiles(
      path.resolve(
        "tests/fixtures/chatgpt-share-snapshot-assistant-append.html",
      ),
    );
  await page
    .getByRole("button", { name: "Preview Conversation Snapshot" })
    .click();

  const appendPreview = page.getByTestId("share-snapshot-preview");
  await expect(appendPreview).toContainText("APPEND");
  await expect(appendPreview).toContainText(
    "3 existing · 4 in snapshot · 1 new",
  );
  await expect(appendPreview).toContainText("extend 1 · create 0 · total 2");
  await page
    .getByRole("button", { name: "Confirm append 1 Messages" })
    .click();
  await expect(page.getByText(/Snapshot 已追加：1 Messages/)).toBeVisible();

  const appendedState = await readShareSnapshotCanonicalState(page);
  expect(appendedState.conversations).toHaveLength(1);
  expect(appendedState.sources).toHaveLength(2);
  expect(appendedState.messages).toHaveLength(4);
  expect(appendedState.rounds).toHaveLength(2);
  expect(
    appendedState.sources.find(({ id }) => id === initialSource.id),
  ).toEqual(initialSource);
  const headSource = appendedState.sources.find(
    ({ id }) => id !== initialSource.id,
  );
  expect(headSource?.shareSnapshot).toMatchObject({
    schemaVersion: 2,
    inputKind: "saved-html",
    snapshotMessageCount: 4,
    previousSnapshotSourceId: initialSource.id,
    snapshotSequence: 2,
  });
  const appendedTailRound = appendedState.rounds.find(
    (round) => round.order === 2,
  );
  expect(appendedTailRound).toMatchObject({
    id: initialTailRound?.id,
    answer:
      "Extend the unanswered tail Round without replacing its local enrichment.",
  });
  expect(JSON.stringify(appendedState)).not.toContain("chatgpt.com");
  expect(
    (headSource?.shareSnapshot as Record<string, unknown>)?.resourceHash,
  ).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(appendedState.sources)).not.toContain("<article");
  expect(chatGptRequests).toEqual([]);

  await page.goto(`/conversation/${conversationId}`);
  const snapshotHistory = page.getByTestId("share-snapshot-history");
  await expect(snapshotHistory).toContainText(
    "2 个 Snapshot · 当前 head #2",
  );
  await expect(snapshotHistory).toContainText("Current head");
  await expect(snapshotHistory).toContainText(
    "新增 1 条 Message · Assistant 1 · User 0",
  );
  await expect(snapshotHistory).toContainText(
    "Extend the unanswered tail Round without replacing its local enrichment.",
  );

  const addedMessage = appendedState.messages.find((message) => message.sourceOrdinal === 3)!;
  const messageHref = `/conversation/${conversationId}?message=${addedMessage.id}#message-${addedMessage.id}`;
  const roundHref = `/conversation/${conversationId}?mode=workspace&round=${appendedTailRound!.id}#round-${appendedTailRound!.id}`;
  const locate = snapshotHistory.getByRole("link", { name: "定位原 Message", exact: true });
  await expect(locate).toHaveAttribute("href", messageHref);
  await expect(snapshotHistory.getByRole("link", { name: "打开所在 Round" })).toHaveAttribute("href", roundHref);
  await locate.click();
  await expect(page).toHaveURL(messageHref);
  const target = page.locator(`[id="message-${addedMessage.id}"]`);
  await expect(page.getByRole("button", { name: "全部原文", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(target).toBeInViewport();
  await expect(target).toHaveAttribute("data-message-highlighted", "true");
  await expect(target).toContainText(String(addedMessage.content));
  await expect(target.getByRole("button", { name: "Collapse", exact: true })).toBeVisible();
  await expect(target).not.toHaveAttribute("data-message-highlighted", "true", { timeout: 7000 });
  // Reopening the same link must expand a manually collapsed target again.
  await target.getByRole("button", { name: "Collapse", exact: true }).click();
  await snapshotHistory.getByRole("link", { name: "定位原 Message", exact: true }).click();
  await expect(target).toHaveAttribute("data-message-highlighted", "true");
  await expect(target.getByRole("button", { name: "Collapse", exact: true })).toBeVisible();
  // Repeat while the previous highlight is still active, after collapsing again.
  await target.getByRole("button", { name: "Collapse", exact: true }).click();
  await snapshotHistory.getByRole("link", { name: "定位原 Message", exact: true }).click();
  await expect(target).toBeInViewport();
  await expect(target.getByRole("button", { name: "Collapse", exact: true })).toBeVisible();
  await snapshotHistory.getByRole("link", { name: "打开所在 Round" }).click();
  await expect(page).toHaveURL(roundHref);
  await expect(page.locator(`[id="round-${appendedTailRound!.id}"]`)).toBeInViewport();

  await page.goto(`/search?q=${encodeURIComponent(String(addedMessage.content))}`);
  await expect(page.getByLabel("高级模式：包含 Raw Message")).not.toBeChecked();
  await expect(page.locator(`a[href="${messageHref}"]`)).toHaveCount(0);
  await page.getByLabel("高级模式：包含 Raw Message").check();
  await page.locator(`a[href="${messageHref}"]`).first().click();
  await expect(page).toHaveURL(messageHref);
  await expect(target).toBeInViewport();
  await expect(target).toHaveAttribute("data-message-highlighted", "true");

  const beforeInvalid = await readShareSnapshotCanonicalState(page);
  await page.goto(`/conversation/${conversationId}?message=missing#message-missing`);
  await expect(page.getByText("不可定位：Message 不存在或不属于此 Conversation。", { exact: true })).toBeVisible();
  await expect(page.locator('[data-message-highlighted="true"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "全部原文", exact: true })).toHaveAttribute("aria-pressed", "false");
  expect(await readShareSnapshotCanonicalState(page)).toEqual(beforeInvalid);

  // A real Message in another Conversation cannot be targeted here.
  await page.goto("/import?importPath=new&inputMode=share");
  await page.getByLabel("Conversation 标题").fill("Other Conversation");
  await page.getByTestId("share-snapshot-saved-html-mode").click();
  await page.locator('input[type="file"][accept*=".html"]').setInputFiles(path.resolve("tests/fixtures/chatgpt-share-snapshot-initial.html"));
  await page.getByRole("button", { name: "Preview Conversation Snapshot" }).click();
  await page.getByRole("button", { name: "Confirm save Conversation Snapshot" }).click();
  await expect(page).toHaveURL(/\/conversation\/[^/?]+\?imported=rounds$/);
  const otherPath = new URL(page.url()).pathname;
  const beforeForeign = await readShareSnapshotCanonicalState(page);
  await page.goto(`${otherPath}?message=${addedMessage.id}#message-${addedMessage.id}`);
  await expect(page.getByText("不可定位：Message 不存在或不属于此 Conversation。", { exact: true })).toBeVisible();
  await expect(target).toHaveCount(0);
  expect(await readShareSnapshotCanonicalState(page)).toEqual(beforeForeign);

  await page.goto(`/conversation/${conversationId}`);
  await page
    .getByLabel("Snapshot 对比基线")
    .selectOption(headSource?.id);
  await expect(snapshotHistory).toContainText("没有新增内容");
  await expect(snapshotHistory).toContainText(
    "选择的是同一个 Snapshot",
  );
});
