# Epic A / Feature Set 1 — Conversation Editing Handoff

## 当前状态

Conversation 内的 Message 已可独立编辑、保存和取消；Timeline 已支持折叠、展开、搜索、跳转和高亮。Message 保存只更新 Message 与 Conversation 时间，不修改 Proposal Evidence 或 Knowledge Snapshot。未实现 Conversation Version、Merge、Split 或 Export，未创建 Git commit。

## Architecture Impact

- Entity：`Message` 新增 `updatedAt`。
- Storage：`BrowserMessageStorage` 对旧 Message 缺失的 `updatedAt` 回退到 `createdAt`，继续复用现有 key 和 `save()`。
- Service：新增 `message-editing` 用例，统一保存 Message 并更新 Conversation Last Updated。
- UI：Conversation Detail 增加 Message 编辑状态和 Timeline 阅读工具。
- Documentation：更新 ROADMAP、CHANGELOG、HANDOFF 与 QA Checklist。

## Part1 — Message Editing

- 每条 Message 提供 Edit；编辑器支持 Save 与 Cancel，空白内容不可保存。
- 编辑中显示 Editing，保存后显示 Saved。
- 保存后 Message `updatedAt` 和 Conversation `updatedAt` 使用同一时间戳。
- ProposalStorage 与 KnowledgeCardStorage 不参与编辑操作，已有 Evidence 与来源内容保持生成时 Snapshot。
- checkpoint：lint、build、diff-check 通过。

## Part2 — Timeline UX

- Timeline 默认全部展开；支持单条和全部 Collapse / Expand。
- 支持按 Message 内容搜索，显示命中数量与当前位置。
- 当前命中使用更强高亮；上一条、下一条循环跳转并滚动到目标，折叠目标会自动展开。
- 每条 Message 显示编号、角色与更新时间。

## 新增文件

- `src/core/services/message-editing.ts`

## 修改文件

- Entity：`src/core/entities/message.ts`
- Storage：`src/infrastructure/storage/browser-message-storage.ts`
- Service：`src/core/services/message-parser.ts`、`src/core/services/conversation-workspace.ts`
- UI：`src/app/conversation/[id]/conversation-detail.tsx`
- Documentation：`ROADMAP.md`、`CHANGELOG.md`、`HANDOFF.md`、`docs/QA_CHECKLIST.md`

## 手动验收

1. 打开包含 Messages 的 Conversation，编辑一条 Message，确认 Editing、Save、Saved 和刷新后持久化。
2. 编辑后取消，确认原内容和时间不变；空白内容不可保存。
3. 保存后核对 Conversation Last Updated 与 Message 时间变化。
4. 在编辑前生成 Proposal / Knowledge，再编辑 Message，确认两者 Evidence Snapshot 不变。
5. 测试单条及全部 Collapse / Expand，刷新后默认展开。
6. 搜索多条命中，核对高亮、计数、上一条、下一条和自动滚动/展开。
7. 回归 Message 多选 → Proposal → Review → Knowledge 流程。

## 已知限制

- Message 编辑不反向同步原始 Source；重新从 Source 覆盖生成 Messages 时，独立编辑仍会被替换，并保留现有确认提示。
- 搜索只匹配当前 Conversation 的 Message 内容，不搜索角色或时间。
- 编辑历史与 Conversation Version 尚未实现。
- LocalStorage 仍受单浏览器、容量与无事务限制；项目没有自动化测试套件。

## 下一步建议

- 先执行本 Handoff 与 QA Checklist 的 Conversation Editing Smoke Test。
- 如需 Conversation Version，应作为独立需求确认数据模型、迁移、恢复语义和 Snapshot 关系；不要由本 Feature Set 顺延实现。

---

# Previous Handoff — Sprint11 Clipboard Import Profiles / Preview / QA

## 当前状态

截至 2026-07-03，Sprint11A、11B、11C 已连续完成。Clipboard Import 现在使用来源 Profile 做本地纯文本预处理，导入前提供标题建议与解析预览，导入后提供可核对的统计和 Conversation 入口。未实现 JSON 文件导入、真实云 AI、Tag 自动推荐、数据库、RAG 或 Message 编辑；未创建 Git commit。

