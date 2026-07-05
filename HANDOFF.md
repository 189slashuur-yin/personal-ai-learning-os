# v1.0 Phase1 — Conversation / Round Implementation Handoff

## 当前状态

- 日期：2026-07-05
- 版本：v1.0 alpha draft
- 范围：Epic A–L implemented；M–Z/AA 未进入
- Git：未创建 commit、未 push
- 数据：未删除旧数据；未对用户浏览器实际执行 migration
- 验证：Epic A–L checkpoint 与最终 `npm run lint`、`npm run build`、`git diff --check` 均通过
- 人工 QA：尚未执行，因此不能标记正式 v1.0 release-ready

## Epic A–L 结果

- A Round Domain：新增 Round Entity、RoundStorage、BrowserRoundStorage、RoundService。
- B Migration：新增 deterministic preview/apply、migration summary、collision blocking 与 idempotent no-op；不删除或改写 Message，Q&A Pair 保持兼容。
- C Parser Pipeline：新增 ChatGPT、Claude、Gemini、DeepSeek、Markdown、TXT、Manual pure/versioned Parser；Confirm 通过 ImportService 写 canonical records。
- D Import UX：`/import` 提供 Paste、TXT、JSON 占位、Parser Preview、Round Preview、Confirm Import，完成后进入 Conversation。
- E Round-first UI：默认 Round 列表，支持搜索、折叠、Note、手动新增与编辑 Q/A；Message Timeline 默认折叠但旧功能保留。
- F Operations：支持删除、合并、拆分、上下重排、messageIds 重新绑定与受影响记录 updatedAt。
- G Proposal：新增 round/conversation/source/messages 来源；Round Analyze 为主入口之一，Conversation Summary 保留；Review 显示来源 Round。
- H Knowledge：新 Knowledge 可保存 sourceRoundId；旧 Knowledge 不回填；详情回链 Round，Round 显示 Knowledge 数量。
- I Search：新增 Round/Asset SearchDocument；默认 Conversation、Knowledge、Round、Proposal、Task、Asset，Raw Message 高级模式；Round 深链定位。
- J History：用户文案使用 History / 版本记录 / 恢复点；底层 ConversationVersion/Snapshot 方法未改名。
- K Compatibility：旧 Message/Q&A/Proposal/Knowledge/Search 可读；无 Round Conversation 可显式预检生成；Conversation copy/delete 协调 Round 和 provenance ID。
- L Documentation：同步核心文档、QA、alpha release draft 与 Migration Report。

## 关键文件

- Domain/Storage：`src/core/entities/round.ts`、`src/core/contracts/round-storage.ts`、`src/infrastructure/storage/browser-round-storage.ts`、`src/core/services/round-service.ts`
- Migration：`src/core/services/message-to-round-migration.ts`、`docs/migrations/Message-to-Round-v1.0-Phase1.md`
- Import：`src/core/entities/import-parser.ts`、`src/core/contracts/conversation-parser.ts`、`src/core/services/import-parser-pipeline.ts`、`src/core/services/import-service.ts`、`src/app/import/import-workbench.tsx`
- Round UI：`src/app/conversation/[id]/round-workspace.tsx`、`src/app/conversation/[id]/conversation-detail.tsx`
- Provenance/Search：Proposal、KnowledgeCard、AnalyzerExecution、Review、Knowledge Detail、SearchIndexService 与 SearchExperience 的对应文件
- Release：`docs/releases/v1.0-alpha.md`、`docs/QA_CHECKLIST.md`

## Breaking Changes

None。所有新 provenance 字段为 optional；旧 Message、Q&A Pair、Proposal、KnowledgeCard、ConversationVersion 与旧 Search type 仍可读取。新 Round 使用独立 LocalStorage key，迁移不自动执行。

## Known Issues

- 当前 additive apply 不是 Phase0 设计中的完整 recovery-export/staging/commit-marker transaction；不得用于破坏性 schema 替换。
- Provider parser 当前是确定性 labeled-text parser，不解析原生 ChatGPT/Claude/Gemini/DeepSeek JSON export；JSON UI 明确只占位。
- Round Q/A/messageIds 是兼容投影；后续 Message 编辑不会自动反向同步 Round。
- Split 使用文本与 messageIds 中点，需要人工复核。
- 现有 Conversation 删除对独立 Proposal/Knowledge 的级联语义未在本 Phase1 改写，仍是后续架构对齐项。
- 没有自动化测试套件；人工 QA 未执行。

## Manual QA

1. 先用可丢弃浏览器 profile 或测试数据执行 `docs/QA_CHECKLIST.md` 的 V10-01–12。
2. 对 answered/unanswered/orphan/context/unknown/empty 旧 Conversation 比对迁移前后 Message ID、内容、顺序。
3. 逐一验证七种 Parser、TXT、取消 Confirm、JSON 占位与导入后跳转。
4. 覆盖全部 Round 操作、Round Analyze → Review → Knowledge、Search 深链与 History restore。
5. 回归 v0.9 Search/Asset、旧 Q&A Pair、Proposal Evidence、Knowledge Source、Task SourceRef 与 Conversation copy/delete。

## Remaining TODO

- 执行并记录 Phase1 人工 QA；在通过前保持 alpha draft。
- 完成 recovery export/staging/checksum/commit marker/rollback 后，才能讨论任何破坏性 schema migration。
- 原生 provider JSON parsers、projection 同步策略、独立 Proposal/Knowledge 删除语义需要新批准范围。
- 停止在 Epic L；不要进入 M–Z/AA，不要创建 commit。

---

# Previous Handoff — v1.0 Phase0 Architecture Freeze Candidate

## 当前状态

Part0–Part7 的文档级 Architecture Freeze candidate 已完成。Conversation、Round、Proposal、Knowledge、Search 与 Import 的最终关系已无未解决的所有权冲突，但仍等待人工整体批准。当前 runtime 仍是 v0.9 draft；没有实现 Round、没有执行 Message migration、没有修改 LocalStorage、没有创建 commit。

## 最终架构结论

- Conversation 表示一个逻辑对话线程，不表示 Import、主题或项目；Workspace 表达项目/主题，一次 Import 可创建多个 Conversation。
- Conversation 保持 Aggregate Root。Round 是有稳定 ID 的子实体，负责 Message 分组；Question/Answer 是投影，不单独持久化。
- Round 不拥有 Proposal、Knowledge 或 Task。三者保留独立生命周期，通过 typed reference 与 evidence/source snapshot 关联来源。
- 不新增 Session；Conversation、Round、Workspace、ImportReceipt 已覆盖候选语义。
- Review 成为不可变的人工 ReviewDecision；Accepted Proposal 仍需显式幂等 apply，才能创建 Knowledge 或追加 KnowledgeRevision。
- Search 默认结果冻结为 Conversation、Knowledge、Round、Proposal、Task、Asset、Raw Message；Search 仍是非持久化只读模型。
- Import Parser 纯函数化、版本化；Clipboard 是 channel，GPT Export、Claude Export、Markdown、TXT、JSON 是 format；必须 Preview + 人工确认后写入。
- Conversation 默认删除只删除其 Source/Round/Message/Version/Note 与 owner metadata；Proposal、Knowledge、Task、ImportReceipt 保留并降级 live reference。Privacy erasure 必须是独立、显式、展示完整影响的操作。

