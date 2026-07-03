# Epic C — Search 2.0 Handoff

## 当前状态

Epic C Part 1–3 已实现。Search 已从三类关键词匹配升级为五类结构化本地检索中心；未新增存储结构，未创建 Git commit。

## Part 1 — Search Filter Model

- 新增 `SearchFilter`，支持 query、entityTypes、workspaceId、tagId、providerId、status 与 dateRange。
- 新增统一 `SearchResult`，包含 title、excerpt、matchedFields、Workspace、Tags、Provider、updatedAt 和实体路由。
- GlobalSearch 支持 Conversation、Proposal、KnowledgeCard、Tag、Workspace，并保留旧 `searchLearningOS(data, string)` 入口。
- 旧数据缺少 Workspace、Provider 或其它可选字段时安全回退，不修改或清空 LocalStorage。
- checkpoint：lint、build、diff-check 通过。

## Part 2 — Search UI 2.0

- `/search` 使用 300ms debounce，并支持类型、Workspace、Tag、Provider、状态组合筛选。
- 结果按 Conversations、Proposals、Knowledge、Tags、Workspaces 分组。
- 结果展示 title、excerpt、type badge，以及可用的 Workspace、Tags、Provider 和 updatedAt。
- 无结果显示 Empty State；空关键词展示按更新时间排序的最近 12 条内容。
- checkpoint：lint、build、diff-check 通过。

## Part 3 — Search Integration

- Dashboard 增加明确的 Global Search 2.0 入口；Knowledge 增加按 Knowledge 类型查看入口。
- Conversation Detail 增加带当前标题、Workspace 和类型的搜索入口。
- 每张 Workspace Card 增加“搜索此 Workspace”。
- Search URL 支持 `q`、`workspaceId`、`type`，交互后同步 URL，刷新可恢复三项状态。
- README、PROJECT、ARCHITECTURE、架构图、ROADMAP、CHANGELOG、HANDOFF 与 QA Checklist 已同步。

## 新增文件

- `src/core/entities/search-filter.ts`
- `src/core/entities/search-result.ts`

## 修改文件

- Core Service：`src/core/services/global-search.ts`
- Search UI：`src/app/search/page.tsx`、`src/app/search/search-experience.tsx`
- Integration UI：`src/app/dashboard-search.tsx`、`src/app/knowledge/page.tsx`、`src/app/conversation/[id]/conversation-detail.tsx`、`src/app/workspace/workspace-manager.tsx`
- Documentation：`README.md`、`PROJECT.md`、`ARCHITECTURE.md`、`ROADMAP.md`、`CHANGELOG.md`、`HANDOFF.md`、`docs/QA_CHECKLIST.md`、`docs/architecture/architecture-diagram.md`

## 手动验收步骤

1. 打开 `/search`，确认空关键词展示最近 12 条内容，并按五类分组。
2. 快速输入关键词，确认约 300ms 后更新；测试大小写、空格和无结果 Empty State。
3. 分别及组合测试类型、Workspace、Tag、Provider、状态筛选，并检查清除行为。
4. 核对结果 title、excerpt、type badge、Workspace、Tags、Provider、updatedAt 和点击跳转。
5. 打开 `/search?q=demo&workspaceId=inbox&type=conversation` 并刷新，确认状态恢复；修改三项后确认 URL 同步。
6. 从 Dashboard、Knowledge、Conversation Detail 和 Workspace Card 进入搜索，核对预设上下文。
7. 使用缺少新可选字段的旧 Conversation / Proposal / Knowledge 数据搜索，确认不报错、不改写数据。
8. 回归 Conversation → Proposal → Review → Knowledge，以及 Workspace、Tag、Provider 原流程。

## 已知限制

- Search 对当前 LocalStorage 集合执行同步线性扫描，适合单浏览器小数据量，不提供索引或相关性评分。
- 关键词使用大小写不敏感的子串匹配，不支持模糊匹配、拼写纠正或高级查询语法。
- URL 只持久化需求指定的 `q`、`workspaceId`、`type`；Tag、Provider、状态筛选刷新后重置。
- Tag 与 Workspace 结果进入现有管理或列表页，没有独立详情路由。
- 不包含数据库、RAG、Embedding、AI 搜索、云同步或权限系统。

## Architecture Impact

