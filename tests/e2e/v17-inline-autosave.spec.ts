import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";

test.setTimeout(90_000);

async function readCanonicalState(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("palos-db", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const storeNames = [
      "conversations",
      "messages",
      "rounds",
      "sources",
      "proposals",
      "knowledge-cards",
      "conversation-versions",
    ];
    const transaction = database.transaction(storeNames, "readonly");
    const records = await Promise.all(
      storeNames.map(
        (storeName) =>
          new Promise<unknown[]>((resolve, reject) => {
            const request = transaction.objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          }),
      ),
    );
    database.close();
    return records;
  });
}

test("inline Round records autosave, inherit passively, and stay responsive", async ({
  page,
}, testInfo) => {
  const title = "PALOS v1.7 Inline Autosave E2E";
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("intentional release QA failure")
    ) {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/conversation");
  await page
    .getByRole("button", { name: "创建 Conversation", exact: true })
    .first()
    .click();
  await page.getByPlaceholder("例如：产品设计复盘").fill(title);
  await page.getByRole("button", { name: "创建并打开" }).click();
  await expect(page).toHaveURL(/\/conversation\/[^/?]+$/);
  const detailUrl = page.url();
  const conversationId = new URL(detailUrl).pathname.split("/").pop();
  expect(conversationId).toBeTruthy();

  await page.goto(
    `/import?importPath=existing&inputMode=txt&existingTargetId=${encodeURIComponent(conversationId!)}`,
  );
  await page.locator('input[type="file"][accept*=".txt"]').setInputFiles({
    name: "v17-inline.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      [
        "User: Round one question",
        "Assistant: Round one answer",
        "User: Round two question",
        "Assistant: Round two answer",
        "User: Round three question",
        "Assistant: Round three answer",
      ].join("\n"),
      "utf8",
    ),
  });
  await expect(
    page.getByText(/TXT parser v[\d.]+ · 6 Messages · 3 Rounds/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /追加文本到目标 Conversation/ })
    .click();
  await expect(page.getByText(/已追加到.*6 Messages · 3 Rounds/)).toBeVisible();

  await page.goto(detailUrl);
  const cards = page.getByTestId("round-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0).locator('[data-round-record-field="notes"]')).toBeVisible();
  await expect(cards.nth(0).locator('[data-round-record-field="conclusion"]')).toBeVisible();
  await expect(cards.nth(0).locator('[data-round-record-field="nextActions"]')).toBeVisible();
  await expect(cards.nth(0).getByRole("button", { name: "删除" })).toHaveCount(0);

  await cards
    .nth(0)
    .locator('[data-round-record-field="notes"]')
    .fill("Round 1 note");
  await cards
    .nth(0)
    .locator('[data-round-record-field="conclusion"]')
    .fill("Round 1 conclusion");
  await cards
    .nth(0)
    .locator('[data-round-record-field="nextActions"]')
    .fill("Round 1 next");
  await expect(cards.nth(0).getByRole("button", { name: "已保存" })).toBeVisible();

  await expect(cards.nth(2)).toContainText("当前推荐参考：Round 1");
  await expect(
    cards.nth(2).locator('[data-round-record-field="notes"]'),
  ).toHaveValue("");

  await cards
    .nth(1)
    .locator('[data-round-record-field="notes"]')
    .fill("Round 2 note");
  await cards
    .nth(1)
    .locator('[data-round-record-field="conclusion"]')
    .fill("Round 2 conclusion");
  await cards
    .nth(1)
    .locator('[data-round-record-field="nextActions"]')
    .fill("Round 2 next");
  await expect(cards.nth(1).getByRole("button", { name: "已保存" })).toBeVisible();
  await expect(cards.nth(2)).toContainText("当前推荐参考：Round 2");

  await cards
    .nth(0)
    .locator('[data-round-record-field="notes"]')
    .fill("rapid draft one");
  await cards
    .nth(0)
    .locator('[data-round-record-field="notes"]')
    .fill("rapid final draft");
  await cards.nth(0).getByRole("button", { name: "折叠" }).click();
  await cards
    .nth(2)
    .locator('[data-round-record-field="notes"]')
    .focus();

  await page.reload();
  await expect(
    page.getByTestId("round-card").nth(0).locator('[data-round-record-field="notes"]'),
  ).toHaveValue("rapid final draft");
  await expect(
    page.getByTestId("round-card").nth(1).locator('[data-round-record-field="notes"]'),
  ).toHaveValue("Round 2 note");
  await expect(
    page.getByTestId("round-card").nth(2).locator('[data-round-record-field="notes"]'),
  ).toHaveValue("");

  const thirdCard = page.getByTestId("round-card").nth(2);
  await thirdCard.getByRole("button", { name: "调整参考" }).click();
  const referenceSelect = thirdCard.getByLabel("本轮参考来源");
  const roundOneReference = await referenceSelect
    .locator("option")
    .filter({ hasText: "Round 1" })
    .getAttribute("value");
  expect(roundOneReference).toBeTruthy();
  await referenceSelect.selectOption(roundOneReference!);
  await expect(thirdCard).toContainText("已固定参考：Round 1");
  await page.reload();
  await expect(page.getByTestId("round-card").nth(2)).toContainText(
    "已固定参考：Round 1",
  );

  const failedDraft = "Round 2 note after retry";
  await page.evaluate(() => {
    const objectStorePrototype = IDBObjectStore.prototype;
    const originalPut = objectStorePrototype.put;
    const originalConsoleError = console.error;
    let shouldFailRoundWrite = true;

    console.error = (...args: unknown[]) => {
      if (String(args[0]).includes("[IndexedDB] save round failed")) return;
      originalConsoleError(...args);
    };
    objectStorePrototype.put = function (...args: Parameters<IDBObjectStore["put"]>) {
      if (shouldFailRoundWrite && this.name === "rounds") {
        shouldFailRoundWrite = false;
        objectStorePrototype.put = originalPut;
        console.error = originalConsoleError;
        throw new DOMException("intentional release QA failure", "AbortError");
      }
      return Reflect.apply(originalPut, this, args);
    };
  });
  const secondCardAfterReload = page.getByTestId("round-card").nth(1);
  await secondCardAfterReload
    .locator('[data-round-record-field="notes"]')
    .fill(failedDraft);
  await secondCardAfterReload
    .locator('[data-round-record-field="notes"]')
    .blur();
  await expect(
    secondCardAfterReload.getByRole("button", {
      name: "保存失败，点击重试",
    }),
  ).toBeVisible();
  await secondCardAfterReload
    .getByRole("button", { name: "保存失败，点击重试" })
    .click();
  await expect(
    secondCardAfterReload.getByRole("button", { name: "已保存" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByTestId("round-card")
      .nth(1)
      .locator('[data-round-record-field="notes"]'),
  ).toHaveValue(failedDraft);

  await page.getByRole("button", { name: "编辑 Overview" }).click();
  await page.locator('[data-overview-field="longTermBackground"]').fill("总备注背景");
  await page.locator('[data-overview-field="currentState"]').fill("当前总论内容");
  await page.locator('[data-overview-field="nextActions"]').fill("后续方向内容");
  await expect(page.getByRole("button", { name: "已保存" }).last()).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "编辑 Overview" }).click();
  await expect(page.locator('[data-overview-field="currentState"]')).toHaveValue(
    "当前总论内容",
  );

  const overviewPanel = page.locator("section").filter({ hasText: "Conversation Overview / 对话总览" }).first();
  const beforeCancelledOverview = await readCanonicalState(page);
  page.once("dialog", (dialog) => dialog.dismiss());
  await overviewPanel.getByRole("button", { name: "保存为 Knowledge" }).click();
  expect(await readCanonicalState(page)).toEqual(beforeCancelledOverview);
  await expect(page.locator('[data-overview-field="currentState"]')).toHaveValue("当前总论内容");

  page.once("dialog", (dialog) => dialog.accept());
  await overviewPanel.getByRole("button", { name: "保存为 Knowledge" }).click();
  await expect(overviewPanel).toContainText("Conversation Overview 已保存为 Knowledge。");
  const overviewKnowledgeLink = overviewPanel.getByRole("link", { name: "打开 Knowledge" });
  await expect(overviewKnowledgeLink).toHaveAttribute("href", /^\/knowledge\/.+/);
  await page.goto(detailUrl);
  await expect(page.getByTestId("conversation-knowledge-list")).toContainText("当前总论内容");

  await page.getByRole("button", { name: "继续这个主题" }).click();
  const continueText = page.getByLabel("继续这个主题文本");
  await expect(continueText).toContainText("我的备注：rapid final draft");
  await expect(continueText).toContainText(`我的备注：${failedDraft}`);
  await expect(continueText).toContainText("下一步：Round 2 next");
  await expect(continueText).not.toContainText("本轮记录：");

  const firstCardForKnowledge = page.getByTestId("round-card").nth(0);
  const roundKnowledgeButton = firstCardForKnowledge
    .locator("button")
    .filter({ hasText: "保存为 Knowledge" });
  page.once("dialog", (dialog) => dialog.accept());
  await roundKnowledgeButton.click();
  await expect(firstCardForKnowledge).toContainText(
    "已保存为 Knowledge；不会影响本轮记录或参考来源。",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await roundKnowledgeButton.click();
  await expect(firstCardForKnowledge).toContainText(
    "相同来源与内容的 Knowledge 已存在，未重复创建。",
  );
  await page.goto("/knowledge");
  const knowledgeLink = page.locator('a[href^="/knowledge/"]').first();
  await expect(knowledgeLink).toBeVisible();
  const knowledgeHref = await knowledgeLink.getAttribute("href");
  expect(knowledgeHref).toBeTruthy();
  await page.goto(knowledgeHref!);
  await expect(page.getByTestId("knowledge-saved-evidence")).toContainText(
    "Round one answer",
  );
  const currentKnowledgeSource = page.getByTestId("knowledge-current-source");
  const messageLink = currentKnowledgeSource.getByRole("link", {
    name: "Message 1",
  });
  const messageHref = await messageLink.getAttribute("href");
  expect(messageHref).toMatch(
    new RegExp(`^/conversation/${conversationId}\\?message=.+#message-.+$`),
  );
  const beforeMessageNavigation = await readCanonicalState(page);
  await messageLink.click();
  await expect(page).toHaveURL(messageHref!);
  const messageAnchorId = decodeURIComponent(new URL(page.url()).hash.slice(1));
  await expect(page.locator(`[id="${messageAnchorId}"]`)).toBeVisible();
  expect(await readCanonicalState(page)).toEqual(beforeMessageNavigation);

  await page.goto(knowledgeHref!);
  const roundLink = page
    .getByTestId("knowledge-current-source")
    .locator('a[href*="?mode=workspace&round="]')
    .first();
  const roundHref = await roundLink.getAttribute("href");
  expect(roundHref).toMatch(
    new RegExp(`^/conversation/${conversationId}\\?mode=workspace&round=.+#round-.+$`),
  );
  const beforeRoundNavigation = await readCanonicalState(page);
  await roundLink.click();
  await expect(page).toHaveURL(roundHref!);
  expect(await readCanonicalState(page)).toEqual(beforeRoundNavigation);
  await page.goto(detailUrl);

  await page.setViewportSize({ width: 1280, height: 900 });
  const desktopColumns = await page
    .getByTestId("round-inline-layout")
    .first()
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(desktopColumns.split(" ").length).toBeGreaterThan(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    fullPage: false,
    path: testInfo.outputPath("v17-release-qa-1280.png"),
  });

  await page.setViewportSize({ width: 390, height: 844 });
  const narrowColumns = await page
    .getByTestId("round-inline-layout")
    .first()
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(narrowColumns.split(" ")).toHaveLength(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  const scrollBeforeNavigatorExpand = await page.evaluate(() => window.scrollY);
  await page.getByRole("button", { name: "展开 Navigator" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(
    scrollBeforeNavigatorExpand,
    0,
  );
  await page.getByRole("button", { name: "折叠 Navigator" }).click();
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(
    scrollBeforeNavigatorExpand,
    0,
  );
  await expect(
    page.getByTestId("round-card").first().getByRole("button", {
      name: /删除|合并|拆分|重排|复制|原始编辑/,
    }),
  ).toHaveCount(0);
  await page.screenshot({
    fullPage: false,
    path: testInfo.outputPath("v17-release-qa-390.png"),
  });

  await page.goto("/conversation");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: `Delete ${title}` }).click();
  await page.reload();
  await expect(page.getByRole("link", { name: title, exact: true })).toHaveCount(0);

  await page.goto("/");
  await expect(page.locator(`a[href="/conversation/${conversationId}"]`)).toHaveCount(0);
  await page.goto(`/search?q=${encodeURIComponent(title)}`);
  await expect(
    page.locator(`a[href*="/conversation/${conversationId}"]`),
  ).toHaveCount(0);
  await page.goto("/review");
  await expect(page.getByText("Round 1 · 本轮结论", { exact: true })).toHaveCount(0);
  await page.goto("/knowledge");
  await expect(page.locator('a[href^="/knowledge/"]')).toHaveCount(2);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  writeFileSync(
    testInfo.outputPath("qa-manifest.json"),
    JSON.stringify(
      {
        release: "PALOS v1.7",
        scenario: "round-first-final-release-qa",
        conversationCountCreated: 1,
        roundCount: 3,
        expectedKnowledgeRetainedAfterConversationDelete: 1,
        viewports: [1280, 390],
        injectedSaveFailureRecovered: true,
        horizontalOverflow: false,
        unexpectedConsoleErrors: 0,
        userContentIncludedInManifest: false,
      },
      null,
      2,
    ),
  );
});