## Part0–Part7 结果

- Part0 Architecture Review：阅读核心文档、全部 RFC/ADR、QA/Release，并只读核对 Entity/Service/Storage 当前关系；输出 `Architecture-Review-v1.0-Phase0.md`。
- Part1 Conversation Definition：冻结为一个逻辑对话线程，明确排除 import/topic/project 含义。
- Part2 Round Definition：输出 RFC-005 与 ADR-004；Round 不是 Aggregate Root，不引入 Session。
- Part3 Migration Design：输出 Message → Round migration design；包含 deterministic grouping、dry-run、recovery snapshot、staging、validation、commit marker、rollback、idempotency 与 legacy compatibility。
- Part4 Search Design：RFC-007 统一 Search Result contract、默认七类结果、facet/context/anchor/missing-reference 语义。
- Part5 Import Design：RFC-006 定义六类输入、Parser contract、preview/diagnostics、ImportReceipt 与 failure/recovery。
- Part6 Knowledge Lifecycle：RFC-008 定义 Proposal、ReviewDecision、Knowledge、KnowledgeRevision 与 provenance 生命周期。
- Part7 Architecture Freeze：同步 Architecture、Project、Roadmap、architecture pack、RFC/ADR、Changelog、README 与 Handoff；输出 Freeze Report。

## 新增文件

- `docs/reviews/Architecture-Review-v1.0-Phase0.md`
- `docs/reviews/Architecture-Freeze-v1.0-Phase0.md`
- `docs/rfc/RFC-005-conversation-round-model.md`
- `docs/rfc/RFC-006-import-parser-contract.md`
- `docs/rfc/RFC-007-search-result-contract.md`
- `docs/rfc/RFC-008-proposal-review-knowledge-lifecycle.md`
- `docs/adr/ADR-004-conversation-remains-aggregate-root.md`
- `docs/design/Message-to-Round-Migration-v1.0.md`

## 修改文件

- `README.md`
- `PROJECT.md`
- `ARCHITECTURE.md`
- `ROADMAP.md`
- `CHANGELOG.md`
- `HANDOFF.md`
- `docs/design/V1.0-Product-Backlog.md`
- `docs/rfc/RFC-003-task-domain.md`
- `docs/rfc/RFC-004-data-and-search-foundation.md`
- `docs/adr/ADR-002-human-review-required.md`
- `docs/architecture/DOMAIN_MODEL.md`
- `docs/architecture/DOMAIN_BOUNDARIES.md`
- `docs/architecture/DATA_LIFECYCLE.md`
- `docs/architecture/architecture-diagram.md`

## 人工批准清单

必须整体确认以下决定，不能只批准其中一部分后直接实现：

1. Conversation = 一个逻辑对话线程。
2. Round = Conversation 子实体，不是 Aggregate Root。
3. 不引入 Session。
4. Proposal/Knowledge 默认不随 source 删除。
5. ReviewDecision 与 KnowledgeRevision 进入 target Domain。
6. Search 使用七类默认结果。
7. Import 使用 pure/versioned Parser + Preview/Confirm。
8. Migration 只有在 recovery export、staging、validation、rollback 完成后才能运行。

如任何一项不同意，应重新打开 Phase0；批准前不要创建实现 Sprint。

## 范围与限制

- 未修改 `src/`、package、依赖或 runtime。
- 未实现 Round、Parser、ReviewDecision、KnowledgeRevision 或新 SearchResult。
- 未新增/修改 LocalStorage key，未执行 migration。
- 未实现 RAG、Embedding、Agent、Calendar、Reminder、Cloud Sync、数据库或云 Provider。
- 未创建 commit 或推送。
- v0.9 release-blocking 人工 QA 仍待执行；本轮文档检查不等于手工产品验收。

## 质量检查

- `npm run lint`：通过。
- `npm run build`：通过；Next.js production build 成功生成 16 个路由。
- `git diff --check`：通过。

## 下一步

停止并等待人工批准。批准后也不要直接实现全部模型；先把 recovery/export prerequisite 与 Message → Round migration acceptance criteria 拆成单独 Sprint，再按冻结边界逐步实施。

---

# Previous Handoff — v0.9 Release Blocker Fix / Asset owner lifecycle

## 当前状态

Conversation / Asset owner lifecycle 的已知 release blocker 已完成代码修复与文档同步。复制 Conversation 现在会复制其 Asset metadata，为每条副本生成新 ID，并将 `entityId` 指向新 Conversation；删除 Conversation 会删除其关联 Asset metadata。两项操作都不会复制、读取或删除真实文件，也不会影响 Knowledge、Task 或 Workspace 的 Asset metadata。版本仍为 v0.9 draft，等待 EDGE-12 与完整人工 QA。

## Part 1 / 2 / 3 完成情况

- Part 1 — Lifecycle：`AssetService` 新增按 owner 删除和复制 metadata 的规则；副本保留文件名、原始名称、路径、备注、hash、MIME 与 size，并刷新 ID、owner 和时间。
- Part 2 — Service 集成：Conversation Workspace Service 通过可选 `AssetStorage` 协调 delete / duplicate；BrowserAssetStorage 对缺失、非数组、损坏 JSON 和异常记录安全降级，Asset 异常不会阻断 Conversation 主操作。
- Part 3 — UI / 文档 / QA：Conversation Detail 明确删除 owner 只删除 metadata、不删除真实文件；EDGE-12 更新为 copy + delete blocker 复测；两份 Review 已记录 blocker 修复状态。

## 新增文件

- 无。

## 修改文件

- `src/core/services/asset-service.ts`
- `src/core/services/conversation-workspace.ts`
- `src/infrastructure/storage/browser-asset-storage.ts`
- `src/app/conversation/conversation-list.tsx`
- `src/app/conversation/[id]/conversation-assets.tsx`
- `docs/qa/V09-MANUAL-QA-PLAN.md`
- `docs/reviews/Release-v0.9-Review.md`
- `docs/reviews/Architecture-Risk-Review-v0.9.md`
- `HANDOFF.md`

## 手动复测步骤

