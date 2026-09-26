import { expect, test } from "@playwright/test";

test("Demo Analyzer Review accept and reject persist without runtime errors", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/conversation");
  await page
    .getByRole("button", { name: "创建 Conversation", exact: true })
    .first()
    .click();
  await page.getByPlaceholder("例如：产品设计复盘").fill("Review durability smoke");
  await page.getByRole("button", { name: "创建并打开" }).click();
  await expect(page).toHaveURL(/\/conversation\/[^/?]+$/);
  const detailUrl = page.url();

  await page
    .getByPlaceholder(/在这里粘贴 ChatGPT/)
    .fill("User: Review this evidence\nAssistant: Keep the durable result.");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  const proposalSection = page.locator("#section-proposal");
  await proposalSection
    .getByRole("button", { name: "可选：生成 AI 整理建议", exact: true })
    .click();
  await expect(proposalSection).toContainText("Completed");
  await proposalSection
    .getByRole("link", { name: "确认加入知识库", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/review\?proposalId=/);
  await page.getByRole("button", { name: "确认加入知识库", exact: true }).click();
  await expect(page).toHaveURL(/\/knowledge\/knowledge-card-/);
  await expect(page.getByTestId("knowledge-saved-evidence")).toContainText(
    "Review this evidence",
  );

  await page.goto(detailUrl);
  const proposalSectionAfterAccept = page.locator("#section-proposal");
  await proposalSectionAfterAccept
    .getByRole("button", { name: "可选：生成 AI 整理建议", exact: true })
    .click();
  await expect(proposalSectionAfterAccept).toContainText("Completed");
  await proposalSectionAfterAccept
    .getByRole("link", { name: "确认加入知识库", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "拒绝整理建议", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "已处理：Rejected", exact: true }),
  ).toBeDisabled();

  await page.reload();
  await expect(
    page.getByRole("button", { name: "已处理：Rejected", exact: true }),
  ).toBeDisabled();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
