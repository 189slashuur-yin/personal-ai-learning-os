import { expect, test } from "@playwright/test";

test("create, TXT import, reload, search, export, delete, and restore", async ({
  page,
}) => {
  const title = "PALOS v1.6.5 E2E Candidate";

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
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();

  await page.goto(
    `/import?importPath=existing&inputMode=txt&existingTargetId=${encodeURIComponent(conversationId!)}`,
  );
  await expect(page.getByText(`当前目标：${title}`, { exact: true })).toBeVisible();
  await page.locator('input[type="file"][accept*=".txt"]').setInputFiles({
    name: "v165-e2e.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "User: What makes a stable baseline?\nAssistant: Verified storage, reload, search, export, and restore.",
      "utf8",
    ),
  });
  await expect(
    page.getByText(/TXT parser v[\d.]+ · 2 Messages · 1 Rounds/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /追加文本到目标 Conversation/ })
    .click();
  await expect(page.getByText(/已追加到.*2 Messages · 1 Rounds/)).toBeVisible();

  await page.goto(detailUrl);
  await page.reload();
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Messages: 2");
  await expect(page.locator("body")).toContainText("Rounds: 1");
  await expect(page.locator("body")).toContainText("Sources: 1");

  await page.goto("/search");
  await page
    .getByPlaceholder("搜索 Conversation、已确认知识、Round、AI 整理建议…")
    .fill(title);
  await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();

  await page.goto("/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export App Data" }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).not.toBeNull();

  await page.goto("/conversation");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: `Delete ${title}` }).click();
  await page.reload();
  await expect(page.getByRole("link", { name: title, exact: true })).toHaveCount(0);

  await page.goto("/settings");
  await page
    .locator('input[type="file"][accept*="application/json"]')
    .setInputFiles(backupPath!);
  await expect(page.getByText(/Import Preview/)).toBeVisible();
  let restoreConfirmations = 0;
  page.on("dialog", async (dialog) => {
    restoreConfirmations += 1;
    await dialog.accept();
  });
  await page.getByRole("button", { name: "确认导入所选类型" }).click();
  await expect(page.getByText(/已导入并验证/)).toBeVisible();
  expect(restoreConfirmations).toBe(2);

  await page.goto("/search");
  await page
    .getByPlaceholder("搜索 Conversation、已确认知识、Round、AI 整理建议…")
    .fill(title);
  await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
});
