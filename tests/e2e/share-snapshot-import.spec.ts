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
});