## Part 1 — Sprint11A Import Profiles

- 新增 `ImportProfile` Entity，包含 id、name、sourceType、description、roleAliases、createdAt、updatedAt。
- 新增 `ImportProfileService`，提供 ChatGPT、Claude、DeepSeek、Gemini、Manual、Plain Text 六种默认 Profile。
- Message Parser 接受 Profile 角色别名，并继续保护三反引号代码块。
- Clipboard 导入持久化 `importProfileId`、原始 Source 与按 Profile 解析的 Messages；只处理粘贴文本。
- checkpoint：lint、build、diff-check 通过。

## Part 2 — Sprint11B Smart Title & Preview

- 标题优先取第一条 User Message 前 30 字，无法解析时回退原文首个非空行；用户手动修改后不再被自动建议覆盖。
- 导入前展示预计 Message 总数、User / Assistant / Unknown 数量与前三条 Message。
- Unknown 超过 Message 总数一半时显示原文仍会保留的风险提示。
- checkpoint：lint、build、diff-check 通过。

## Part 3 — Sprint11C Import QA Polish

- 导入成功摘要展示 Conversation title、sourceType、message count、unknown count 与“进入 Conversation”按钮。
- Conversation Detail 展示 Import Profile 名称和说明，重新生成 Messages 继续使用保存的 Profile。
- Dashboard Recent Imports 明确展示 sourceType 与 message count。
- README、PROJECT、ARCHITECTURE、ROADMAP、CHANGELOG 与 QA Checklist 已同步。

## 新增文件

- `src/core/entities/import-profile.ts`
- `src/core/services/import-profile-service.ts`

## 修改文件

- Entity / Service：`src/core/entities/conversation.ts`、`src/core/services/message-parser.ts`
- UI：`src/app/import/clipboard-import-form.tsx`、`src/app/conversation/[id]/conversation-detail.tsx`、`src/app/dashboard-overview.tsx`
- 文档：`README.md`、`PROJECT.md`、`ARCHITECTURE.md`、`ROADMAP.md`、`CHANGELOG.md`、`HANDOFF.md`、`docs/QA_CHECKLIST.md`

## 手动验收步骤

1. 打开 `/import`，确认 TXT Import 保持可用，Clipboard Import 有六种 Profile 和对应说明。
2. 分别粘贴 ChatGPT、Claude、DeepSeek、Gemini 角色文本，核对标题建议、Message 总数、三类角色统计和前三条预览。
3. 修改自动标题后继续编辑原文，确认手动标题不被覆盖；使用无角色文本确认回退首行标题。
4. 选择 Plain Text 或构造高 Unknown 比例文本，确认出现指定风险提示且原文预览完整。
5. 完成导入，核对成功摘要的 title、sourceType、message count、unknown count，并点击进入 Conversation。
6. 在 Conversation Detail 核对 Import Profile 信息与 Message Timeline；重新生成 Messages 后确认角色结果仍符合原 Profile。
7. 打开 Dashboard，核对 Recent Imports 的 sourceType 与 message count 和详情一致。
8. 输入 JSON 字符串，确认它仅作为普通文本保留，不按 JSON 导出结构解析。
9. 回归 Source / Messages → Demo 或 Ollama → Proposal → Review → KnowledgeCard 流程。

## 已知限制

- 只处理粘贴纯文本的行首角色标记，不解析 ChatGPT、Claude、DeepSeek、Gemini 的 JSON 导出文件。
- Profile 是内置只读默认值，不提供自定义 Profile 管理界面。
- 角色识别是确定性规则，不处理复杂嵌套引用、平台 DOM、附件或 Message 编辑。
- Unknown 比例提示阈值为超过 50%；无角色文本完整保留为一条 Unknown Message。
- LocalStorage 仍受单浏览器、容量与无事务限制；项目没有自动化测试套件。

## 质量检查

- Sprint11A：lint、build、diff-check 通过。
- Sprint11B：lint、build、diff-check 通过。
- Sprint11C：lint、build、diff-check 通过。
- 最终检查：lint、build、diff-check 通过。