- Entity：新增 SearchFilter 与 SearchResult；SearchEntityType 覆盖五类可检索实体。
- Service：GlobalSearch 集中完成实体关系解析、统一映射、关键词匹配、结构化过滤和时间排序。
- Infrastructure：复用现有 BrowserStorage Adapter；不新增 LocalStorage key、迁移或索引。
- UI：`/search` 成为全局检索中心，四个业务入口通过 URL 传递搜索上下文。
- Compatibility：旧字符串搜索入口继续可用；旧记录的可选引用与元数据安全降级。

## 质量检查

- Part 1：lint、build、diff-check 通过。
- Part 2：lint、build、diff-check 通过。
- Part 3：lint、build、diff-check 通过。
- 最终检查：lint、build、diff-check 通过。

---

# Previous Handoff — Epic B / Workspace Foundation

## 当前状态

Epic B Part 0–4 已实现。项目新增单层 Workspace 与默认 Inbox，并完成 Conversation、Import、Dashboard、Search、Knowledge 和 QA 集成。未创建 Git commit。

## Part 0 — Architecture & Documentation

- 新增 Workspace 顶层架构图和 Phase1–Phase4 产品路线评审。
- RFC-001 固化 `Conversation → Source / Message → AnalyzerRun → Proposal → Review → KnowledgeCard` 核心链路。
- RFC-002 明确 Workspace 的价值、Inbox 兼容策略和单层边界。
- ADR-001 记录当前继续 LocalStorage-first；ADR-002 记录 Human Review 必须保留。
- 同步 README、ARCHITECTURE、ROADMAP 与本 Handoff；Part 0 未修改业务代码。

## Part 0 新增文件

- `docs/architecture/architecture-diagram.md`
- `docs/architecture/product-roadmap-review.md`
- `docs/rfc/RFC-001-architecture.md`
- `docs/rfc/RFC-002-workspace.md`
- `docs/adr/ADR-001-localstorage-first.md`
- `docs/adr/ADR-002-human-review-required.md`

## Part 1 — Workspace Foundation

- 新增 `Workspace` Entity、`WorkspaceStorage` Contract、`BrowserWorkspaceStorage` 与 `WorkspaceService`。
- WorkspaceService 支持 list、create、update、archive、restore、delete、getDefault 与 ensureDefault。
- 默认 Workspace 使用稳定 ID `inbox` 和名称 `Inbox`；Inbox 不可归档或删除。
- `Conversation.workspaceId` 为可选字段，BrowserConversationStorage 将旧数据安全视为 Inbox。
- 删除普通 Workspace 时只将关联 Conversation 回迁 Inbox，不删除 Conversation 或其关联实体。

## Part 1 新增文件

- `src/core/entities/workspace.ts`
- `src/core/contracts/workspace-storage.ts`
- `src/infrastructure/storage/browser-workspace-storage.ts`
- `src/core/services/workspace-service.ts`

## Part 2 — Workspace UI

- 新增 `/workspace` 页面并在全局导航增加 Workspace。
- 页面展示 Inbox 与全部 Workspace 的名称、描述、颜色、Conversation 数、Knowledge 数和更新时间。
- 支持创建、重命名、编辑描述与颜色、Archive、Restore 和 Delete。
- Workspace 删除前执行两次确认，并明确 Conversation 不会删除而会回到 Inbox。
- Inbox 可编辑元数据，但不可归档或删除。

## Part 3 — Conversation Workspace Integration

- Conversation 列表支持按 Workspace 筛选，Card 显示 Workspace 名称与颜色。
- Conversation Detail 展示并支持切换当前 Workspace；Archived Workspace 仅在当前已归属时保留可见。
- Clipboard Import 与 TXT Import 支持选择 Workspace，默认 Inbox。
- Dashboard 展示 Workspace 总数、最近 Workspace 和各 Workspace 的 Conversation 数。
- 全局搜索的 Conversation、Proposal、Knowledge 结果展示可追溯的 Workspace 信息。

## Part 4 — Workspace Operations & QA

- Workspace 页面增加 Empty State，以及 Active / Archived / All 筛选。
- Conversation 页面增加 Workspace 快捷筛选按钮。
- Knowledge 列表通过 KnowledgeCard / Proposal / Conversation 追溯 Workspace；无法追溯时显示 `unknown`。
- QA Checklist 增加 Workspace Smoke Test；同步 CHANGELOG、ROADMAP、HANDOFF 与 ARCHITECTURE。

## Epic B 新增文件

