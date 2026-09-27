import { expect, test } from "@playwright/test";
import path from "node:path";

function exportPart(id: string, title: string) {
  return JSON.stringify([{ id, title, current_node: "answer", mapping: {
    question: { id: `${id}-question`, parent: null, message: { id: `${id}-question`, author: { role: "user" }, content: { content_type: "text", parts: ["A synthetic question"] } } },
    answer: { id: `${id}-answer`, parent: "question", message: { id: `${id}-answer`, author: { role: "assistant" }, content: { content_type: "text", parts: ["A synthetic answer"] } } },
  } }]);
}

test("selects split ChatGPT export together and keeps the Merge target link", async ({ page }) => {
  await page.goto("/import?importPath=new&inputMode=json");
  await expect(page.getByText("请选择同一次导出的全部 conversations-*.json 分片", { exact: false })).toBeVisible();
  await page.locator('input[type="file"][accept*="application/json"]').setInputFiles([
    { name: "conversations-000.json", mimeType: "application/json", buffer: Buffer.from(exportPart("split-a", "Split fixture A")) },
    { name: "conversations-001.json", mimeType: "application/json", buffer: Buffer.from(exportPart("split-b", "Split fixture B")) },
    { name: "export_manifest.json", mimeType: "application/json", buffer: Buffer.from('{"files":[]}') },
  ]);
  await expect(page.getByText("2 个 ChatGPT 对话分片")).toBeVisible();
  await expect(page.getByText("Conversations：").locator("..")).toContainText("2");
  if (process.env.PALOS_ACCEPTANCE_SCREENSHOT_DIR) {
    await page.getByText("请选择同一次导出的全部 conversations-*.json 分片", { exact: false }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(process.env.PALOS_ACCEPTANCE_SCREENSHOT_DIR, "palos-v1102-split-export-prompt.png") });
  }
  await page.getByRole("button", { name: "全选", exact: true }).click();
  await page.getByRole("button", { name: "批量导入 2 个为新 Conversation" }).click();
  await expect(page.getByText("✅ 全部导入成功：2 个 Conversation")).toBeVisible();

  await page.locator("details").filter({ hasText: "Merge Conversation / 合并对话" }).locator("summary").click();
  await page.getByLabel("源 Conversation（内容来源）").selectOption({ label: "Split fixture A (ChatGPT)" });
  await page.getByLabel("目标 Conversation（合并到）").selectOption({ label: "Split fixture B (ChatGPT)" });
  await page.getByRole("button", { name: "Preview Merge" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Confirm Merge" }).click();
  const targetLink = page.getByRole("link", { name: "打开目标 Conversation →" });
  await expect(targetLink).toHaveAttribute("href", /\/conversation\/[^/]+$/);
  await targetLink.click();
  await expect(page).toHaveURL(/\/conversation\/[^/?]+$/);
  await expect(page.getByText("Split fixture B", { exact: true }).first()).toBeVisible();
});

test("rejects overlapping export parts before any import", async ({ page }) => {
  await page.goto("/import?importPath=new&inputMode=json");
  const duplicate = Buffer.from(exportPart("same-id", "Synthetic duplicate"));
  await page.locator('input[type="file"][accept*="application/json"]').setInputFiles([
    { name: "conversations-000.json", mimeType: "application/json", buffer: duplicate },
    { name: "conversations-001.json", mimeType: "application/json", buffer: duplicate },
  ]);
  await expect(page.getByText("所选文件包含重复的 Conversation ID", { exact: false })).toBeVisible();
  await expect(page.getByText("✅ 文件解析成功")).toHaveCount(0);
});

test("long Timeline pages through every Message and deep links to a later page", async ({ page }) => {
  const mapping: Record<string, unknown> = {};
  for (let index = 0; index < 120; index++) {
    mapping[`node-${index}`] = {
      id: `synthetic-message-${index}`,
      parent: index === 0 ? null : `node-${index - 1}`,
      message: {
        id: `synthetic-message-${index}`,
        author: { role: index % 2 ? "assistant" : "user" },
        content: { content_type: "text", parts: [`Synthetic message ${index + 1}`] },
      },
    };
  }
  await page.goto("/import?importPath=new&inputMode=json");
  await page.locator('input[type="file"][accept*="application/json"]').setInputFiles({
    name: "conversations.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify([{ id: "long-synthetic", title: "Long synthetic Timeline", current_node: "node-119", mapping }])),
  });
  await page.getByRole("button", { name: "全选", exact: true }).click();
  await page.getByRole("button", { name: "导入为新 Conversation", exact: true }).click();
  await page.getByRole("link", { name: "打开 →" }).click();
  await expect(page.locator("body")).toContainText("Messages: 120");
  const detailUrl = page.url();
  await page.getByRole("button", { name: "全部原文", exact: true }).click();
  await expect(page.locator('[id^="message-"]')).toHaveCount(100);
  await page.getByRole("button", { name: "下一段 →" }).click();
  await expect(page.locator('[id^="message-"]')).toHaveCount(20);
  const laterId = await page.getByLabel("选择第 110 条 Message").evaluate((input) => input.closest("li")?.id);
  expect(laterId).toBeTruthy();
  const deepLink = `${detailUrl}?message=${encodeURIComponent(laterId!.slice("message-".length))}#${laterId}`;
  await page.goto(deepLink);
  await expect(page.locator(`#${laterId}`)).toHaveAttribute("data-message-highlighted", "true");
  await page.goto(detailUrl);
  await page.goto(deepLink);
  await expect(page.locator(`#${laterId}`)).toHaveAttribute("data-message-highlighted", "true");
});