1. 在 Conversation A 登记至少两条 Asset metadata，分别包含路径、备注，并用只读 Application 面板记录 ID；如使用 fixture，再覆盖 originalName、hash、MIME 与 size。
2. 另建 Knowledge、Task、Workspace owner 的 Asset metadata 作为隔离样本。
3. 复制 Conversation A，确认副本 Asset 数量一致、每条 ID 全新、`entityId` 指向副本 Conversation，且 metadata 字段保持；确认未复制或读取真实文件。
4. 删除原 Conversation A，确认其 Asset metadata 被清理；副本和 Knowledge、Task、Workspace metadata 保留，真实本地文件仍存在。
5. 用无 Asset key、缺字段记录、非数组 JSON 与损坏 Asset JSON 的旧数据 profile 分别执行复制/删除，确认 Conversation 主操作不白屏且其它集合未被清空。
6. 按 `docs/qa/V09-MANUAL-QA-PLAN.md` 执行更新后的 EDGE-12，再继续完整 release-blocking 人工 QA。

## Release blocker 与 commit 建议

- 已知 Asset owner lifecycle release blocker：已修复，等待 EDGE-12 人工复测确认。
- 其它 release blocker：当前代码/文档核查未发现；完整人工 QA 尚未执行，因此不能声明 release-ready。
- Commit：本轮按要求未创建。建议 EDGE-12 及完整阻塞项人工 QA 通过后，再创建聚焦的 v0.9 stabilization commit。

## 质量检查

- Part 1：`npm run lint`、`npm run build`、`git diff --check` 通过。
- Part 2：`npm run lint`、`npm run build`、`git diff --check` 通过。
- Part 3：`npm run lint`、`npm run build`、`git diff --check` 通过。
- 最终：`npm run lint`、`npm run build`、`git diff --check` 通过。

---

# Previous Handoff — v0.9 Release Stabilization & QA Review

## 当前状态

- Current Version：v0.9 draft
- Current Focus：Data Foundation & Search stabilization and manual QA
- Next Recommended Phase：v1.0 planning
- Release Review 结论：v0.9 数据与搜索主目标基本满足，但只读核查发现 Conversation copy/delete 未协调 Asset metadata；删除会留下 UI 不可达的 orphan，复制不会带入 metadata。该问题与尚未执行的 50 条人工 QA 共同阻塞正式发布，因此继续保持 draft。
- 本轮仅新增/修改文档；未修改 `src/`、package，未删除文件，未创建 commit。

## Part 1–5 完成情况

- Part 1 — Release Review：完成 `Release-v0.9-Review.md`，覆盖 v0.9 范围、数据/搜索架构、Note、SearchDocument、fuzzy、Asset、备份、Data Management、限制、技术债与目标判断。
- Part 2 — Manual QA Execution Plan：完成 10 条 Smoke、20 条 Regression、20 条 Edge Case；每条均含操作、预期、失败影响、release blocker 与人工/自动化标记。
- Part 3 — v1.0 Product Backlog：完成非目标、必须解决问题和五个候选 Epic；推荐 Export / Import 与 Search Anchors，限制 Asset 托管与真实云 Provider 扩张。
- Part 4 — Architecture Risk Review：完成稳定边界、失控点、LocalStorage、Asset、Search、Provider、数据库迁移及修复顺序评审。
- Part 5 — Documentation Consistency Check：统一 README、PROJECT、ARCHITECTURE、ROADMAP、CHANGELOG、HANDOFF 的版本、当前重点与下一阶段口径。

## 新增文件

- `docs/reviews/Release-v0.9-Review.md`
- `docs/qa/V09-MANUAL-QA-PLAN.md`
- `docs/design/V1.0-Product-Backlog.md`
- `docs/reviews/Architecture-Risk-Review-v0.9.md`

## 修改文件

- `README.md`
- `PROJECT.md`
- `ARCHITECTURE.md`
- `ROADMAP.md`
- `CHANGELOG.md`
- `HANDOFF.md`

## 范围确认

- 没有修改 `src/`。
- 没有修改 `package.json`、lockfile 或依赖。
- 没有新增业务功能或运行时行为。
- 没有删除文件。
- 没有创建 commit 或推送。
- 只读检查了 Asset Service、BrowserAssetStorage 与 Conversation Workspace Service，用于确认 blocker；没有修改业务代码。

## 检查结果

- Part 1：`npm run lint`、`npm run build`、`git diff --check` 通过。
- Part 2：`npm run lint`、`npm run build`、`git diff --check` 通过。
- Part 3：`npm run lint`、`npm run build`、`git diff --check` 通过。
- Part 4：`npm run lint`、`npm run build`、`git diff --check` 通过。
- Part 5 最终：`npm run lint`、`npm run build`、`git diff --check` 通过。
- 首次 Part 1 build 在受限沙箱内因 Turbopack 无法绑定本地端口失败；使用相同 `npm run build` 在允许构建的环境重跑后通过。Part 5 首次 build 又遇到 `.next` 增量目录瞬时 `ENOTEMPTY`，未删除文件，原命令重跑后通过；各 Part 最终 build 结果均通过。
- 这些是自动质量门禁结果，不代表 50 条人工 QA 已执行。

## 明天建议先做什么

明天先为 Conversation copy/delete 与 Asset metadata 生命周期单独确认产品语义和验收标准：建议删除 owner 时只清理 metadata、绝不删除外部文件；复制是否复制 metadata 引用需明确决定。完成对应业务代码任务后，先复测 EDGE-12，再按 `docs/qa/V09-MANUAL-QA-PLAN.md` 在全新浏览器 profile 执行 SMK-01–10。Smoke 全过后再进入旧数据 Regression 和异常 profile Edge Case；任何数据丢失、失败写 Proposal、删除本地文件、旧数据清空或误导完整备份的问题都应立即阻塞 release。全部阻塞项通过后，再决定把版本从 `v0.9 draft` 切为 `v0.9`，并召开 v1.0 planning 范围评审。

# Previous Handoff — v0.9 Draft Data Foundation & Search

## 当前状态

Part 0–9 已实现；所有分段 checkpoint 与 Part 9 最终门禁均通过。未创建 Git commit，手工 QA 尚未执行，因此版本保持 v0.9 draft。

## Part 0–9 完成情况

- Part 0：新增 RFC-004 与 ADR-003，冻结 Raw / Interpreted、搜索演进、Asset 与备份边界。
- Part 1：Conversation 增加可选 note、旧数据归一化、详情编辑/保存/取消与搜索覆盖。
- Part 2：新增 SearchDocument 与 SearchIndexService，运行时构建九类文档，不持久化索引。
- Part 3：`/search` 展示具体文本片段、来源路径、Workspace、matched fields，并按相关度排序。
- Part 4：加入 normalized subsequence fuzzy 与 exact / contains / fuzzy 标记；未新增依赖。
- Part 5：新增 Asset Entity / Contract / BrowserStorage / Service 与 Conversation metadata UI。
- Part 6：新增项目白名单备份脚本，支持默认 `backups/` 与自定义 target。
- Part 7：Settings / Help 增加 Data Management、复制备份命令与边界说明。
- Part 8：Task 保留但改为可选次要动作；Analyze 继续为主按钮。
- Part 9：同步产品、架构、Roadmap、QA、生命周期、Changelog 与 v0.9 Release Draft。