- `docs/architecture/architecture-diagram.md`
- `docs/architecture/product-roadmap-review.md`
- `docs/rfc/RFC-001-architecture.md`
- `docs/rfc/RFC-002-workspace.md`
- `docs/adr/ADR-001-localstorage-first.md`
- `docs/adr/ADR-002-human-review-required.md`
- `src/core/entities/workspace.ts`
- `src/core/contracts/workspace-storage.ts`
- `src/core/services/workspace-service.ts`
- `src/infrastructure/storage/browser-workspace-storage.ts`
- `src/app/workspace/page.tsx`
- `src/app/workspace/workspace-manager.tsx`

## Epic B 修改文件

- Entity / Storage：`src/core/entities/conversation.ts`、`src/infrastructure/storage/browser-conversation-storage.ts`
- Service：`src/core/services/global-search.ts`
- UI：`src/app/layout.tsx`、`src/app/conversation/conversation-list.tsx`、`src/app/conversation/conversation-card.tsx`、`src/app/conversation/[id]/conversation-detail.tsx`、`src/app/import/clipboard-import-form.tsx`、`src/app/import/txt-import-form.tsx`、`src/app/dashboard-overview.tsx`、`src/app/search/search-experience.tsx`、`src/app/knowledge/knowledge-list.tsx`
- Documentation：`README.md`、`ARCHITECTURE.md`、`ROADMAP.md`、`CHANGELOG.md`、`HANDOFF.md`、`docs/QA_CHECKLIST.md`

## 手动验收步骤

1. 首次打开 `/workspace`，确认 Inbox 自动创建且不可归档或删除。
2. 创建 Workspace，编辑名称、描述和颜色；刷新后确认持久化。
3. 测试 Active / Archived / All、Archive、Restore 和无结果 Empty State。
4. 删除一个含 Conversation 的 Workspace，分别取消两次确认，再完成两次确认；确认 Conversation 回到 Inbox 且关联数据保留。
5. 在 Clipboard Import 和 TXT Import 中选择 Workspace，确认默认 Inbox 与选择归属正确。
6. 在 Conversation 列表测试下拉和快捷筛选，核对 Card Workspace；在 Detail 切换归属并刷新。
7. 核对 Dashboard Workspace 总数、最近 Workspace 和 Conversation 数；核对全局 Search 结果的 Workspace。
8. 在 Knowledge 列表核对可追溯 Workspace；构造缺失 Conversation 引用时显示 `unknown` 且不报错。
9. 回归 Conversation → Source / Messages → Proposal → Review → KnowledgeCard，以及复制、级联删除和 Snapshot 流程。

## 已知限制

- Workspace 仅单层，不支持目录树、嵌套、排序或拖拽。
- Inbox 元数据当前可重命名和改色，但稳定 ID 始终为 `inbox`；它不可归档或删除。
- Workspace 删除与 Conversation 回迁是 LocalStorage 顺序写入，不具备事务。
- Knowledge Workspace 来自当前 Conversation 归属，不是生成时 Workspace 快照；无法追溯时显示 `unknown`。
- 当前没有数据库、账号、团队权限、云同步、RAG、Agent 或真实云 Provider。

## Architecture Impact

- Entity：新增 Workspace；Conversation 增加可选 `workspaceId`。
- Contract / Infrastructure：新增 WorkspaceStorage 与 BrowserWorkspaceStorage，集中管理 `ai-learning-os.workspaces`。
- Service：WorkspaceService 集中管理默认 Inbox、CRUD、Archive / Restore 和删除回迁。
- UI：新增 `/workspace`，并将 Workspace 上下文接入 Conversation、Import、Dashboard、Search 与 Knowledge。
- Compatibility：旧 Conversation 读取时归一为 Inbox，不静默清空历史数据。

## Commit 建议

建议拆分 commit：先提交 Part 0 架构文档；再提交 Workspace Entity / Contract / Storage / Service；最后提交 UI 集成与 QA 文档。当前按要求未创建 commit。

---

# Previous Handoff — Epic A / Feature Set 2 Conversation Versioning

## 当前状态

Conversation 已支持创建不可变 Snapshot，并可在明确确认后恢复任意 Snapshot。Snapshot 与当前 Conversation 使用独立生命周期；恢复只覆盖 Conversation 和 Messages，不恢复或修改 Proposal、Knowledge、AnalyzerRun、Tag、Provider，也不删除 Snapshot。未实现 Merge、Split 或 Export，未创建 Git commit。

## Architecture Impact

