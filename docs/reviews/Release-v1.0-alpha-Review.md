# Release Review — v1.0 Alpha Second Brain Workspace

## 1. Release decision

**结论：实现范围达到 v1.0 alpha 候选，但暂不建议标记正式 release-ready。**

Epic M–AB 的自动门禁已通过，产品主流程从 Conversation/Round 数据模型升级为可组织、可整理、可搜索、可导入导出的第二大脑工作台。当前 Release Blocker 是浏览器人工 QA 尚未执行，尤其是旧数据兼容、ChatGPT 增量导入和 App Data 恢复必须用隔离 profile 验证。

## 2. Scope delivered

- 多层 Workspace/Folder 与 Conversation Explorer。
- Classic/Workspace Mode、Round/Conversation Summary、Round 多 Knowledge。
- Proposal/Knowledge 易懂术语、人工确认与 Knowledge update snapshot。
- Import UX v2、Manual Round Builder、Analyzer 状态和临时 Provider。
- Search anchors、Asset metadata UX、Recipe foundation。
- Feedback/AppEventLog/Data Health、导航/Command Palette/Context Help。
- App Data Export/Import、实体导出、ChatGPT `conversations.json` 最小/增量导入。

## 3. Product contract

Conversation 是长对话线程；Round 是最小整理单位；Proposal 是 AI 整理建议；Knowledge 是已确认知识；Workspace/Folder 提供多层组织；Recipe 是本地工作流模板；Task 是可选行动项。

## 4. Data and migration risk

- 旧记录缺失新增字段时由 BrowserStorage 归一化，不做静默清空或破坏性 schema migration。
- App Data Import 会替换用户选择的 PALOS keys，因此必须在隔离 profile 验证 Preview、二次确认和失败回滚。
- ChatGPT tree 只取 current-node 主分支；分叉中的非当前分支不会导入。
- external message ID 是首选幂等键；缺失时 content hash 可能把内容完全相同的无 ID Message 判断为重复。
- 增量 ChatGPT 导入不会自动更新旧 Rounds，避免覆盖用户已整理的 Note/Summary/Knowledge 关系。

## 5. Explicit non-goals

不支持完整 ChatGPT zip 自动解析、附件、图片、tool call、canvas、voice、shared link。未实现数据库、RAG、Embedding、Agent、Calendar、Reminder、Cloud Sync、真实浏览器插件或真实 OpenAI/Claude API；没有 API key。

## 6. Verification status

- Automated: Epic M–AB lint/build/diff-check checkpoint passed.
- Manual browser QA: pending.
- Commit/push: none.

## 7. Release blockers and recommendation

Release Blocker：执行 `docs/qa/V10-MANUAL-QA-PLAN.md` 的 P0 测试并记录结果。在 App Data restore、旧 Conversation/Round 兼容、Analyzer failure UX、ChatGPT 首次/重复增量导入全部通过前，不建议 commit 为正式 v1.0 release；可以作为 alpha review candidate 保存工作树。
