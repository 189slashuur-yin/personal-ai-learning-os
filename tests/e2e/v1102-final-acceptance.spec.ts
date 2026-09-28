import { expect, test } from "@playwright/test";
import path from "node:path";

function exportConversation(id: string, title: string, contents: string[]) {
  const mapping: Record<string, unknown> = {};
  contents.forEach((content, index) => {
    mapping[`node-${index}`] = {
      id: `${id}-message-${index}`,
      parent: index === 0 ? null : `node-${index - 1}`,
      message: {
        id: `${id}-message-${index}`,
        author: { role: index % 2 ? "assistant" : "user" },
        content: { content_type: "text", parts: [content] },
      },
    };
  });
  return { id, title, current_node: `node-${contents.length - 1}`, mapping };
}

async function importConversations(page: import("@playwright/test").Page, conversations: unknown[]) {
  await page.goto("/import?importPath=new&inputMode=json");
  await page.locator('input[type="file"][accept*="application/json"]').setInputFiles({
    name: "conversations.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(conversations)),
  });
  await page.getByRole("button", { name: "全选", exact: true }).click();
  await page.getByRole("button", { name: conversations.length === 1 ? "导入为新 Conversation" : `批量导入 ${conversations.length} 个为新 Conversation`, exact: true }).click();
  await expect(page.getByRole("link", { name: "打开 →" })).toHaveCount(conversations.length);
}

test("Timeline reaches the last page and locates boundary deep links", async ({ page }) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  let cancelledPrefetches = 0;
  page.on("pageerror", error => errors.push(`runtime: ${error.message}`));
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("requestfailed", request => {
    if (request.failure()?.errorText === "net::ERR_ABORTED" && request.url().includes("_rsc=")) cancelledPrefetches++;
    else errors.push(`network: ${request.url()} ${request.failure()?.errorText}`);
  });
  const started = Date.now();
  const total = 2005;
  await importConversations(page, [exportConversation(
    "acceptance-long",
    "Synthetic long Timeline",
    Array.from({ length: total }, (_, index) => `Synthetic numbered message ${index + 1}`),
  )]);
  console.log(`TIMELINE import ${Date.now() - started}ms`);
  await page.getByRole("link", { name: "打开 →" }).click();
  await expect(page).toHaveURL(/\/conversation\/[^/?]+/);
  console.log(`TIMELINE detail ${Date.now() - started}ms`);
  const detailPath = new URL(page.url()).pathname;
  await page.getByRole("button", { name: "全部原文", exact: true }).click();
  console.log(`TIMELINE full ${Date.now() - started}ms`);
  await expect(page.getByText(`1–100 / ${total}`)).toBeVisible();
  const boundaryIds = new Map<number, string>();
  for (let pageIndex = 1; pageIndex <= 20; pageIndex++) {
    console.log(`TIMELINE before-page ${pageIndex} ${Date.now() - started}ms`);
    await page.getByTestId("message-next-page").click();
    console.log(`TIMELINE after-page ${pageIndex} ${Date.now() - started}ms`);
    await expect(page.getByText(`${pageIndex * 100 + 1}–${Math.min((pageIndex + 1) * 100, total)} / ${total}`)).toBeVisible();
    for (const number of [101, 1000, 2000, total]) {
      if (number < pageIndex * 100 + 1 || number > Math.min((pageIndex + 1) * 100, total)) continue;
      const id = await page.getByLabel(`选择第 ${number} 条 Message`).evaluate((input) => input.closest("li")?.id);
      expect(id).toBeTruthy();
      boundaryIds.set(number, id!);
    }
  }
  await expect(page.getByLabel(`选择第 ${total} 条 Message`)).toBeVisible();
  await expect(page.getByTestId("message-next-page")).toBeDisabled();
  await page.getByTestId("message-previous-page").click();
  await expect(page.getByText(`1901–2000 / ${total}`)).toBeVisible();

  for (const number of [101, 1000, 2000, total]) {
    const domId = boundaryIds.get(number)!;
    const id = domId.slice("message-".length);
    console.log(`TIMELINE deep-link ${number} ${Date.now() - started}ms`);
    await page.goto(`${detailPath}?message=${encodeURIComponent(id)}#${domId}`);
    const target = page.locator(`[id="${domId}"]`);
    await expect(target).toHaveAttribute("data-message-highlighted", "true", { timeout: 30_000 });
    await expect(target).toBeInViewport();
    await expect(target).toContainText(`Synthetic numbered message ${number}`);
    const start = Math.floor((number - 1) / 100) * 100 + 1;
    await expect(page.getByText(`${start}–${Math.min(start + 99, total)} / ${total}`)).toBeVisible();
  }

  await page.getByLabel("Search Messages").fill("Synthetic numbered message 1000");
  await page.getByRole("button", { name: "下一条", exact: true }).click();
  await expect(page.getByLabel("选择第 1000 条 Message")).toBeVisible();
  await page.getByTestId("message-next-page").click();
  await expect(page.getByText(`1001–1100 / ${total}`)).toBeVisible();
  await page.getByTestId("message-previous-page").click();
  await expect(page.getByText(`901–1000 / ${total}`)).toBeVisible();
  if (process.env.PALOS_ACCEPTANCE_SCREENSHOT_DIR) {
    await page.screenshot({ path: path.join(process.env.PALOS_ACCEPTANCE_SCREENSHOT_DIR, "palos-v1102-timeline-navigation.png") });
  }
  console.log(`TIMELINE browser errors ${errors.length}; cancelled prefetches ${cancelledPrefetches}`);
  expect(errors).toEqual([]);
});