## v0.9 新增文件

- `docs/rfc/RFC-004-data-and-search-foundation.md`
- `docs/adr/ADR-003-local-asset-library.md`
- `docs/releases/v0.9-draft.md`
- `scripts/backup-local-data.mjs`
- `src/core/entities/search-document.ts`
- `src/core/services/search-index-service.ts`
- `src/core/entities/asset.ts`
- `src/core/contracts/asset-storage.ts`
- `src/infrastructure/storage/browser-asset-storage.ts`
- `src/core/services/asset-service.ts`
- `src/app/conversation/[id]/conversation-assets.tsx`
- `src/app/settings/data-management.tsx`

## v0.9 修改文件

- `.gitignore`
- `src/core/entities/conversation.ts`
- `src/infrastructure/storage/browser-conversation-storage.ts`
- `src/core/services/global-search.ts`
- `src/app/conversation/[id]/conversation-detail.tsx`
- `src/app/search/page.tsx`
- `src/app/search/search-experience.tsx`
- `src/app/settings/page.tsx`
- `src/app/help/page.tsx`
- `README.md`、`PROJECT.md`、`ARCHITECTURE.md`、`ROADMAP.md`、`CHANGELOG.md`、`HANDOFF.md`
- `docs/QA_CHECKLIST.md`
- `docs/architecture/DOMAIN_MODEL.md`
- `docs/architecture/DATA_LIFECYCLE.md`

## 手动验收步骤

1. 使用旧浏览器数据打开 Conversation，确认 note 缺失安全；测试编辑、取消、保存、刷新和 updatedAt。
2. 在 Note、Source、Message、Q&A、Proposal evidence、Knowledge、Task SourceRef 写入唯一词并从 `/search` 检索。
3. 核对 snippet、matched fields、Workspace、来源路径、相关度顺序和实体跳转；组合 type / Workspace 筛选并刷新。
4. 分别搜索完整值、子串与 `oa`，确认 exact / contains / fuzzy 及弱匹配低分。
5. 添加、刷新、取消删除和确认删除 Conversation Asset metadata；确认本机文件从未读取或删除。
6. 分别运行默认和自定义 target 备份命令，确认不覆盖旧目录且不读取项目外源文件。
7. 检查 Settings / Help 的 Data Management 和复制命令；确认没有浏览器执行脚本入口。
8. 选择 Messages，确认 Analyze 是主动作，Create Task（可选）为次要动作。
9. 完整执行 `docs/QA_CHECKLIST.md` 的 V09-01 至 V09-10，并回归 Import → Proposal → Review → Knowledge。

## 已知限制

- fuzzy 只是 normalized subsequence，不是编辑距离、拼写纠正或语义搜索；短词可能产生宽泛弱匹配。
- 索引在页面运行时同步重建，适合当前单浏览器小数据量。
- Message / Q&A 结果打开所属 Conversation，但暂不滚动到精确锚点。
- Asset 只保存 metadata/path，不验证文件存在、不复制文件；删除 metadata 不删除文件。
- 备份脚本不导出浏览器 LocalStorage，也不跟随外部 Asset 路径。
- 手工 QA 尚未执行，没有自动化测试套件。

## Architecture Impact

- Raw / Interpreted：Conversation / Source / Message 保持原始层；Proposal 是解释草稿；Knowledge 是人工确认结果。
- Search：SearchDocument 是非持久化读模型，SearchIndexService 不拥有或修改 canonical data。
- Storage：Conversation note 与 Asset metadata 均经 Contract / BrowserStorage；Page 未直接访问 LocalStorage。
- Asset：文件内容位于用户控制的文件系统，浏览器只保存 metadata 引用。
- Backup：Node 脚本只读取项目白名单内容，target 仅用于输出。
- AI / Safety：未增加 Provider、API Key、RAG、Embedding 或自动接受 Proposal。

## 是否建议 commit

建议先完成 V09-01 至 V09-10 手工 QA；通过后再创建一个聚焦的 v0.9 commit。本轮按要求不创建 commit。

## 质量检查

- `npm run lint`：通过。
- `npm run build`：通过；Next.js production build 成功生成 16 个路由。
- `git diff --check`：通过。
- Part 4 首次 build 发现局部 TypeScript `flatMap` 联合类型推断错误；按规则做一次显式候选类型的最小修复后完整重跑通过。

---

# Previous Handoff — v0.8 Draft Product Onboarding + Conversation Q&A Pair UX

## 当前状态

Part 1–8 已完成，所有分段 checkpoint 与最终自动质量门禁均通过；未创建 Git commit。手工 QA 尚未执行，因此版本状态为 v0.8 draft，不标记正式发布。

## Part 1–8 完成情况

- Part 1：新增 `/help` 中文操作手册、核心概念、推荐流程和 Ollama Analyze 边界；导航增加 Help。
- Part 2：Settings 收敛为 Demo / Ollama；Ollama 只有 enabled 且 Test Success 后才能设为当前 Provider；Dashboard 与 Settings 读取同一当前选择；默认模型为 `qwen3:8b`。
- Part 3：新增无持久化 Q&A Pair 类型与派生服务，覆盖连续 Assistant、未回答、Orphan Assistant 与 Unknown。
- Part 4：Conversation 支持 Timeline / Q&A Pair 双视图、Pair 搜索、三种排序、展开折叠、多选和复用 Messages Analyze。
- Part 5：Conversation 顶部增加原始内容、Messages、Q&A Pair、Analyze、Review、Knowledge 六步动态引导。
- Part 6：Knowledge 明确 Active / Archived 语义，推荐 Archive；Delete Forever 移入双重确认 Danger Zone。
- Part 7：Dashboard 横向显示最近 8 条 Conversation、标题和 60 字原文/首条 Message 摘要。
- Part 8：更新 README、ROADMAP、CHANGELOG、HANDOFF、QA Checklist，并新增 v0.8 draft Release Notes。

## 新增文件

- `src/app/help/page.tsx`
- `src/core/entities/qa-pair.ts`
- `src/core/services/qa-pair-service.ts`
- `docs/releases/v0.8-draft.md`

## 修改文件

- `src/app/layout.tsx`
- `src/app/dashboard-overview.tsx`
- `src/app/settings/provider-settings.tsx`
- `src/app/conversation/[id]/conversation-detail.tsx`
- `src/app/knowledge/[id]/knowledge-detail.tsx`
- `src/core/services/provider-service.ts`
- `src/core/services/provider-configuration-service.ts`
- `README.md`
- `ROADMAP.md`
- `CHANGELOG.md`
- `HANDOFF.md`
- `docs/QA_CHECKLIST.md`

## 手动验收步骤