- Entity：新增 `ConversationVersion`，保存版本身份、名称、备注、创建时间、版本序号、Message 数和 `snapshotData`。
- Storage：新增 `ConversationVersionStorage` 与 `BrowserConversationVersionStorage`，使用独立集合并只追加 Snapshot；旧浏览器没有该 key 时安全返回空集合。
- Service：新增 `ConversationVersionService`，集中编排创建与恢复；恢复时更新 Conversation `updatedAt` 并以新 ID 重建 Messages。
- Conversation：当前 `Conversation` Entity 未新增版本字段；Workspace Service 仅在删除 Conversation 时清理其 Snapshots，复制时不复制历史版本。
- UI：Conversation Detail 增加 Snapshot 创建、数量、列表、Restore 确认与成功提示。
- Documentation：更新 ROADMAP、CHANGELOG、HANDOFF 与 QA Checklist。

新增 `ConversationVersion` 而不复用 `Conversation`，因为 Conversation 表示持续变化的当前工作区；Version 需要独立 ID、版本元数据和不可变的 Conversation + Messages 副本。复用 Conversation 会混淆当前态与历史态，并诱导直接修改历史记录。

## Part 3 — Conversation Snapshot

- Snapshot 名称必填，备注可选。
- `snapshotData` 深度复制当前 Conversation 与 Messages；不读取或保存 Proposal、Knowledge、AnalyzerRun、Tag 或 Provider。
- BrowserStorage 对同 ID 的 Snapshot 不执行覆盖，历史记录保持不可变。
- Conversation Detail 展示 Snapshot 数量、名称、备注、创建时间和 Message 数。
- checkpoint：lint、build、diff-check 通过。

## Part 4 — Restore Conversation

- 每个 Snapshot 提供 Restore；执行前明确提示当前 Conversation 与 Messages 会被替换，以及不受影响的实体。
- 恢复 Conversation 的快照字段，保持当前 Conversation ID，并将 `updatedAt` / `lastOpenedAt` 更新为恢复时间。
- 删除当前 Messages 后按快照内容重建，所有 Message 使用新 ID 和恢复时间。
- Restore 不写入 Proposal、Knowledge、AnalyzerRun、Tag、Provider 或 Version Storage；所有 Snapshots 原样保留。
- 恢复成功显示 `Restored successfully`。
- checkpoint：lint、build、diff-check 通过。

## 新增文件

- `src/core/entities/conversation-version.ts`
- `src/core/contracts/conversation-version-storage.ts`
- `src/infrastructure/storage/browser-conversation-version-storage.ts`
- `src/core/services/conversation-version-service.ts`

## 修改文件

- Service：`src/core/services/conversation-workspace.ts`
- UI：`src/app/conversation/[id]/conversation-detail.tsx`、`src/app/conversation/conversation-list.tsx`
- Documentation：`ROADMAP.md`、`CHANGELOG.md`、`HANDOFF.md`、`docs/QA_CHECKLIST.md`

## 手动验收

1. 在 Conversation Detail 输入名称与备注，创建 Snapshot，核对数量、时间、Message 数、名称与备注，刷新后仍存在。
2. 创建 Snapshot 后重命名 Conversation、编辑/覆盖 Messages，再取消 Restore，确认当前数据不变。
3. 确认 Restore，核对标题、来源类型和 Messages 恢复，Conversation 更新时间变化，Messages 获得新 ID，并显示成功提示。
4. Restore 前后核对 Proposal、Knowledge、AnalyzerRun、Tag、Provider 和 Snapshot 数量及内容均未改变。
5. 连续恢复不同 Snapshot，确认历史 Snapshot 不被覆盖或删除。
6. 复制 Conversation，确认副本不继承原历史 Snapshot；删除测试 Conversation，确认关联 Snapshot 随 Workspace 级联删除。
7. 回归 Source / Messages → Proposal → Review → Knowledge，以及 Message Editing / Timeline 流程。

## 已知限制

- Snapshot 不包含原始 Source；Restore 不改变 Source 编辑器内容。
- Restore 为 LocalStorage 顺序写入，不具备数据库事务；浏览器配额或写入中断可能造成部分写入。
- 恢复后 Message ID 会变化，因此旧 Proposal / Knowledge 的实时 Message 引用可能显示缺失，但其生成时 Evidence Snapshot 保持可读。
- Snapshot 不支持单独删除、重命名、比较或导出；仅在删除所属 Conversation 时级联清理。
- LocalStorage 仍受单浏览器、容量与无事务限制；项目没有自动化测试套件。

## 下一步建议

- 先执行本 Handoff 与 QA Checklist 的 Conversation Version Smoke Test。
- 后续如需 Merge、Split 或 Export，必须单独确认范围与验收，不从 Versioning 自动延伸。

---

# Previous Handoff — Epic A / Feature Set 1 Conversation Editing

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