test("Raw Message browser search handles ten queries and cross-conversation links", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  let cancelledPrefetches = 0;
  page.on("pageerror", error => errors.push(`runtime: ${error.message}`));
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("requestfailed", request => {
    if (request.failure()?.errorText === "net::ERR_ABORTED" && request.url().includes("_rsc=")) cancelledPrefetches++;
    else errors.push(`network: ${request.url()} ${request.failure()?.errorText}`);
  });
  await importConversations(page, [
    exportConversation("acceptance-alpha", "Synthetic Alpha", [
      "Copper lantern anchors the archive.",
      "The exact long sentence about cedar rivers and violet maps belongs to Alpha.",
      "中文短句：蓝色纸船顺流而下。",
      "Release code ZXQ-2048 confirms the fixture.",
      "commonword alpha first",
      "commonword alpha second",
    ]),
    exportConversation("acceptance-beta", "Synthetic Beta", [
      "Silver compass anchors the journey.",
      "The beta transcript holds a green orchard statement.",
      "中文句子：远山落日照亮旅途。",
      "Batch number 97531 belongs to Beta.",
      "commonword beta first",
      "commonword beta second",
    ]),
  ]);
  await page.goto("/search");
  await expect(page.getByText("Synthetic Alpha", { exact: true }).first()).toBeVisible();
  await page.getByLabel("高级模式：包含 Raw Message").check();
  await page.getByLabel("Entity Type").selectOption("message");
  const input = page.getByRole("searchbox", { name: "全文搜索" });
  const cases = [
    { q: "Copper lantern", title: "Synthetic Alpha", present: true },
    { q: "exact long sentence about cedar rivers and violet maps", title: "Synthetic Alpha", present: true },
    { q: "蓝色纸船", title: "Synthetic Alpha", present: true },
    { q: "ZXQ-2048", title: "Synthetic Alpha", present: true },
    { q: "Silver compass", title: "Synthetic Beta", present: true },
    { q: "green orchard statement", title: "Synthetic Beta", present: true },
    { q: "远山落日", title: "Synthetic Beta", present: true },
    { q: "97531", title: "Synthetic Beta", present: true },
    { q: "commonword", title: "", present: true },
    { q: "no-such-phrase-123456", title: "", present: false },
  ];
  for (const item of cases) {
    const started = Date.now();
    await input.fill(item.q);
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(item.q);
    if (item.present) {
      await expect(page.getByText(/找到 \d+ 个具体文本单元/)).toBeVisible();
      const first = page.locator('a[href*="?message="]').first();
      await expect(first).toBeVisible();
      if (item.title) await expect(first).toContainText(item.title);
    } else {
      await expect(page.getByText("没有找到匹配结果")).toBeVisible();
    }
    const count = item.present ? (await page.locator('a[href*="?message="]').count()) / 2 : 0;
    console.log(`RAW_SEARCH ${JSON.stringify({ query: item.q, ms: Date.now() - started, count, top1: item.title || null })}`);
  }
  await input.fill("");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBeNull();
  await input.fill("Copper lantern");
  await input.fill("Silver compass");
  await input.fill("");
  await input.fill("green orchard statement");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("green orchard statement");
  await expect(page.locator('a[href*="?message="]').first()).toContainText("Synthetic Beta");
  if (process.env.PALOS_ACCEPTANCE_SCREENSHOT_DIR) {
    await page.locator('a[href*="?message="]').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(process.env.PALOS_ACCEPTANCE_SCREENSHOT_DIR, "palos-v1102-raw-search.png") });
  }
  await page.locator('a[href*="?message="]').first().click();
  await expect(page).toHaveURL(/\/conversation\/[^/?]+\?message=[^#]+#message-/);
  await expect(page.getByText("Synthetic Beta", { exact: true }).first()).toBeVisible();
  await expect(page.locator('[data-message-highlighted="true"]')).toContainText("green orchard statement");
  console.log(`RAW_SEARCH browser errors ${errors.length}; cancelled prefetches ${cancelledPrefetches}`);
  expect(errors).toEqual([]);
});

test("Continue Import keeps its target and reports repeated TXT appends accurately", async ({ page }) => {
  await page.goto("/conversation");
  await page.getByRole("button", { name: "创建 Conversation", exact: true }).first().click();
  await page.getByPlaceholder("例如：产品设计复盘").fill("Synthetic Continue Import target");
  await page.getByRole("button", { name: "创建并打开" }).click();
  await expect(page).toHaveURL(/\/conversation\/[^/?]+$/);
  const detailUrl = page.url();
  await page.getByRole("link", { name: "📥 继续导入到本对话" }).click();
  await expect.poll(() => {
    const url = new URL(page.url());
    return url.searchParams.get("existingTargetId") ?? url.searchParams.get("targetConversationId");
  }).toBe(new URL(detailUrl).pathname.split("/").pop());
  await expect(page.getByText("当前目标：Synthetic Continue Import target", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /TXT File/ }).click();
  const file = { name: "synthetic-continue.txt", mimeType: "text/plain", buffer: Buffer.from("User: Repeatable fixture\nAssistant: Append as written") };
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.locator('input[type="file"][accept*=".txt"]').setInputFiles(file);
    await page.getByRole("button", { name: /追加文本到目标 Conversation/ }).click();
    const report = page.getByRole("status").filter({ hasText: "普通文本按原样追加" });
    await expect(report).toContainText("2 Messages · 1 Rounds");
    await expect(report).not.toContainText("0 skipped");
  }
  await page.goto(detailUrl);
  await expect(page.locator("body")).toContainText("Messages: 4");
});