1. 执行 `docs/QA_CHECKLIST.md` 的 V08-01 至 V08-12；分别使用全新浏览器数据和保留 Sprint1–Sprint6 数据的浏览器配置。
2. 在 `/settings` 验证 Ollama 未启用、未测试、测试失败、测试成功、设为当前、禁用回退六条路径，并核对 Dashboard。
3. 导入含 User、Unknown、连续 Assistant、未回答 User 和纯 Assistant 的材料，核对 Pair 派生、搜索、排序、折叠与选择映射。
4. 从一个或多个 Pair Analyze，确认 Proposal 仍保存 selected Message IDs、Evidence 和 messages analysis mode；Review / Knowledge Snapshot 不变。
5. 逐步构造六种 Conversation 状态，核对流程条突出项和 Help 链接。
6. 在 Knowledge 验证 Archive / Restore，并分别取消两次 Delete Forever 确认；只在隔离数据中执行最终删除。
7. 创建至少 9 条 Conversation，核对 Dashboard 最近 8 条的顺序、摘要和链接。

## 已知限制

- Q&A Pair 由 Messages 实时派生，不支持手动拆分、合并、拖拽或独立持久化；System Message 作为独立 context Pair 保留。
- Pair 的最近更新排序依赖 Message `updatedAt`，旧数据回退 `createdAt`。
- Pair 选择最终仍是 Message 选择；Proposal 和 Knowledge 不保存 Pair ID，这是保持现有快照兼容的设计。
- Ollama 测试成功只代表测试时本地 `/api/tags` 可达；之后服务停止时 Analyze 仍会按现有错误隔离流程失败。
- 数据仍限当前浏览器 LocalStorage；没有数据库、备份、同步或多人协作。
- 手工 QA 尚未执行。

## Architecture Impact

- Entity：新增仅运行时使用的 `QAPair` / `QAPairKind`，不改变 Message、Proposal 或 KnowledgeCard。
- Service：新增纯函数 `deriveQAPairs()`；ProviderService 增加 Ollama enabled + Test Success 双重门禁。
- Infrastructure：没有新增或修改 storage key，没有数据迁移；所有持久化继续经 BrowserStorage。
- Page：新增 Help；Conversation 只把 Pair 选择映射回现有 `selectedMessageIds`；Knowledge 与 Dashboard 为展示层增强。
- AI / Safety：没有新增 Provider、API Key 或云调用；Analyzer 仍只能生成 Proposal，Review 仍是 Knowledge 必经步骤。

## 质量检查

- 每个 Part 后：`npm run lint`、`npm run build`、`git diff --check` 均通过。
- 最终检查：通过。
- Part 1 首次 build 因沙箱禁止 Turbopack 绑定内部端口失败；按规则在允许环境重跑一次后通过，后续构建均通过。

## 是否建议 commit

建议先完成 V08-01 至 V08-12 手工验收；无阻断问题后再创建一个聚焦的 v0.8 commit。本轮按要求不创建 commit。

---

# Previous Handoff — Release v0.7 Review

## 当前状态

已完成 v0.7 Release Review。本轮只新增发布评审文档并更新 Handoff，没有修改 `src/`、运行时行为、存储结构、依赖或 ROADMAP，也没有新增功能或创建 Git commit。

## 交付结果

- 新增 `docs/reviews/Release-v0.7-Review.md`。
- 评审覆盖 v0.7 完成范围、知识与行动核心链路、可日常使用流程、已知限制、技术债、v0.8 候选方向和手动验收建议。
- v0.8 仅建议评估 Epic E — Knowledge Productivity；范围、数据模型和验收标准仍需产品负责人单独批准。
- ROADMAP 当前已明确 Epic D 完成、Epic E 为建议下一步及范围护栏，因此本轮无需修改。

## Review 结论

v0.7 已形成“收集材料—生成 Proposal—人工 Review—沉淀 Knowledge—创建 Task—Today 执行—Search 检索”的本地日常闭环，适合单人、单浏览器、小数据量使用。主要发布风险仍是 LocalStorage 数据安全、缺少自动化测试，以及新旧浏览器数据上的手工兼容回归。

## 质量检查

- `npm run lint`：通过。
- `npm run build`：通过。
- `git diff --check`：通过。
- 手工 QA：本轮未执行；应按评审文档和 `docs/QA_CHECKLIST.md` 分别使用全新数据与 Sprint1–Sprint6 历史数据执行。

## 下一步

1. 执行 `V07-01` 至 `V07-08` 以及知识主链路、Conversation Restore 和破坏性操作边界回归。
2. 手工验收通过后，再由产品负责人决定 v0.7 发布判定和 v0.8 范围。
3. 不从本次评审顺延 Activity、Agent、RAG、Calendar、Reminder、Recurring Task、云 Provider 或自动化。

---

# Previous Handoff — Epic D D4 Task Search + Release v0.7 Stabilization

## 当前状态

当前版本为 v0.7 Daily Learning Workflow，Epic D 已完成。本轮已完成 Task Search Integration、Task Search Filters、v0.7 Release Documentation 与 Release Stabilization。未创建 Git commit，未实现 Activity、Calendar、Reminder、Recurring Task、Agent、RAG、数据库或 AI Suggest Task。

## Part 完成情况

- Part 1：Task 已接入 Search 2.0，覆盖 title、description、SourceRef titleSnapshot / summarySnapshot；新增 Task 分组、类型筛选、结果元数据和带 `q` 的 `/tasks` 跳转。
- Part 2：Search 增加 Task Workspace、status、priority、type 筛选；Task 专属筛选不影响非 Task 结果，空搜索最近更新可包含 Task，URL 继续恢复 `q`、`type`、`workspaceId`。
- Part 3：新增 `docs/releases/v0.7.md`，并同步 README、ROADMAP、CHANGELOG、HANDOFF、ARCHITECTURE 与 QA Checklist。
- Part 4：主导航已包含 Dashboard、Workspace、Conversation、Import、Search、Today、Tasks、Knowledge、Tags、Settings；README、PROJECT、ROADMAP、HANDOFF、ARCHITECTURE 与 QA 的 v0.7 口径已统一，并完成最终质量门禁。

## 新增文件

- `docs/releases/v0.7.md`

## 修改文件

- `src/core/entities/search-filter.ts`
- `src/core/entities/search-result.ts`
- `src/core/services/global-search.ts`
- `src/app/search/search-experience.tsx`
- `src/app/tasks/page.tsx`
- `src/app/tasks/task-manager.tsx`
- `src/app/layout.tsx`
- `README.md`
- `PROJECT.md`
- `ROADMAP.md`
- `CHANGELOG.md`
- `HANDOFF.md`
- `ARCHITECTURE.md`
- `docs/QA_CHECKLIST.md`

## 手动验收步骤

