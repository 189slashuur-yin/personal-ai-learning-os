import { expect, test } from "@playwright/test";

test("inline Round records autosave, inherit passively, and stay responsive", async ({
  page,
}) => {
  const title = "PALOS v1.7 Inline Autosave E2E";

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

  await expect(cards.nth(2)).toContainText("参考上下文：Round 1 的结论与下一步");
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
  await expect(cards.nth(2)).toContainText("参考上下文：Round 2 的结论与下一步");

  await page.reload();
  await expect(
    page.getByTestId("round-card").nth(0).locator('[data-round-record-field="notes"]'),
  ).toHaveValue("Round 1 note");
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
  await expect(thirdCard).toContainText("参考上下文：Round 1 的结论与下一步");
  await page.reload();
  await expect(page.getByTestId("round-card").nth(2)).toContainText(
    "参考上下文：Round 1 的结论与下一步",
  );

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

  await page.goto("/knowledge");
  await expect(page.locator('a[href^="/knowledge/"]')).toHaveCount(0);

  await page.goto("/conversation");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: `Delete ${title}` }).click();
  await page.reload();
  await expect(page.getByRole("link", { name: title, exact: true })).toHaveCount(0);
});