1. 创建包含 title、description、Workspace、status、priority、type 和 SourceRef 快照的 Task，并分别用四类文本字段搜索。
2. 在 `/search` 选择 Task 类型，组合 Workspace、Task status、priority、type，确认结果正确；切回全部类型，确认非 Task 结果仍保留。
3. 清空关键词，确认最近 12 条可出现 Task；点击 Task 结果，确认 `/tasks?q=...` 恢复标题查询。
4. 打开 `/search?q=demo&type=task&workspaceId=inbox` 后刷新，确认三项 URL 状态恢复。
5. 回归 Conversation、Proposal、Knowledge、Tag、Workspace 搜索及旧知识工作流。
6. 按 `docs/QA_CHECKLIST.md` 执行 Task Search 与 v0.7 Release Smoke Test。

## 已知限制

- Task 结果按标题查询跳转 `/tasks`，不是按 ID 精确定位；同名 Task 可能同时出现。
- Task status、priority、type 筛选不写入 URL；仅 `q`、`type`、`workspaceId` 可恢复。
- Search 与 Task Storage 都是当前浏览器 LocalStorage 上的同步线性读取，适合小数据量。
- 不包含 Activity、Calendar、Reminder、Recurring Task、Agent、RAG、数据库或 AI Suggest Task。

## Architecture Impact

- Entity：SearchEntityType 增加 Task；SearchFilter / SearchResult 增加 Task 筛选与展示元数据，不修改 Task Entity。
- Service：GlobalSearch 只读映射 Task 集合，复用现有 Workspace 和 SourceRef 快照，不增加索引或存储 key。
- Infrastructure：Search UI 通过 BrowserTaskStorage 读取 Task；没有直接 LocalStorage 访问或迁移。
- UI：Search 增加 Task 分组与专属筛选；Tasks 页面只新增 `q` 初始标题过滤。
- Cross-domain / AI：搜索不修改 Task 或来源；Provider / Analyzer 未获得 TaskStorage 写入能力。

## 是否建议 commit

建议在完成上述手动 smoke test 后创建一个 v0.7 release commit；本轮按要求不创建 commit。

---

# Previous Handoff — Epic D D3 Source-linked Task

## 当前状态

Epic D D3 Part 1–4 已实现；本轮未创建 Git commit。Knowledge、Conversation 与选中 Messages 均可由用户显式创建 Task 并保留 SourceRef 快照；`/tasks` 与 `/today` 会显示来源，来源删除后降级为 `Source deleted`。未实现 Activity、AI Suggest Task、Calendar、Reminder、Recurring Task、Agent、RAG 或数据库。

## Part 完成情况

- Part 1：Knowledge Detail 新增 Create Task；默认 inbox / review / medium，保留 Knowledge ID、标题及摘要/内容摘录快照，并从来源 Conversation 链路推断 Workspace。
- Part 2：Conversation Detail 新增 Create Task；默认 inbox / todo / medium，使用 Conversation Workspace，保留标题及原始文本/最近 Messages 摘录。
- Part 3：Message Timeline 可从选中 Messages 创建 Task；空选择禁用，第一条 Timeline Message 作为 entityId，摘要按 Timeline 顺序生成，Proposal 选择逻辑不变。
- Part 4：`/tasks` 与 `/today` 展示 Manual、Knowledge、Conversation、Message 等来源；缺失来源显示 `Source deleted` 且保留快照；README、ROADMAP、CHANGELOG、HANDOFF 与 QA 已同步。

## 新增文件

- `src/app/task-source-details.tsx`

## 修改文件

- `src/core/services/task-service.ts`
- `src/app/knowledge/[id]/knowledge-detail.tsx`
- `src/app/conversation/[id]/conversation-detail.tsx`
- `src/app/tasks/task-manager.tsx`
- `src/app/today/today-view.tsx`
- `README.md`
- `ROADMAP.md`
- `CHANGELOG.md`
- `HANDOFF.md`
- `docs/QA_CHECKLIST.md`

## 手动验收步骤

1. 打开一条 Knowledge Detail，点击 Create Task；确认成功提示可跳转 `/tasks` 或 `/today`，Task 为 inbox / review / medium，Workspace 与来源 Conversation 一致或回退 Inbox。
2. 打开 Conversation Detail，点击 header 中的 Create Task；确认 Task 为 inbox / todo / medium，SourceRef 标题和原始文本/最近 Messages 快照正确。
3. 在 Message Timeline 不选择内容时确认按钮禁用；乱序勾选多条后创建，确认 entityId、选择数量和摘要仍按 Timeline 顺序；随后继续生成 Proposal，确认原逻辑不变。
4. 在 `/tasks` 与 `/today` 检查 Manual、Knowledge、Conversation、Message 标签、当前标题、快照，以及可解析 Knowledge / Conversation 的跳转。
5. 删除一条测试 Knowledge 或 Conversation（或替换包含首条引用 Message 的 Timeline），确认 Task 保留、显示 `Source deleted`、快照可读且无失效链接。
6. 刷新页面，回归 Task complete / reopen / archive / restore / delete、Workspace 删除回迁，以及 Conversation → Proposal → Review → Knowledge 旧流程。

## 已知限制

- 全局 Search 仍只索引 Conversation、Proposal、Knowledge、Tag 与 Workspace，不索引 Task。
- Message 来源使用第一条选中 Message 作为身份；SourceRef 仍是单引用，不保存全部选中 Message IDs。
- Task 使用当前浏览器 LocalStorage 单集合线性读取，适合单设备小数据量；没有同步、备份或数据库。
- `/tasks` 不提供批量操作、完整编辑表单或 URL 持久化筛选。
- 不包含 Activity、AI Suggest Task、Calendar、Reminder、Recurring Task、Agent 或 RAG。

## Architecture Impact

- Entity / Contract / Storage：无模型、Contract、LocalStorage key 或迁移变化；继续复用 D1 SourceRef 快照与 BrowserTaskStorage 兼容逻辑。
- Service：TaskService 新增来源解析结果，集中判断 missing 并解析当前标题；原 `isSourceMissing` 保持兼容。
- UI：来源页面通过 TaskService 与 BrowserStorage Adapter 显式创建 Task；共享 TaskSourceDetails 统一 `/tasks` 与 `/today` 的来源、快照和删除降级展示。
- Cross-domain：创建 Task 不修改 KnowledgeCard、Conversation、Message 或 Proposal；来源删除仍不级联 Task。
- AI boundary：Provider / Analyzer 未接入 TaskStorage，不存在 AI 自动创建或状态变更。

## 质量检查说明

Part 1–4 checkpoint 均通过 `npm run lint`、`npm run build` 与 `git diff --check`。Part 1 首次 build 因沙箱禁止 Turbopack 绑定内部端口失败，按规则在允许环境仅重跑一次后通过；没有代码修复。完成文档后仍按交付规则重复执行最终三项检查。

---

# Previous Handoff — Epic D D2 Today / Task UI

## 当前状态

Epic D D2 Part 1–4 已实现；本轮未创建 Git commit。`/today` 已成为日常入口，`/tasks` 已从 D1 调试页升级为完整任务管理页。Part 4 与最终生产 build 因执行环境用量限制未能复跑，因此本轮不能标记为通过最终完成门禁。未实现 Activity、Calendar、Reminder、Recurring Task、Agent、RAG、数据库或 AI Suggest Task。

## Part 完成情况

- Part 1：完成 `/today`、导航与 Dashboard 入口；展示 Overdue、Today、Upcoming、Inbox、Completed Today，支持 Workspace 筛选和完成 / 重开。
- Part 2：完成 Quick Capture，支持 title、type、priority、dueDate、workspace；默认 inbox / todo / medium，空标题禁用，成功后清空并提示。
- Part 3：完成 `/tasks` 六类视图、四类组合筛选、完整字段展示，以及 complete / reopen / archive / restore / delete。
- Part 4：完成 Today Empty State、Overdue 视觉提示、Completed Today 默认折叠，以及 README / ROADMAP / CHANGELOG / HANDOFF / QA 同步。

## 新增文件

- `src/app/today/page.tsx`
- `src/app/today/today-view.tsx`

## 修改文件

- `src/core/services/task-service.ts`
- `src/app/tasks/page.tsx`
- `src/app/tasks/task-manager.tsx`
- `src/app/layout.tsx`
- `src/app/dashboard-overview.tsx`
- `README.md`
- `ROADMAP.md`
- `CHANGELOG.md`
- `HANDOFF.md`
- `docs/QA_CHECKLIST.md`

## 手动验收步骤

1. 从导航和 Dashboard 打开 `/today`，创建过去、今天、未来和无日期 Task，核对五类分区与 Workspace 筛选。
2. 使用 Quick Capture 组合 type、priority、dueDate、workspace；确认空标题不可提交，成功后表单恢复默认值并出现提示。
3. 在 Today 完成 Task，展开页面下方 Completed Today 后重开；核对逾期视觉提示和全空 Empty State。
4. 打开 `/tasks`，依次切换 Inbox、Today、Upcoming、Completed、Archived、All，并组合 Workspace、Priority、Type 与标题/描述搜索。
5. 核对 Task Card 全部字段和 SourceRef；执行 complete、reopen、archive、restore，再分别取消和确认 delete。
6. 刷新 `/today`、`/tasks` 和 Dashboard，确认本地数据、状态与统计保留；回归 Workspace 删除回迁与缺失 SourceRef 展示。

## 已知限制

- Task 仍使用当前浏览器 LocalStorage 单集合线性读取，适合单设备小数据量；没有同步、备份或数据库。
- D3 来源侧创建 / 关联入口尚未实现；现有 SourceRef 仅展示和判断 missing。
- `/tasks` 不提供批量操作、编辑表单或 URL 持久化筛选。
- Quick Capture 不包含 description 或 SourceRef 关联编辑；这些不在本轮要求内。
- 不包含 Activity、Calendar、Reminder、Recurring Task、Agent、RAG 或 AI Suggest Task。

## Architecture Impact

- Entity / Contract / Storage：无模型、Contract 或 LocalStorage key 变化，继续复用 D1 TaskStorage 与 BrowserTaskStorage。
- Service：TaskService 新增 Overdue、当天到期、当天完成查询，集中维护本地日期规则。
- UI：新增 Today 组合页并升级 Tasks 管理页；Page / Component 只通过 TaskService 和 BrowserStorage Adapter 访问数据。
- Cross-domain：Workspace 回迁、SourceRef missing 与 Conversation / Knowledge 删除边界保持不变。
- AI boundary：Provider / Analyzer 未接入 Task 写入，不增加自动创建或状态变更。

## 质量检查说明

Part 1–3 checkpoint 均通过 `npm run lint`、`npm run build` 与 `git diff --check`。Part 1 首次 build 仅因沙箱禁止 Turbopack 绑定内部端口失败，在允许的构建环境复跑后通过；没有代码修复。Part 4 的 `npm run lint` 与 `git diff --check` 已通过，但沙箱外 build 被环境用量限制拒绝；最终三项检查因此未能完整执行。恢复构建权限后应依次复跑 `npm run lint`、`npm run build`、`git diff --check`，通过后才可把 D2 标记为完成。

---

# Previous Handoff — Epic D D1 Task Domain Foundation

## 当前状态

Epic D D1 的 Task Domain 基础已实现；本轮未创建 Git commit。交付包含 Core Entity / Contract / Service、BrowserStorage、跨域删除兼容、`/tasks` 最小调试页、导航与 Dashboard 统计。正式 Today UI、Activity、Calendar、Reminder、RAG 和 Agent 均未实现。

## Part 完成情况

- Part 1：完成 Task Entity、五类状态、七类 Task Type、优先级与六类 SourceRef 快照；未修改 Conversation / KnowledgeCard Entity。
- Part 2：完成 TaskStorage、BrowserTaskStorage 与 TaskService 全部指定方法；旧字段安全归一化，解析或写入失败不会静默清空旧值。
- Part 3：完成 Workspace 删除前 Task 回迁 Inbox、Source missing Service 判断；Conversation / Knowledge 删除保留 Task，复制 Conversation 不复制 Task。
- Part 4：完成 `/tasks` 调试页、导航、五分区、生命周期操作、Workspace / SourceRef 展示与 Dashboard Task 统计。

## 新增文件

- `src/core/entities/task.ts`
- `src/core/contracts/task-storage.ts`
- `src/core/services/task-service.ts`
- `src/infrastructure/storage/browser-task-storage.ts`
- `src/app/tasks/page.tsx`
- `src/app/tasks/task-manager.tsx`

## 修改文件

- `src/core/services/workspace-service.ts`
- `src/app/workspace/workspace-manager.tsx`
- `src/app/layout.tsx`
- `src/app/dashboard-overview.tsx`
- `ROADMAP.md`
- `CHANGELOG.md`
- `HANDOFF.md`
- `docs/QA_CHECKLIST.md`

## 手动验收步骤

1. 打开 `/tasks`，分别创建无日期、今天/过去日期、未来日期的 Task，刷新后核对 Inbox、Today、Upcoming 与 Dashboard 数量。
2. 依次执行 Complete、Reopen、Archive、Restore；确认时间字段和分区变化，随后取消一次 Delete，再确认删除测试 Task。
3. 创建普通 Workspace 与其中的 Task，删除 Workspace；确认 Task 保留、Workspace 显示 Inbox、日期和状态不变。
4. 用调试数据建立 Conversation / Knowledge SourceRef 后删除来源；确认 Task 保留、快照仍显示且标记 `source missing`。
5. 复制带关联 Task 的 Conversation；确认副本未新增 Task。删除原 Conversation；确认 Task 不被级联删除。
6. 使用缺失 priority/workspace、旧 `notes`/`scheduledDate`/`action`/`knowledge_review` 形状的数据验证读取归一化；使用损坏 JSON 验证读取安全降级且后续写入不覆盖原值。
7. 回归 Conversation → Proposal → Review → Knowledge、Workspace 与 Dashboard 旧流程。

## 已知限制

- `/tasks` 是生命周期调试入口，不是 D2 正式 Today 产品页；没有批量操作、复杂筛选或来源创建入口。
- Task 使用当前浏览器 LocalStorage 单集合线性读取，适合单设备小数据量；没有同步、备份或数据库。
- SourceRef 快照可显示与判断 missing，但本轮未增加从 Conversation / Knowledge 页面创建关联 Task 的 D3 入口。
- 恢复 Archived Task 按 dueDate 回到 Inbox / Today / Upcoming，不保留归档前的独立状态历史。
- 不包含 Activity、Recurring Task、Calendar、Reminder、AI Suggest Task、RAG、Agent 或批量操作。

## Architecture Impact

- Entity：新增独立 Task 与 SourceRef；KnowledgeCard / Conversation 领域模型不变。
- Contract / Infrastructure：新增 TaskStorage 和唯一 Task key 的 BrowserTaskStorage；key、JSON 与兼容归一化集中在 Adapter。
- Service：TaskService 拥有 Task 生命周期、日期视图、Workspace 回退与 source missing 判断；WorkspaceService 负责删除前回迁 Task。
- UI：Page 只组合 Service / BrowserStorage；`/tasks` 不直接访问 LocalStorage，Dashboard 只读取 TaskService 统计。
- Deletion：Task 不属于 Conversation / Knowledge 删除聚合；Workspace 删除是唯一会修改相关 Task 的跨域删除操作。
- AI boundary：Provider / Analyzer 未接入 TaskStorage，未增加自动创建或状态变更能力。

## 质量检查说明

Part 1、Part 2、Part 4 已直接通过三项检查；Part 3 首次 build 遇到局部 TypeScript 收窄错误，做一次最小修复后通过。最终检查再次通过 `npm run lint`、`npm run build` 与 `git diff --check`。

---

# Previous Handoff — Epic D D0 Architecture Pack v1

## 当前状态

Epic D（Task / Productivity Layer）的 Architecture Pack v1 已冻结。本次是纯文档任务：没有修改 `src/`、package、依赖、运行时存储或业务行为，也没有创建 Git commit。D0 已完成；D1–D5 尚未实现。

## 新增文件

- `docs/rfc/RFC-003-task-domain.md`
- `docs/architecture/DOMAIN_MODEL.md`
- `docs/architecture/DOMAIN_BOUNDARIES.md`
- `docs/architecture/DATA_LIFECYCLE.md`
- `docs/design/Epic-D-Design.md`

## 修改文件

- `ARCHITECTURE.md`
- `ROADMAP.md`
- `HANDOFF.md`
- `PROJECT.md`
- `CHANGELOG.md`

## 冻结结果

- 使用通用 `Task`，不使用 `LearningTask`；Knowledge Review 表达为 `TaskType = knowledge_review`，不新增独立实体。
- Task 与 Conversation / Knowledge 通过可失效 `SourceRef` 关联，与 Workspace 通过单层归属关联。
- Inbox、Today、Upcoming、Completed 是一个 Task 集合上的派生视图，不是独立实体或 Calendar。
- Conversation / Knowledge 删除时 Task 保留且 Source 显示 `deleted`；Workspace 删除时 Task 回迁 Inbox。
- AI 只能建议 Task，不能直接 Create / Complete / Delete Task。
- Epic D 第一阶段只做 Task；Activity planned / not immediate；Agent、Calendar 与 RAG 不在范围。

## 限制

- 本文档没有新增 Task Entity、Contract、BrowserStorage、Service、Page 或 LocalStorage key。
- D1 开发前仍需把 RFC 字段落为精确 TypeScript 模型，并针对旧浏览器数据设计安全归一化。
- D4 Activity 在独立事件、隐私、保留、顺序与失败语义获批前不得开始。

## 下一步建议

1. 以 RFC-003 和 Epic D Design 为 D1 唯一范围基线，先实现 Task Domain，不提前做完整 UI。
2. 在 D1 同一交付中覆盖 Conversation / Knowledge 删除后的 degraded SourceRef，以及 Workspace 删除回迁 Inbox。
3. D1 完成后再进入 D2 Today / Task UI；不要顺延 Agent、Calendar、RAG 或 Activity。

## 质量检查

- `npm run lint`：通过。
- `npm run build`：通过；Next.js production build 成功生成 13 个页面。
- `git diff --check`：通过。

---

# Previous Handoff — Release v0.6 / Project Stabilization

## 当前状态

Release v0.6 文档已整理，当前阶段为 Phase2，Epic C 已完成。本次只修改文档，没有修改 `src/`、业务逻辑、存储结构或依赖，也没有创建 Git commit。

## Release 结果

- README 增加 Current Version、Current Phase、Current Epic 与 Feature Matrix。
- 新增 `docs/releases/v0.6.md`，记录 What's New、Architecture、Completed Epics、Known Limitations、Breaking Changes 与 Next Version。
- 新增 `docs/project-status.md`，记录 Entity、Service、Storage、Page 与 Documentation 的近似数量，以及 Epic A–F 状态。
- QA Checklist 增加 v0.6 Release Smoke Test。
- ROADMAP、CHANGELOG、HANDOFF、ARCHITECTURE 与 README 已同步 Release 口径。

## 关键文件

- `README.md`
- `docs/releases/v0.6.md`
- `docs/project-status.md`
- `docs/QA_CHECKLIST.md`
- `ROADMAP.md`
- `CHANGELOG.md`
- `ARCHITECTURE.md`
- `HANDOFF.md`

## 限制

- v0.6 没有业务功能变化或存储迁移，Breaking Changes 为 None。
- 当前仍是单人、单浏览器、单设备的 LocalStorage MVP，没有正式备份、云同步、数据库或多人协作。
- 云 Provider 未实现；Ollama 默认关闭且只支持用户显式配置的本地非流式调用。
- Epic D、E、F 尚未开始，范围与验收标准待产品负责人确认。

## 下一步

1. 按 `docs/QA_CHECKLIST.md` 执行 Release Smoke Test，尤其复核旧浏览器数据兼容。
2. 由产品负责人确认 v0.7 及 Epic D 的范围与验收标准后再开始开发。
3. 不从本次 Release 文档整理顺延真实 AI、RAG、数据库或其它新功能。

## 质量检查

- `npm run lint`：通过。
- `npm run build`：通过；Next.js production build 成功生成 13 个页面。
- `git diff --check`：通过。

---

# Previous Handoff — Epic C / Search 2.0

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
