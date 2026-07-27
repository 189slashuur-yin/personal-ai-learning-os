# PALOS v1.8 — ChatGPT Share Snapshot Design Handoff

## 2026-07-27 Phase 2C-3B assistant-only delta projector

本轮从 clean checkpoint `ad36c0a feat: implement v1.8 immutable share snapshot core` 继续，只实现 immutable Share Snapshot append 的 Round delta projection。没有修改 UI、Copy/Merge/Restore、IndexedDB schema/version/store、`ShareResourceBinding`、全局 `deriveRoundDrafts()` 语义或 Phase 2C-3A Snapshot History Core；没有 commit / push。

### Pure projection contract

- 新增纯服务 `projectChatGPTShareSnapshotDelta()`，输入完整 canonical Messages、现有 Rounds、已物化 append suffix Messages 与 comparator baseline，返回 `projected` 或明确 blocked reason。
- blocked reasons 冻结为 `no-unanswered-tail-round`、`tail-round-mismatch`、`message-order-mismatch`、`ownership-mismatch` 与 `projection-divergence`。校验不依赖 `updatedAt` 排序。
- Assistant 开头的 suffix 只有在 target Round 存在、是 canonical conversation tail、answer 未完成、message membership 与现有 baseline 一致，且新 Message 的 `order/sourceOrdinal` 精确连续时才能扩展。
- 扩展保留 Round ID、title、question、note、summary、context、createdAt；只更新 answer、messageIds 与 updatedAt。Assistant-only suffix 不调用通用 derivation 创建 orphan Round。
- 对 `Assistant → User → Assistant`，只把首段 Assistant 投影到 unanswered tail；从第一个 User 起的剩余 suffix 才调用既有 `deriveRoundDrafts()`，且 draft message indexes 继续指向完整 suffix。
- User 开头的正常 append 继续复用既有 derivation。全局 `deriveRoundDrafts()` 本身未修改。

### Service and persistence integration

- `prepareChatGPTShareSnapshot()` 在 append canonical materialization 内调用 projector。成功计划可同时包含同 ID 的 tail Round 更新与真正的新 Rounds；preview/import plan 的 `importedRoundCount` 只统计新 Round，不把被扩展的 Round 计为新增。
- projection blocked 返回 `status=blocked`、详细 `deltaProjectionBlockedReason`，不生成 canonical plan，因此不会进入 writer。
- canonical plan、writer contract 与 IndexedDB operation 均未扩展。既有 put-only operation 已支持同 owner Round upsert；集成测试验证 transaction、reload verification、旧 Snapshot Source immutability 以及 Round enrichment preservation。

### Tests and verification

- 新增 projector 纯单元测试，覆盖 valid assistant-only extension、无 tail、answered tail、ownership、ordinal、Round ID/enrichment preservation、later User derivation、无 orphan Round、tail membership 与 baseline divergence。
- Share Snapshot service tests 覆盖 assistant-only canonical plan、混合 suffix 以及 answered tail zero-plan block；IndexedDB integration 覆盖同 ID tail Round 的 durable update/reload。
- Final gate：`npm run lint` passed；`npm run build` passed（19 routes）；`npm test -- --run` passed（16 files / 277 tests）；`git diff --check` passed。按本阶段要求未运行 E2E。

### Remaining risks / next boundary

- Projector 依赖 Phase 2C-3A comparator 已验证完整 canonical Message stream；Round tail 只允许 exact membership/question projection，任何人工或旧数据偏差都会 fail closed，不会猜测修复。
- Phase 2C-3B 只负责 Round projection，不改变 Copy/Merge/Restore provenance、UI capture/confirm 入口、legacy migration execution、cross-tab TOCTOU 或 post-commit recovery journal。
- 当前 canonical writer 信任 Core 生成的 Round update shape；projector tests 已冻结“只改 answer/messageIds/updatedAt”，但 Infrastructure 尚未增加独立的 field-level Round mutation policy。

### Main Phase 2C-3B files

- Core：`src/core/services/chatgpt-share-snapshot-delta-projector.ts`、`chatgpt-share-snapshot-service.ts`、`chatgpt-share-snapshot-import.ts`
- Tests：`tests/chatgpt-share-snapshot-delta-projector.test.ts`、`chatgpt-share-snapshot-service.test.ts`、`share-snapshot-persistence.test.ts`
- Docs：`HANDOFF.md`

---

## 2026-07-27 Phase 2C-2 headless application workflow

本轮在未提交的 Phase 2A / 2B / 2C-1 worktree 上原地继续，新增无 UI 的 application boundary：

`capture request → exact target resolution → preview → explicit confirm → freshness guard → canonical writer → typed result`

没有修改 React、ImportWorkbench、copy/merge、Round derivation、Phase 2B canonical operation、IndexedDB schema/version/store、Analyzer、Proposal 或 Knowledge；没有访问网络、抓取 URL、读取 cookie，也没有 commit / push。

### Layer boundary and lifecycle

- `ChatGPTShareSnapshotWorkflow` 是 application orchestration，不是新的 domain service。它读取 Storage contracts、解析 Source target、调用 Phase 2C-1 pure service、保存 process-local preview state，并在有效 confirmation 后调用 writer。
- 公开 `ShareSnapshotPreview` 只包含 preview identity、`new | append | same | ambiguous | invalid | blocked` 状态、resolved target、delta counts、baseline fingerprint、confirmable flag 和 warnings/errors；canonical plan 与完整 baseline 只保存在 workflow 的 private map，不通过 preview 暴露。
- Target resolution 对 `shareId + normalizedShareUrl` 做精确匹配：0 个为 new，1 个为 existing，多个为 ambiguous；不依赖数组顺序和 latest heuristic。dangling Source、跨 Conversation source lineage 或 new Conversation ID collision 返回 invalid，全部零写入。
- Confirm 要求 `previewId + baselineFingerprint`。`new/append` 在 freshness 通过后执行 writer；`same` 返回 typed noop 且不调用 writer；ambiguous/invalid/blocked 返回 typed terminal result；baseline 改变返回 stale；writer 异常被收敛为不泄漏底层数据的 write-failed。preview 在成功、stale、noop 或失败后消费，重复/并发确认不能再次执行同一 plan。

### Deterministic freshness and writer adapter

- Baseline 不新增 revision 字段。SHA-256 deterministic fingerprint 覆盖 Conversation identity/title/note/summary/conclusion/pending/context、Source identity/ownership/content/shareSnapshot metadata、Message IDs/order/role/content/external provenance/share provenance，以及 Round IDs/order/content/messageIds/note/summary/context。
- Fingerprint 明确排除 `updatedAt`、`lastOpenedAt`、`Conversation.workspaceId/order` 等无关时间或 UI metadata，避免仅 UI 活动导致 stale；Message/Round 先按 canonical order + ID 排序，identity matching Source IDs 也排序。
- Workflow confirm 先对当前 Storage view 重算 baseline。`IndexedDBShareSnapshotCanonicalWriter` 随后 drain pending writes，并在一个四-store readonly transaction 中读取持久化 Conversation/Source/Message/Round，重算 authoritative baseline；不匹配直接返回 stale，零 canonical 写入。
- Baseline 匹配时，adapter 才调用原封不动的 Phase 2B `executeShareSnapshotCanonicalOperation(plan)`。put-only transaction、cache clear、preload、reload/source-lineage/reference/pending-write verification 仍由 Phase 2B operation 独占；adapter 只做 freshness boundary 与 typed receipt 映射。

### Tests and verification

- 新增 `tests/chatgpt-share-snapshot-workflow.test.ts` 9 项，覆盖 new、append/same、duplicate identity ambiguous、dangling/cross-owner invalid、preview 零写入、explicit confirm、stale baseline、duplicate confirm、writer stale/failure，以及 capture input/local enrichment immutability。
- `tests/share-snapshot-persistence.test.ts` 新增 4 个真实 IndexedDB workflow integration：new 与 append 均完成 writer → Phase 2B operation → reload verification；adapter 能发现 cache 未变但 durable state 已变的 stale；readwrite abort 返回 typed write-failed 且四 store 原子保留。重复 confirm 不增加第二份 records，成功 receipt 证明 `pendingWriteCount === 0`。
- 定向 gate：2 files / 25 tests passed，lint 与 `git diff --check` passed。
- Final gate：`npm run lint` passed；`npm run build` passed（19 routes；沙箱首次禁止 Turbopack 临时端口，获准按相同命令重跑成功）；`npm test -- --run` passed（14 files / 258 tests）；`git diff --check` passed。按范围未运行 E2E。

### Remaining risks / next boundary

- Workflow preview registry 是进程内、单次使用状态；页面或应用 reload 后旧 preview 必须视为 stale，当前没有 durable preview/confirmation journal。
- Writer 的 authoritative baseline read 是一致的单 readonly transaction，但 Phase 2B operation 保持既有 plan-only contract，因此 baseline transaction 完成到 Phase 2B readwrite transaction 开始之间仍存在很小的跨 tab/process TOCTOU 窗口。彻底关闭该窗口需要未来单独批准 expected-baseline-in-transaction 语义，不能在本阶段偷偷改变 Phase 2B operation。
- Phase 2B 在 transaction commit 后若 preload/reload verification 因环境异常失败，仍没有 durable recovery journal；write-failed 不代表已 commit 的 transaction 可自动补偿。
- 本阶段没有 UI wiring，因此 Share Snapshot 尚无产品入口。未来 UI 只能消费公开 preview/result，并在用户 explicit confirm 后调用 workflow；不得直接获取 plan 或调用 Phase 2B operation。
- ImportWorkbench Merge provenance cleanup 与 `duplicateConversationWorkspace()` Source remap/share identity cleanup 继续延期，本轮没有修改相关代码。

### Main Phase 2C-2 files

- Core contract/models：`src/core/contracts/share-snapshot-canonical-writer.ts`、`src/core/models/share-snapshot-baseline.ts`、`src/core/models/share-snapshot-preview.ts`、`src/core/models/share-snapshot-workflow-result.ts`
- Application：`src/core/services/chatgpt-share-snapshot-workflow.ts`
- Infrastructure adapter：`src/infrastructure/storage/indexeddb/idb-share-snapshot-canonical-writer.ts`、`src/infrastructure/storage/indexeddb/index.ts`
- Tests/docs：`tests/chatgpt-share-snapshot-workflow.test.ts`、`tests/share-snapshot-persistence.test.ts`、`HANDOFF.md`

---

## 2026-07-27 Phase 2C-1 pure service integration

本轮继续复用未提交的 Phase 2A parser/comparator/import plan 与 Phase 2B canonical operation，只新增 Core pure service orchestration 和 integration tests。没有修改 React、ImportWorkbench、copy/merge、Search、delete/restore、Round derivation 或 IndexedDB schema，也没有 commit / push。

### Pure service contract

- 新增 `prepareChatGPTShareSnapshot()`，输入严格 share URL、raw Snapshot input、调用方提供的 `capturedAt`、`new | existing` target snapshot，以及可注入的 `createId(kind)`。Service 不读取 BrowserStorage/IndexedDB、不访问网络、不调用 canonical operation、不修改输入对象。
- Service 依次组合 URL normalization → parser → metadata/SHA-256 → existing identity check → comparator → Phase 2A import plan → canonical plan materialization，返回 `new | append | same | blocked | invalid`。
- `new/append` 才返回 `ChatGPTShareSnapshotCanonicalPlan`；`same/blocked/invalid` 不返回可执行 plan，也不会分配 canonical IDs。Core 现在拥有 canonical plan DTO，Phase 2B IndexedDB operation 只 import 该 type，依赖方向保持 Core → Infrastructure 单向。
- ID 与时间不在 pure service 内隐式生成：调用方注入 `createId` 与 `capturedAt`，因此 tests/preview 可确定性重放。Materializer 会拒绝空 ID、同 store ID collision 和无效 Round suffix message index。

### Canonical materialization semantics

- Initial：创建一个 Source、完整 canonical Messages 与 derived Rounds；Message 保存同一 `sourceId` 和 parser absolute `sourceOrdinal`，Round.messageIds 只引用已物化 Message IDs。
- Append：复用既有 Source ID，只写 suffix Messages/Rounds；Message `order` 从现有最大值继续，Round `order` 从现有最大值继续，sourceOrdinal 保留完整 Snapshot 中的 absolute ordinal。
- Conversation title/note/summary/conclusion/pending/context、既有 Source name、旧 Messages/Rounds 及 Round enrichment 都不被改写；canonical plan 只更新 Conversation `updatedAt`、Source normalized transcript/metadata/`updatedAt` 和新增 suffix records。
- Existing update 必须匹配 Source metadata 中的 `shareId + normalizedShareUrl`；source ownership、Message/Round ownership、旧 lineage 异常都会返回 `invalid`，不会形成 executable plan。
- Source.content 继续使用 Phase 2A `renderChatGPTShareSnapshotTranscript()` 的规范化纯文本，不保存 HTML page chrome、script、DOM、cookie 或页面状态。

### Integration tests and verification

- 新增 `tests/chatgpt-share-snapshot-service.test.ts` 5 项：initial composition、safe append + local enrichment immutability、Same zero plan/zero ID、Diverged/Shorter blocked zero plan，以及 parser/identity invalid zero plan。
- `tests/share-snapshot-persistence.test.ts` 新增两个跨层闭环：pure Service initial plan → Phase 2B operation → reload/verify，以及 pure Service append plan → Phase 2B operation → reload/verify。两条路径均验证 canonical counts、Source lineage、Round references 与 `pendingWriteCount === 0`。
- Final gate：`npm run lint` passed；`npm run build` passed（19 routes）；`npm test -- --run` passed（13 files / 245 tests）；`git diff --check` passed。按范围未运行 E2E。

### Remaining risks / next boundary

- Phase 2C-1 只输出纯 preview/result/canonical plan；没有 UI confirm flow。下一阶段接 UI 时必须只在 explicit confirm 后把 `new/append` plan 交给 Phase 2B operation，不能让 parse/preview 自动写入。
- Assistant-only suffix、Round extension 等规则继续完全沿用已批准的 Phase 2A import plan；本轮没有修改 Round derivation semantics。
- ImportWorkbench Merge provenance cleanup 与 `duplicateConversationWorkspace()` Source remap/identity cleanup 仍按 Phase 2B 决策延期。
- Post-commit preload/verification failure 仍没有 durable recovery journal；只有 IndexedDB transaction abort 具备完整原子回滚。

### Main Phase 2C-1 files

- Core：`src/core/services/chatgpt-share-snapshot-service.ts`
- Infrastructure type integration：`src/infrastructure/storage/indexeddb/share-snapshot-operation.ts`
- Tests：`tests/chatgpt-share-snapshot-service.test.ts`、`tests/share-snapshot-persistence.test.ts`
- Docs：`HANDOFF.md`

---

## 2026-07-27 Phase 2B persistence foundation

本轮从现有未提交 Phase 2A worktree 原地继续，没有 reset、discard、stash、commit 或 push。范围只包含 optional provenance persistence、IndexedDB put-only transaction、Share Snapshot canonical operation、reload verification 与 preservation tests；没有修改 UI、ImportWorkbench、Search、delete/restore、Conversation rendering、Round derivation、copy/merge 或 v1.6.1 batch-delete。

### Optional-field compatibility

- `Message.sourceId / sourceOrdinal` 与 `ImportedSource.shareSnapshot` 继续是 optional；没有提升 IndexedDB `DB_VERSION`、没有新增 store、没有 migration，也不回填旧记录。
- BrowserStorage、IndexedDB Adapter、App Data schema v1 与 `ConversationVersion.snapshotData.messages` 都通过既有对象持久化保留 optional fields。缺失字段读取为 `undefined`，旧 Message / Source 不会被拒绝或改写。
- App Data export/import 保持 `schemaVersion: 1`，Share Snapshot metadata、Message lineage 和 Version 内的 Message provenance 均可 round-trip。

### Put-only transaction and canonical operation

- `database.ts` 新增 `putStores(batch)`：从非空 batch 建立一个 `readwrite` transaction，只调用各 store 的 `put()`；不调用 `clear()`、`replaceStores()` 或 delete canonical operation。任一 request/transaction abort 时由 IndexedDB 原子语义回滚所有 store，未包含在 batch 的既有记录保持不变。
- `share-snapshot-operation.ts` 执行已生成的 canonical plan：drain tracked writes（失败会向调用方抛出）→ 检查 pending count 为 0 → 读取 authoritative Conversation/Source/Message/Round state → 校验 ownership、ID collision、统一 sourceId、从 0 连续且唯一的 sourceOrdinal、metadata message count 与 Round.messageIds references → 单次 `putStores()` → clear caches → preload → 对四个完整 store 的预期记录逐 ID/内容核对 → 再验证 metadata、lineage、references 和 `pendingWriteCount === 0`。
- Operation 是 put-only upsert：Conversation 与 Source metadata 可更新，Messages/Rounds 只执行 plan 中已物化的记录；不会 clear store、删除 Message、重建既有 ID 或调用 fire-and-forget adapters。

### Preservation and Source.content decision

- Integration fixture 从已有 2 Messages / 1 Round 开始，Round 带 `note="important note"`、`summary="summary"` 与 confirmed context；Conversation 带 Note、Overview fields 和完整 Context，旁侧存在 Knowledge 与 Task。
- 追加后旧 Message IDs、旧 Round ID 及其 note/summary/context 完整不变，只新增 suffix Messages 与 suffix-derived Round；Conversation Context/Overview、Knowledge 和 Task 保持。
- `ImportedSource.content` 仍保存由 Share parser 输出并规范化后的纯文本 transcript，因为当前 Search、Analyzer、Demo Provider、Conversation Detail 和 Dashboard 都读取该字段。不会保存输入 HTML、`script`、DOM、cookie、页面状态或内部 API payload；HTML 输入只经过 Phase 2A parser 提取 semantic Messages，再渲染为纯文本 Source。

### Tests and verification

- 新增 `tests/share-snapshot-persistence.test.ts` 10 项：Browser/IndexedDB legacy + optional-field round-trip、Conversation Version round-trip、App Data export/import round-trip、单 store put、多 store put、transaction abort atomic rollback、pending write drain、canonical success/reload/source lineage/reference verification、existing Round/enrichment preservation、invalid ordinal zero-write 与 Share operation abort rollback。
- Phase 2A parser/comparator tests 与新增 persistence tests 定向运行：3 files / 25 tests passed。
- Final gate：`npm run lint` passed；`npm run build` passed（19 routes）；`npm test -- --run` passed（12 files / 238 tests）；`git diff --check` passed。按本阶段要求未运行 E2E。

### Remaining risks / deferred scope

- `ImportWorkbench` 的 Merge 仍直接复制 Message，可能把原 Conversation 的 `sourceId/sourceOrdinal` 带入目标 Conversation；本轮按明确范围延期，没有修改 `import-workbench.tsx`。
- `duplicateConversationWorkspace()` 仍先复制 Message、后复制 Source，并保留 Source `shareSnapshot` identity；副本可能继续携带原 Share identity 或无法正确 remap Message sourceId。本轮按明确范围延期，没有修改 copy/merge 代码。
- IndexedDB transaction abort 可完整回滚；但 transaction 已完成后若 reload/preload 或 verification 因环境异常失败，本阶段没有 durable recovery journal 或 post-commit compensating rollback，调用方会收到失败且不能把状态描述为已验证成功。
- Phase 2B 只提供 persistence foundation，尚未接 UI confirm flow；不代表 Share Snapshot UI 已可用。

### Main files

- Phase 2A entities/services：`message.ts`、`imported-source.ts`、四个 `chatgpt-share-snapshot-*.ts`
- Phase 2B infrastructure：`indexeddb/database.ts`、`indexeddb/share-snapshot-operation.ts`、`indexeddb/index.ts`
- Tests/docs：三个 Share Snapshot Vitest 文件、`HANDOFF.md`

---

## 2026-07-25 design proposal

本轮基于干净的 `feat/v1.8-share-snapshot` / `e55e677 release: PALOS v1.7 round-first context management` 只完成设计审查，没有写产品代码、修改 IndexedDB schema、创建 store、接入 Provider、commit 或 push。

### Architecture conclusion

- Conversation 继续作为 Aggregate Root；Message / Round 继续承载 canonical transcript，Knowledge 继续是人工确认后的独立 Aggregate。
- 一次已确认的 Share Snapshot 建议复用现有 Source store，使用 optional metadata 保存 parser version、SHA-256 transcript hash、message manifest、前序 Snapshot Source ID 和 capture time；MVP 不新增第 8 个 canonical store。
- `ConversationVersion` 是 PALOS 本地恢复点，只包含 Conversation + Messages，不适合作为外部 Share Snapshot 历史。
- 当前 Export append 已有 `externalConversationId / externalMessageId / contentHash` seam，但不能处理分享文本缺少稳定 ID、中间编辑、截短、重排或 Assistant-only suffix 扩展最后 unanswered Round。
- local enrichment 明确定义为 Conversation / Round 的人工记录、Context、Task、Proposal、Knowledge 和 Tags；Snapshot 更新不得覆盖或自动重算这些内容。

### Compliance decision

- OpenAI 官方 Shared Links FAQ 说明普通分享链接是持链接可见的 Snapshot，只有分享者主动更新后才包含后续完成消息；Enterprise link 还可能受 workspace 权限限制。
- OpenAI 当前 Terms of Use 明确限制自动或程序化提取数据或 Output。没有官方 Share Link Import / Delta API、明确许可或专项合规批准前，v1.8 不实现 URL fetch、DOM scraping、internal API、登录模拟、cookies 读取或 polling。
- MVP 改为：用户主动提供 URL → PALOS 严格校验、mask、hash → 用户在普通浏览器打开 → 用户手动粘贴可见文本 → PALOS 本地 parser/hash/message diff → preview → explicit confirm。

### MVP update semantics

- 相同 transcript hash：no change，零 canonical 写入。
- 旧 Message 序列是新序列的精确前缀：safe append；只写新 Snapshot Source、新 Messages、新 Rounds，或保留 enrichment 地扩展最后 unanswered Round。
- 中间编辑、缩短、重排、role change 或 parser ambiguity：conflict preview，现有 Conversation 零改动。
- 这里的 incremental 是本地持久化增量；没有官方 delta API 时不承诺网络 delta。

### Design artifact and next gate

- 完整设计：[PALOS v1.8 ChatGPT Share Snapshot Design](./docs/design/PALOS-v1.8-ChatGPT-Share-Snapshot.md)
- 实施前需产品负责人确认：接受 manual capture MVP、完整 URL 默认不保存、conflict 不覆盖、历史 Snapshot 保留，以及 URL fetch 作为独立 compliance gate。

---

# PALOS v1.7 — Personal AI Context Management Handoff

## 2026-07-23 Final Release QA / Data Semantics Closure

本轮从干净的 `release/v1.7` / `fb032b4 checkpoint: PALOS v1.7 round-first usability candidate` 开始。Phase 0 基线为 clean，lint/build、9 files / 204 tests、Playwright 2/2 全部通过。本轮只修复审计确认的 release blocker/明显回归；没有改 IndexedDB schema、storage architecture、Aggregate 或 AI/Provider 范围，没有清理用户数据、commit 或 push。

### Semantic and reliability closure

- `Round.summary` 继续保存“本轮结论”；`Round.note` 通过唯一 `round-record.ts` 保存“我的备注 / 下一步 / 目标 / 决定 / 遗留问题 / 旧自由文本”。Canonical string 增加内部版本标记和 header-line 转义；纯文本、旧分段、`【补充备注】`、重复兼容段与未知 header 可 parse → edit one field → serialize 而不静默丢失。
- Search 为 Round record 输出独立 matched fields；Continue Topic 分别输出“我的备注 / 本轮结论 / 下一步”，不再展示无法区分语义的整段 raw note。
- `DebouncedAutosave` 现在支持 async save、revision 与 in-flight 串行。每个 Round/Overview controller 独立；blur、折叠/切换和卸载 flush；dispose 后不更新 UI。IndexedDB optimistic cache update 后等待 tracked transaction 成功才显示 saved，失败保留最新 draft，retry 重写最新值。`beforeunload` 仍只有 best-effort，不作为唯一保障。
- 动态投影显示“当前推荐参考：Round X”且不写数据；人工确认后显示“已固定参考：Round X”并读取 confirmed snapshot。来源 Round 后改不会覆盖固定 snapshot，也不会改当前 Round own record。
- 手工 Knowledge 对“相同 source + 规范化 content”做最小幂等复用；不做语义级全局去重。autosave/inheritance 仍不创建 Proposal/Knowledge，人工 Applied Proposal provenance 与 Conversation delete 后 Knowledge 保留规则不变。
- 真实 390px 截图发现展开 Navigator 虽无 overflow 但会挤压主内容；小屏改为 overlay，桌面 inline 行为不变。

### Tests and browser QA

- Vitest：9 files / 213 tests passed。新增覆盖 serializer 六字段/未知 legacy、单字段编辑保真、两 Round 隔离、async response ordering、blur/unmount、failure/retry latest、动态推荐变化/固定 snapshot、Knowledge 幂等、Search/Continue 语义。
- Playwright：2/2 passed。v1.7 闭环创建 6 Messages / 3 Rounds，验证快速输入→立即切换→reload、一次 intentional IndexedDB failure→failed→retry、Overview autosave、Continue Topic、Knowledge 重复确认、Imported Round 无破坏入口、1280/390 无 overflow、Navigator 无跳动、Conversation delete 后 Dashboard/Search/Review 无残留、Knowledge 按既有规则保留。
- QA artifacts：`test-results/v17-inline-autosave-inline-f0027-ssively-and-stay-responsive-desktop-chrome/` 下保存 1280px/390px 截图与不含正文的 `qa-manifest.json`。intentional failure 是唯一预期错误注入；恢复后 unexpected Console error = 0。
- 应用内 Browser 使用独立空 profile 做只读可视复核；没有读取或清理用户浏览器数据。可视检查直接促成了小屏 Navigator overlay 修复。

### Final status and limits

Final gate：lint passed；build passed（19 routes）；Vitest 213/213；Playwright 2/2；`git diff --check` passed。PALOS v1.7 的 Round-first release semantics 已闭合，建议创建单一 v1.7 release commit，但本轮按要求不 commit、不 push。

Remaining non-blockers：`beforeunload` 不能保证异步 IndexedDB 完成，因此可靠路径仍是 debounce + blur/unmount flush；Conversation Context 与 Version 仍是两个既有 store 的非跨-store transaction；restore durable journal、固定 Playwright Chromium、cloud/AI/RAG/Agent 均不属于 v1.7。

### Main changed files

- Core：`round-record.ts`、`debounced-autosave.ts`、`round-context-inheritance.ts`、`round-knowledge-service.ts`、`context-export-service.ts`、`search-index-service.ts`
- Infrastructure/UI：`indexeddb/database.ts`、两个 autosave panel、`round-context-panel.tsx`、`round-navigator.tsx`、`search-experience.tsx`
- Tests/docs：两个 v1.7 Vitest 文件、v1.7 E2E、README / PROJECT / ARCHITECTURE / ROADMAP / CHANGELOG / QA Checklist / HANDOFF

---

## 2026-07-22 Final Usability Correction closure

本轮在既有 v1.7 dirty worktree 上原地收口，没有 reset / restore / stash / checkout，没有清浏览器数据、修改 IndexedDB schema、重写 Core Storage、接入新 Provider/RAG/Agent/Embedding，也没有创建 commit。版本仍为单一 **v1.7**。

### Root cause and inline layout

- 旧实现把 `RoundRecordPanel` 与 `RoundContextPanel` 挂在页面级固定 `320px` Inspector，Round 内容在另一个网格列。固定栏、嵌套控件最小宽度与选中态共享面板共同压缩正文，并让记录脱离来源 Round，形成横向滚动风险和大片空白。
- 页面级 Inspector 与黄色“本轮记录”入口已移除。每个展开 Round 自己包含内容/记录双栏：1280px 实测正文 62.7%、记录 37.3%；390px 为上下排列。两种视口的 document overflow 均为 false。
- 真实浏览器首次检查还发现 `detail-section` 自身已有“标题 + 内容”两列，而 Round 列表缺少内容 wrapper，导致卡片误入 224px 标题列、内层正文宽度为 0。已补 `round-workspace-content` 的 `min-width: 0` 容器，并完整复验。

### Round Own Record and autosave

- 默认直接显示三个字段：我的备注、本轮结论、下一步。分别复用 `Round.note` 的结构化备注段、`Round.summary`、`Round.note` 的下一步段。
- “更多记录”才显示本轮目标、新增决定、遗留问题与旧自由 Round Note；旧 `【补充备注】` 和未分段 Note 均继续兼容读取，没有迁移或删除旧数据。
- `DebouncedAutosave` 统一 750ms 防抖；输入变更只排队，停止后才持久化。blur、Round 折叠/搜索隐藏/模式切换导致的组件卸载，以及 `beforeunload` 会 flush pending value。
- 状态覆盖未修改、等待保存、保存中、已保存、保存失败点击重试；默认不再显示“保存本轮记录”。

### Passive inherited reference

- 新增纯函数 `findMostRecentEffectiveRound`：只查当前 Round 前序兄弟，从近到远选择存在人工 Summary/Note 或 confirmed snapshot 的 Round，并跳过空 Round。
- 默认引用只是只读投影，不写当前 Round context/snapshot，不复制到三个记录字段，不改来源 Round，也不改 Conversation Overview。无有效 Round 时回退 Overview；两者均空时显示“暂无历史参考”。
- 普通态只显示“参考上下文：Round X 的结论与下一步”。用户展开“调整参考”后才可改选 Round、Overview、自动选择或本轮不参考；只有这些主动操作与高级 Override/Exclude 才写既有 inheritance 配置。
- 旧 sourceRoundId、confirmed snapshot、excludedFields、overrides 继续读取；高级字段控制留在二级折叠区，不再作为逐轮必经步骤。

### Conversation Overview and Knowledge boundary

- Rounds 后保留独立 Conversation Overview，默认只显示总备注/当前背景、当前总论、后续方向，映射既有 `longTermBackground/currentState/nextActions`；旧 decisions/constraints 在“更多总览”中兼容。
- Overview 使用同一 autosave/blur/unload 机制，不由 Round 自动覆盖。“继续这个主题”只读取人工 Overview、最近有效 Rounds、Pending Questions 与 Next Actions。
- Round 结论与 Overview 各有“保存为 Knowledge”次级动作，均先展示确认预览，确认后才创建。autosave 和 passive reference 不调用 Proposal/Knowledge 路径。
- 现有 `KnowledgeCard.proposalId` 仍为必填，因此人工创建继续生成一个 `Applied` manual provenance Proposal；本轮没有扩大数据模型或绕过来源关系。

### Imported Round immutability

- 当前没有可靠、无 schema 变更的 per-Round origin 判定，因此按保守规则隐藏所有单 Round 删除、合并、拆分、上下移动、Duplicate 与原始 Question/Answer/Message binding 编辑入口。
- 用户仍可编辑人工 Round Record 与参考来源；整个 Conversation 的既有显式删除与 canonical cascade 保持不变。

### Tests and real browser QA

- 新增 `tests/v17-final-usability.test.ts` 9 项，覆盖三字段直显、Round 隔离、debounce、blur flush、reload、跳过空 Round、reference 不污染当前记录、主动关闭 reference、Overview autosave、Knowledge 显式确认边界、imported immutability 与 responsive source contract。
- 新增 `tests/e2e/v17-inline-autosave.spec.ts`：真实创建 6 Messages / 3 Rounds，分别保存 Round 1/2、reload、Round 3 最近有效引用/自身空值、改选来源持久化、Overview autosave、desktop/narrow grid、无横向 overflow、Knowledge 数量不变和 Conversation 删除。
- 测试机已有非本任务的 IPv6 `*:3000` 监听，导致 Playwright 自启动的 IPv4 `127.0.0.1:3000` 偶发路由冲突；`playwright.config.ts` 仅把测试 server/baseURL 隔离到 `127.0.0.1:3100`。标准 `npm run test:e2e` 随后稳定 2/2，不改变应用默认运行端口。
- 应用内浏览器另建 `PALOS v1.7 Final Browser QA 2026-07-22`，完成相同三轮闭环。Round 3 在 Round 2 为空时引用 Round 1，Round 2 保存后自动改为引用 Round 2；改选 Round 1 后 reload 仍保持，Round 3 三个自有字段始终为空。
- Overview reload 后三个字段准确；Knowledge 仍为 0；删除临时 Conversation 后 Dashboard 无标题、Search 为 no-results、Review 无标题，PALOS Console error = 0。临时 Conversation 已通过 UI 删除，没有清理其他浏览器数据。

### Final verification and release recommendation

```text
npm run lint          passed
npm run build         passed, 19 routes
npm test -- --run     passed, 9 files / 204 tests
npm run test:e2e      passed, 2/2
git diff --check      passed
```

当前可以进入 **v1.7 release QA**。这只表示 Final Usability Correction 达到 release QA 输入标准，不代表已创建 release commit；本轮明确未 commit、未 push。

### Main files

- UI：`round-workspace.tsx`、`conversation-workspace-mode.tsx`、`round-record-panel.tsx`、`round-context-panel.tsx`、`conversation-context-panel.tsx`、`conversation-detail.tsx`
- Core：`debounced-autosave.ts`、`round-record.ts`、`round-context-inheritance.ts`、`conversation-context-service.ts`、`context-export-service.ts`、`round-knowledge-service.ts`
- Tests：`tests/v17-final-usability.test.ts`、`tests/v17-context-management.test.ts`、`tests/e2e/v17-inline-autosave.spec.ts`、`playwright.config.ts`
- Docs：PROJECT、ARCHITECTURE、ROADMAP、CHANGELOG、QA Checklist、HANDOFF

---

## 2026-07-19 UX Refinement closure

本轮只完成 v1.7 既有能力的 UX Refinement，没有新增领域、Entity、canonical store 或 IndexedDB schema，也没有接入 AI、RAG、Agent、Embedding、云 Provider 或 API Key。PALOS 继续定位为 **Personal AI Context Manager**；主流程调整为 AI 对话 / Import → Conversation → Round → 本轮记录 → Context → Decision / Task → 未来继续。

### Conversation Dashboard and content guidance

- Conversation 标题下方直接展示 Context Dashboard，首屏包含长期目标、当前状态、已确认决策、约束条件与下一步行动。
- Dashboard 提供“编辑长期 Context”“继续这个主题”“History / Timeline”三个明确入口；Context 编辑默认只在空 Context 时展开。
- “不同内容写在哪里”明确说明：Conversation Note 是普通备注，Summary 是对话摘要，Conclusion 是当前结论，Pending Questions 是未解决问题，Context 是长期维护状态。
- 原 Note / Summary / Conclusion / Pending Questions 与 `Conversation.context` 数据职责保持不变。

### Round record and inheritance UX

- 每个 Round 卡片增加“本轮记录”入口；五项字段为本轮目标、本轮结论、新增决定、遗留问题、下一步行动。
- 本轮结论继续写入 `Round.summary`；其余四项以人类可读分段写入 `Round.note`。旧自由 Round Note 作为“补充备注”兼容保留，没有新增字段或 Entity。
- Round 标题并入既有 Edit 表单，替代不稳定的 prompt-only 重命名路径；Question、Answer、Note 与 Message binding 仍使用同一个保存动作。
- inheritance 明确显示“Round 之间不是自动 AI 记忆”、来源 Round X，以及当前状态、决策、约束三个核心继承字段。
- “保留 / 删除 / 修改”继续分别映射 retained inherited value、`excludedFields` 与 `overrides`；确认前只预览，点击确认后才保存既有 Context Snapshot。

### Continue Context and Timeline

- “继续这个主题”基于现有 Context Export DTO 生成可编辑、可复制的纯文本，包含 Conversation Context、最近 3 个 Rounds、Pending Questions 与 Next Actions。
- 文本明确标记为人工维护数据，不包含 AI 推断；不写 Storage、不调用 Analyzer / Provider。
- Context Dashboard 的 History / Timeline 展示修改时间及字段 previous/next，继续复用 `ConversationVersion[kind=context]`。

### Real-use Demo and browser QA

- 通过真实 Import 创建并保留 `PALOS开发迭代记录`：6 Messages / 3 Rounds / 1 Source，而不是空 Conversation。
- Conversation Context：长期目标 `开发个人AI上下文管理工具`；当前状态 `v1.7 UX优化`；决策 `暂缓RAG和Agent`；下一步 `完成Release QA`；另记录本轮 scope 约束与一个关联 Task。
- Round 依次命名为 `重新定义PALOS路线`、`实现Context`、`优化UI`，三轮都填写五项本轮记录并在 reload 后保持。
- Round 1 从 Conversation Context 确认 Snapshot；Round 2 以 Round 1 为来源，真实执行当前状态=修改、决策=保留、约束=删除；Round 3 正确推荐 Round 2。
- 浏览器验证继续文本包含 Context、三个 Rounds、Pending Questions、Context Next Action 与关联 Task，复制成功；Timeline 展示五项 Context 变化。
- 真实视觉检查发现 320px Inspector 中继承摘要被三列布局挤压，已改为纵向堆叠；首次 prompt rename 检查暴露浏览器不支持 prompt，已由 Edit 内联标题字段修复。

### Verification and release recommendation

```text
npm run lint          passed
npm run build         passed, 19 routes
npm test -- --run     passed, 8 files / 195 tests
git diff --check      passed
```

新增回归覆盖真实 PALOS 三轮 Continue Context 文本与五项 Round 记录在既有 Summary / Note 中的序列化兼容。应用内浏览器在修复前记录到一条 `prompt() is not supported`，因此把 Round 标题改进既有 Edit 表单；修复后 reload、三轮编辑、inheritance、继续文本、Timeline 与视觉复查期间，检查点没有新增 PALOS Console error。最后一次额外新 tab 重开被浏览器表面策略拒绝，未绕过；既有 tab 已多次 reload 验证持久化。Demo 数据保留供 release QA 继续检查。

当前可以进入 **v1.7 release QA**。这表示 implementation 与 UX refinement 已达到 release QA 输入标准，不代表已经完成最终 release review 或创建 release commit。本轮按要求不 commit、不 push。

### Main UX refinement files

- Conversation：`src/app/conversation/[id]/conversation-detail.tsx`、`conversation-context-panel.tsx`
- Round：`round-workspace.tsx`、`conversation-workspace-mode.tsx`、`round-record-panel.tsx`、`round-context-panel.tsx`
- Pure formatting：`src/core/services/context-export-service.ts`、`round-record.ts`
- Tests / docs：`tests/v17-context-management.test.ts`、`src/app/help/page.tsx`、README / PROJECT / ARCHITECTURE / ROADMAP / CHANGELOG / QA Checklist / HANDOFF

---

## 2026-07-19 implementation candidate

本轮从干净的 `release/v1.6.5` 基线开始。Phase 0 的 lint、187 项测试与 build 全部通过；`v1.6.5` 标签指向稳定发布提交，当前 HEAD 另含 release baseline 文档。v1.7 没有创建 commit、没有修改 IndexedDB schema、没有新增 canonical store 或大型 Aggregate，也没有扩展 Provider、Agent、RAG、Embedding、MCP、Cloud Sync、Mobile 或多人协作。

### Product position

PALOS v1.7 的定位是 **Personal AI Context Manager**：Conversation 保存人与 AI 的原始协作过程，Context 表达当前仍然有效的背景/状态/决策/约束，Knowledge 只保存人工确认且适合长期复用的信息。Analyzer / Provider 关闭时，Import、Context、Decision、Task、Search 与 Export 仍然可用。

### Context model and reused fields

- 保留 `Conversation.note`：自由、长期项目备注，不与结构化 Context 合并。
- 保留 `summary`：Conversation 的压缩概览。
- 保留 `conclusion`：当前最终结论。
- 保留 `pendingQuestions`：仍未解决的问题。
- 新增 optional embedded `Conversation.context`：`longTermBackground`、`currentState`、`decisions`、`constraints`、`nextActions`。
- `Round.note` 继续表示本轮新增的人工备注；`Round.summary` 继续表示本轮客观摘要。
- 新增 optional embedded `Round.context`，保存 inheritance mode、sourceRoundId、excluded fields、overrides、confirmed snapshot 与 confirmedAt。Round 仍不是 Aggregate Root。

### Round Context inheritance

- 默认只推荐同一 Conversation 内最近、早于当前 Round、且有有效 Context Snapshot 的 Round；没有候选时使用 Conversation Context。
- 用户可选择来源 Round、逐字段 Override、逐字段 Exclude，或取消整轮继承。
- Preview 不写 Storage；只有点击“确认本轮 Context Snapshot”才保存。
- 取消继承后只保留用户本轮 Override，不自动删除 Round Note。
- Conversation 复制会重映射 Round Context 的 `sourceRoundId`；Split 出来的新 Round 不自动复制已确认 Context。

### Context Timeline

- 复用现有 ConversationVersion/Snapshot；没有创建 Event 系统。
- `ConversationVersion` 增加 optional `kind` 与 `contextChanges`。每次有效 Context CRUD 追加 `kind=context` 的不可覆盖记录，包含 previous/next value。
- 手动与自动恢复点现在可选标记 `manual` / `automatic`，旧 Version 缺失 kind 时继续按原逻辑读取。
- Timeline 在 Conversation Context 区域展示“什么时候改变了什么”；清空当前 Context 也保留历史。

### Task, Search, and Export

- Conversation 内 Next Actions 复用现有 Task + Conversation SourceRef；用户可创建、完成、重开。AI 不会自动创建 Task。
- Search 仍是运行时关键词 + subsequence fuzzy；匹配优先级为 Context → Summary → Conclusion → Knowledge → Round Note → Message。Raw Message 仍只在高级模式出现。
- `ContextExportService` 输出稳定 `palos-context-export` v1.0 JSON：Conversation、Context、Decision current/history、关联 Task、Round summary/note/context snapshot。导出不调用模型。

### Compatibility and storage

- canonical IndexedDB stores 仍为 7 个：`conversations`、`messages`、`rounds`、`sources`、`proposals`、`knowledge-cards`、`conversation-versions`。
- Browser/IndexedDB Conversation 与 Round adapter 对新增 optional context 字段集中归一化；v1.6.5 记录缺失字段时返回空 Context，不回写、不清空旧数据。
- App Data Export/Restore 的 JSON 记录结构继续兼容；没有 storage rewrite 或 schema migration。

### Main files

- Entity：`src/core/entities/conversation.ts`、`round.ts`、`conversation-version.ts`
- Service：`conversation-context-service.ts`、`round-context-inheritance.ts`、`context-export-service.ts`、Search/Task/Version/Workspace 相关最小扩展
- Infrastructure：`context-normalization.ts` 与四个 Conversation/Round Browser/IndexedDB adapters
- UI：`conversation-context-panel.tsx`、`round-context-panel.tsx`，以及 Conversation Detail / Classic / Workspace Mode 集成
- Tests：`tests/v17-context-management.test.ts`
- Docs：README、PROJECT、ARCHITECTURE、ROADMAP、CHANGELOG、QA Checklist、Help、HANDOFF

### Automated tests

- 新增 6 项：Context CRUD + Timeline、v1.6.5 export compatibility、Round inheritance、Override/Exclude、inheritance cancel、Context Export、Search priority（部分行为在同一用例组合验证）。
- 当前全量结果：8 files / 193 tests passed。
- 最终 `npm run lint` passed；`npm run build` passed（19 routes）；`npm test -- --run` passed（8 files / 193 tests）；`git diff --check` passed。
- `npm run test:e2e` 首次在沙箱内因 `listen EPERM 127.0.0.1:3000` 无法启动；获准在本地测试环境重跑后发现 Search placeholder 稳定 selector 回归。恢复原 placeholder 合约后再次重跑，Playwright 1/1 passed（create → TXT import → reload → search → export → delete/reload → restore → search）。

### Manual QA and remaining limits

- `docs/QA_CHECKLIST.md` 新增 V17-01–V17-10；本轮尚未执行浏览器人工 QA，因此当前是 implementation candidate，不标记正式 release-ready。
- Context Timeline 与 Context 当前态跨 Conversation/Version 两个现有 store 写入，沿用当前非跨 store 事务边界。
- Context field 是人工维护的文本，不是自动 Memory、知识图谱或语义状态机。
- Context Export v1.0 是未来 LLM/Agent/RAG 的输入准备，本轮没有调用或启用这些能力。

### Next recommendation

先执行 V17-01–V17-10 浏览器 QA，重点验证旧 v1.6.5 数据、Round 推荐/取消继承、Timeline history、Task linkage、Search order、Context JSON 与 App Data restore。自动与人工门禁通过后可进入单一 v1.7 release review；不拆 v1.7.1/v1.7.2。本轮按要求不创建 commit。

---

# PALOS v1.6.5 — Stable Candidate Handoff

## 2026-07-19 candidate closure

本轮先把完整 v1.6.4 dirty worktree 固化为 `9ed8feb checkpoint: v1.6.4 known issues closure`，随后只完成用户批准的 Stable 收口。没有 push，没有创建最终 release commit，没有修改 IndexedDB schema，也没有迁移 Task、Workspace、Asset、AnalyzerRun、Tag 或其它 sidecar。

### Storage Factory closure

- `analysis-result`、`round-workspace`、`conversation-workspace-mode`、`workspace-manager`、`tag-manager`、Tasks 与 Today 中涉及七类 canonical entity 的读取/写入统一走 `storage-factory`。
- 七类 canonical entity 仍为 Conversation、Message、Round、Source、Proposal、KnowledgeCard、ConversationVersion。
- 新增 source-contract 回归，防止指定业务页面重新直接依赖 canonical `Browser*Storage` implementation。

### App Data restore closure

```text
preview / import
  → validate envelope, store keys, record IDs, duplicates and references
  → drain pending IndexedDB writes
  → backup selected LocalStorage keys + affected IndexedDB stores
  → apply restore
  → clear caches + preload
  → verify LocalStorage content + IndexedDB ID sets
  → success

failure
  → restore backup
  → verify backup
  → report verified rollback OR explicitly report unconfirmed data state
```

- Restore 不再仅凭 `replaceStores()` resolve 就报告成功。
- UI success 文案包含实际验证数量与 pre-restore backup 数量。
- Generic failure 不再宣称“原数据已回滚”；只有 `AppDataRestoreError.rollbackSucceeded=true` 的路径才携带 verified rollback 结论。
- Backup 是本次操作内的内存快照；journal recovery 明确未实现。

### Minimal Playwright E2E

- 新增 `@playwright/test`、`playwright.config.ts` 与单条 desktop Chrome 串行测试。
- 闭环：create Conversation → Existing TXT import → detail reload → Search → App Data export → delete → reload durability → App Data restore → Search。
- E2E 首次执行发现 URL 直接进入 `inputMode=txt` 时 parser state 仍初始化为 ChatGPT；已最小修复为初始 mode 与 parser 一致。
- 删除后 ConversationList 会立即更新，但同页 Conversation Explorer 的独立 React snapshot 要到 reload 才同步；E2E 以 delete → reload 验证 canonical durability，本轮未扩展到跨组件状态重构。

### Verification

```text
npm run lint          passed
npm run build         passed, 19 routes
npm test -- --run     passed, 7 files / 187 tests
npm run test:e2e      passed, 1 test
git diff --check      passed
```

### Remaining risks

- Restore 没有 durable journal；浏览器在 replace 与 verification 之间异常退出时不能自动恢复。
- Playwright 当前使用系统 Chrome channel；没有安装仓库固定版本的 Chromium binary。
- Conversation Explorer 删除后同页 snapshot 可能短暂陈旧，reload 后 canonical 状态正确。
- ChatGPT import transaction fan-out 与 advanced cross-source semantic dedup 仍是 backlog。
- 当前 v1.6.5 candidate 改动仍在工作区；最终 release commit 尚未创建。

### Release recommendation

自动门禁与完整 E2E 均通过后，建议进入一次人工 release review；若接受上述剩余风险，可创建独立 v1.6.5 release commit。按本轮要求不创建该 commit。

---

# PALOS v1.6.4 — Known Issues Closure / Existing TXT / Import Diagnostics

## 2026-07-16 work-in-progress checkpoint

本轮在 `fix/v1.6.4-known-issues-closure`、基线 `9d8a83c` / `v1.6.3-integrity-ui-closure` 上完成实现；没有修改 IndexedDB schema，没有重写 v1.6.1 canonical atomic delete、v1.6.2 structured ChatGPT import 或 v1.6.3 referential integrity，没有清理用户浏览器数据，也没有创建 commit。

Canonical IndexedDB stores 仍固定为 7 个：`conversations`、`messages`、`rounds`、`sources`、`proposals`、`knowledge-cards`、`conversation-versions`。LocalStorage 继续承载 `current-source` / `current-proposal` 选择指针、轻量配置、UI preference、storage metadata、legacy migration 数据与其它非 canonical sidecars。

### Complete Known Issues Matrix

| ID | 来源 | 审计状态 | 级别 | 本轮结果 | 验收证据 |
| --- | --- | --- | --- | --- | --- |
| KI-01 Existing + TXT | 用户反馈 / code audit | partially fixed | P1 | fixed | Existing 可直接选 TXT；`ImportService.appendToConversation` 追加 Source/Message/Round；reload durability test |
| KI-02 Import progress | 用户反馈 / code audit | confirmed open | P1 | fixed | 明确 10 phases；批量每 10 Conversations 更新；显示 Message/Round/skipped counters |
| KI-03 quota warning / confirm | 用户反馈 / code audit | confirmed open | P1 | fixed | 超阈值按钮不再 disabled；warning 后进入 explicit confirm；quota stop 有 processed/unprocessed |
| KI-04 Copy Diagnostics 普通用户可见 | 用户反馈 / code audit | confirmed open | P1 | fixed | `NEXT_PUBLIC_PALOS_DIAGNOSTICS=1` gate；默认 component 返回 null |
| KI-05 production debug/console | TODO / code audit | confirmed open | P1 | fixed | console 只在 bulk flag 输出；移除 R1.3 logs 与旧 console fallback 文案 |
| KI-06 AppEventLog 循环实例化 | code audit | confirmed open | P2 | fixed | ChatGPT batch 每个 component 复用一个 `BrowserAppEventLogStorage` |
| KI-07 Quick filter tests | code audit | confirmed open | P2 | fixed | pure quick-filter helper + all/empty/imported/failed/workspace tests |
| KI-08 deriveRoundDrafts edges | code audit | partially fixed | P2 | fixed | empty/system/orphan/unknown/consecutive assistant tests；既有 parsing 不变 |
| KI-09 cross-source duplicate | 用户反馈 / code audit | confirmed open | P1 | fixed | same identity skip；same source later update append；different source same content preserved |
| KI-10 docs stale | README/ARCHITECTURE/ROADMAP/CHANGELOG/HANDOFF | confirmed open | P1 | fixed | 五份文档统一 v1.6.4 WIP、7 stores、sidecars、matrix 与 backlog |
| KI-11 mode stale state / URL | 用户反馈 / code audit | confirmed open | P1 | fixed | target/input switch 清无效 state；New URL 不保留 target；legacy target param 移除 |
| KI-12 invalid TXT | 用户反馈 / code audit | partially fixed | P1 | fixed | empty/whitespace/no labels/invalid UTF-8 全部 failed，不可 confirm |
| KI-13 Existing append report count | 用户反馈 / code audit | partially fixed | P1 | fixed | report 来自实际新增 ID/count；success 前 reload 后核对 delta 与引用 |
| KI-14 error + stale success | 用户反馈 / code audit | confirmed open | P1 | fixed | 新操作清旧 report/error；失败清 report；success 只在 verifying 后设置 |
| KI-15 delete/Clear 后立即 import | v1.6.1 regression | already fixed | P1 | preserved | 既有 Clear / single delete / batch delete 后 import tests 继续通过 |
| KI-16 Proposal/Note/Navigator | v1.6.3 HANDOFF | already fixed | P0/P1 | preserved | orphan cleanup、Review not-found、single Note editor、contained Navigator、Analyzer gate tests 继续通过 |
| KI-17 import transaction fan-out | code comment / HANDOFF | feature backlog | feature | not implemented | 记录为 future performance debt；本轮不改 canonical storage contracts |
| KI-18 share link / mobile / cloud / AI | product non-goals | feature backlog | feature | not implemented | 五份文档明确未支持，不冒充 current capability |

### Existing + TXT final execution chain

```text
Existing target selector
  → TXT File input
  → fatal UTF-8 decode
  → ImportParserPipeline.preview(parserId = txt)
  → reject empty / whitespace / no speaker labels / no Messages
  → ImportService.appendToConversation(targetId)
  → save Source(filename + raw content)
  → save Messages(target conversationId + actual IDs)
  → save Rounds(target conversationId + actual Message IDs)
  → update target Conversation.updatedAt
  → flushCachesToIndexedDB
  → clearCaches
  → preloadAll
  → verify Conversation count unchanged, Source metadata, exact Message/Round delta,
     ownership, returned IDs, and every Round.messageIds reference
  → success report
```

失败会清除旧 success report 并显示明确 error；不会创建额外 Conversation。Existing TXT 不调用 ChatGPT structured parser。

### Final Import mode matrix

| Target | Input | Status | Write semantics |
| --- | --- | --- | --- |
| New | ChatGPT Export | supported | structured linearizer → one canonical Conversation per selected source；external conversation duplicate skip |
| New | Paste Text | supported | labeled-text Preview → new Source/Messages/Rounds |
| New | TXT File | supported | UTF-8 TXT Preview → new Source/Messages/Rounds |
| Existing | ChatGPT Export | supported | append new external message identities；old content untouched |
| Existing | Paste Text | supported | append one Source segment + parsed Messages/Rounds |
| Existing | TXT File | supported | same text/TXT pipeline；preserve filename；durable reload verification |

### Duplicate semantics boundary

- Same ChatGPT Export imported in New mode：existing `externalConversationId` means no duplicate Conversation copy.
- Same ChatGPT Conversation later update：Existing append skips existing `externalMessageId` values and appends new identities; no longer skips the whole source after the first intersection.
- Same TXT file appended again：there is no reliable cross-file identity, so PALOS does not pretend to provide semantic file dedup.
- Repeated content inside one TXT append：each parser result is written exactly once; identical legitimate utterances are preserved with distinct canonical IDs.
- Different source, same content：not globally deduplicated by pure content hash.
- `skipped` for ChatGPT means messages skipped by known external identity; `skipped` for Paste/TXT is currently `0`.

### Progress / error / quota state machine

`idle → parsing → preview-ready → confirming → importing → flushing → verifying → success`

Terminal alternatives are `failed` and `quota-stopped`. Batch progress reports processed/selected Conversations, imported Messages, imported Rounds and skipped Messages; React state updates every 10 Conversations or at final item, not per Message. New operations clear old error/success. Storage success is impossible before flush and reload verification. Quota warning does not disable the action; user may cancel at confirmation. `quota-stopped` only counts items still readable after persistence verification and reports unprocessed Conversations.

### Production diagnostics

- Bounded in-memory buffer remains available to code and tests without affecting correctness.
- `BulkDiagnosticsCopyButton` and `[PALOS BULK DIAG]` console output require `NEXT_PUBLIC_PALOS_DIAGNOSTICS=1`.
- Analyzer failure injection remains independent behind `NEXT_PUBLIC_PALOS_ANALYZER_DIAGNOSTICS=1`.
- ID arrays are normalized to count + at most 10 sample IDs; batch-delete residual console output is also sampled.
- Diagnostics did not add any drain、flush、clearCaches or preload call and is not a success dependency.

### Small performance / quality changes

- `BrowserAppEventLogStorage` moved out of both ChatGPT batch loops and is reused.
- Import progress is throttled per 10 Conversations.
- Import preview remains memoized only on artifact/parser inputs; unrelated progress/report state does not trigger full parse.
- Conversation quick filters and Import URL/phase state are reusable pure helpers.
- ChatGPT per-Conversation pending-write fan-out was not refactored and remains documented performance debt.

### Tests

- 原 159 tests 全部保留。
- 新增 25 tests；当前总数为 6 files / 184 tests。
- 新增覆盖：六种 Import 组合、Existing TXT count/ownership/reference/source metadata、flush→clear→preload durability、invalid TXT、mode/URL、same-source update、cross-source same content、TXT repeats、progress/failure/quota、diagnostic flags/sampling、quick filters、deriveRoundDrafts edges。
- 既有 atomic batch delete、Clear write barrier、Proposal integrity、Review not-found、Note editor、Navigator contained scroll、ChatGPT count parity 与 Manual text parsing 回归继续通过。

### Files

- Import UI：`src/app/import/import-workbench.tsx`、`src/app/import/chatgpt-export-import.tsx`
- Import services/state：`src/core/services/import-service.ts`、`chatgpt-export-import.ts`、`import-parser-pipeline.ts`、`import-page-state.ts`、`import-operation-state.ts`
- Diagnostics/quality：`src/infrastructure/diagnostics/bulk-data-diagnostics.ts`、`src/app/bulk-diagnostics-copy-button.tsx`、`src/core/services/conversation-quick-filters.ts`、`src/app/conversation/conversation-list.tsx`
- Tests：`tests/v164-known-issues.test.ts`、`chatgpt-export-import.test.ts`、`indexeddb-reliability.test.ts`、`bulk-data-diagnostics.test.ts`
- Docs：`README.md`、`ARCHITECTURE.md`、`ROADMAP.md`、`CHANGELOG.md`、`HANDOFF.md`

### Explicit backlog

- ChatGPT share-link import；update an existing Conversation from share link。
- mobile / PWA；cloud / multi-device sync；multi-user / family sharing。
- attachment / voice / canvas / tool nodes。
- import transaction fan-out optimization。
- advanced cross-source semantic dedup。
- AI / RAG / Embedding。

### Verification / browser QA / commit

最终 gate：`npm run lint` passed；`npm run build` passed（19 routes）；`npm test -- --run` passed（6 files / 184 tests）；`git diff --check` passed。

2026-07-19 已完成真实、可回收的应用内浏览器闭环，没有清空整个浏览器数据：

1. 通过 New + Paste 创建临时 Conversation，初始统计为 2 Messages / 1 Round / 1 Source。
2. 从详情页真实点击进入 Import，选择 Existing + TXT；页面只显示 1 个 target selector 与 1 个 file input。
3. 真实上传 UTF-8 TXT；preview 与 success report 均为新增 4 Messages / 2 Rounds / 0 skipped。
4. 首轮发现详情页显示 6 Messages / 3 Rounds / **1 Source**。底层 Source 记录实际均已保存，问题是详情页把 singular latest Source 错当作总数。先保存截图与 Console 证据，再让 `conversation-detail.tsx` 按 `conversationId` 统计全部 Source；回归测试增加已有 Source 后 append 应保留 2 条的断言。
5. 修复后从创建临时 Conversation 开始完整复跑：追加后为 6 Messages / 3 Rounds / 2 Sources；整页刷新后仍为 6 / 3 / 2。
6. 删除临时 Conversation 后，Dashboard 无标题残留；Search 使用完整临时标题查询返回 no-results；Review 显示 canonical missing/deleted state，没有旧实体内容。
7. 每个截图检查点的 PALOS tab Console error 均为 0。文件选择期间 Codex Browser client 的 Statsig 遥测请求发生超时，但不在 PALOS 页面 Console 中，也未影响解析、flush、verify 或删除。

截图与逐步 Console 记录位于 workspace 外的 Codex visualization artifact：`palos-v164-browser-qa-2026-07-19/`。两个临时 Conversation 均已通过现有 UI 删除，没有清理或重置其他浏览器数据。

本轮不创建 commit。真实浏览器 QA 与最终自动门禁均通过后，可以建议用户创建聚焦的 v1.6.4 commit。

---

# PALOS v1.6.3.1 — Current Referential Integrity and UI Regression Closure

## 2026-07-16 checkpoint

本轮继续使用 `fix/v1.6.3-referential-integrity` 与现有 dirty worktree；没有切分支、reset/restore、清理浏览器数据或创建 commit。改动只覆盖现存 orphan Proposal、Conversation Note 语义、Round Navigator 真实布局和 Analyze 手工失败注入入口。

后续验收更新：用户已于 2026-07-16 确认 Safari manual QA 通过；此前仅剩的 Safari sticky / active-number / document-scroll smoke blocker 已关闭。

### 真实 orphan Proposal 的物理来源

在修改前，通过当前 `http://localhost:3000` 浏览器状态导出并核对，残留 Proposal 为：

- ID：`demo-proposal-f962faf8-2086-463d-97f8-73279ff5da8e`
- 短标题：`关于「Sprint2 验收对话-Claude」的内容提炼`
- active storage mode：IndexedDB
- canonical IndexedDB：Conversation / Message / Round / Source / Proposal / KnowledgeCard 均为 `0`；canonical `proposals` store **不包含**该 ID。
- `ai-learning-os.proposals`：包含 2 条 legacy accepted Proposal，其中包含该 ID。
- `ai-learning-os.current-proposal`：包含该 ID 的**完整 Proposal 对象**，不是仅有 ID 的选择指针。
- 其他持久 Search index：不存在；Search 在运行时重建文档。

修改前各读取路径的实际语义：

- `BrowserProposalStorage.getAll()` 会返回 legacy `ai-learning-os.proposals`，因此能返回该 ID。
- `IndexedDBProposalStorage.getAll()` 会把 `current-proposal` 完整对象合并到空 canonical cache，因而返回 1 条该 ID。
- `createProposalStorage().getAll()` 在 IndexedDB mode 下走上述 IndexedDB adapter，同样返回 1 条该 ID。
- Dashboard 与 Search 因 active adapter 把 stale pointer 当成实体而显示 Proposal `1`；Review 当时仍直接读 Browser storage，并可从 legacy Proposal / current selection 打开同一个 ID。
- 因此这不是 canonical IndexedDB 中的 orphan，而是 **legacy Proposal 副本 + full-object current pointer 两个 LocalStorage 来源同时存在**，再由 adapter 合并/回退语义复活。Dashboard 的 Conversation 为 0、Proposal 为 1，根因正是 `current-proposal` 被当成 canonical entity，而不是独立 Search cache。

仅记录了 ID、count、linkage 与短标题；没有输出完整 Conversation 内容。

### Proposal cleanup 与一致性修复

- `current-proposal` 现在只写 `{ id }`；仍可读取旧 full-object 格式以完成兼容清理，但对象内容永远不再作为 Proposal 实体或 `getAll()` 数据源。
- Browser / IndexedDB adapter 的 `getCurrent()` 都先用 pointer ID 回查当前 active canonical collection；ID 不存在时清除 pointer 并返回 `null`。
- IndexedDB preload 增加一次 bounded integrity cleanup：只检查 canonical Proposal drafts，通过 `conversationId`、`sourceId`、`sourceRoundId`、`sourceMessageIds` 核对 Conversation / Source / Round / Message；删除 linkage 已失效的 Proposal ID，并清理 stale current pointer。
- preload cleanup 不扫描/重写其他业务 store，不删除 accepted formal KnowledgeCard，也不删除 IndexedDB mode 下的 legacy `ai-learning-os.proposals`。legacy 数据仍可供 LocalStorage mode 使用，但不会合并进 IndexedDB canonical 结果。
- 单删和原子批删继续通过同一 dependency collector 处理全部四类 Proposal linkage；只通过 deleted Round 或 deleted Message 关联的 Proposal 也会删除。
- Dashboard、Search、Review 均使用 active storage factory；Review 按 URL ID 回查 canonical storage，既不回退到 pointer full object，也不保留旧 component state。
- 删除后的 direct URL 显示 `Proposal 不存在或已删除`，且不渲染旧 title、summary、evidence 或 action。

### Conversation Summary / Conversation Note

修改前真实页面左侧是 `Conversation Summary / 对话总结`，右侧却只有泛化的 `备注 / Note`，两者都呈现为可修改内容，容易被理解为重复编辑器；此前处理的是 Round Note，未解决这个 Conversation-level 语义问题。

最终交互：

- 左侧保持 `Conversation Summary / 对话总结`：说明为“结构化记录从 Conversation 生成或整理出的结论”，保留结构化字段与现有确认保存机制。
- 右侧改为 `Conversation Note / 对话备注`：说明为“手动记录附属于此 Conversation 的私有上下文”。
- 默认只读预览与 `编辑对话备注`；进入编辑态后只出现一个 textarea、`保存`、`取消`；preview/editor 互斥。
- 继续使用现有 `Conversation.note` 字段与可靠 save 路径，没有 schema 变更、富文本、第二个 Inspector editor 或 Summary/Note 字段合并。

### Round Navigator 的真实布局修复

上一版把 `sticky top-4 self-start` 放在 Navigator 组件自身，仍处于页面 flex 子项语境，并与全局 sticky header 的高度冲突；Safari 实页没有形成稳定、清晰的 page-level sticky rail。sticky 的所有权与完整详情页边界没有被布局结构显式保证，这是“CSS 类存在但真实页面仍随正文移动”的原因。

新布局：

- Conversation Detail 使用 page-level 两列 grid；左侧是显式 `<aside class="sticky top-20 self-start">`，右侧包含 Raw Timeline、Context、Summary/Note、Assets、History、Source、Rounds、Proposal、Knowledge 的完整详情内容。
- sticky parent 因此跨越整页详情，而不是在某个短 section 结束；`top-20` 避开全局 header。
- 实测 ancestor chain 从 `aside` 到 `html` 均无 trapping `overflow`、`transform`、`filter` 或 `contain`；Navigator 自身有显式 max-height 与 internal `overflow-y-auto`。
- collapsed 实测在 `scrollY=3691.5` 与 `4827.5` 时 rail top 均为 `80px`；expanded 在 `scrollY=4633.5` 与 `4895.5` 时 rail top 也均为 `80px`。
- IntersectionObserver 只更新 active round ID；后续 effect 只调用 Navigator internal container 的 `scrollTo()`。Observer 路径不存在 `window.scrollTo()`、`element.scrollIntoView()` 或其他 document scroll。
- 只有用户点击编号时才使用显式 element top + `88px` header offset 滚动正文；不再使用 `block: "center"`。

### “模拟失败”

该按钮是 Demo Analyzer 的手工 failure injection，用于测试真实 error banner、Retry、provider switch 与 timeout UI，不是正常业务入口。底层失败路径保留，但按钮默认隐藏；仅当显式设置 `NEXT_PUBLIC_PALOS_ANALYZER_DIAGNOSTICS=1` 时显示。普通本地开发与 production 均不会默认出现，真实 analyzer error handling 未删除。

### Tests

新增/更新回归覆盖：

- IndexedDB canonical orphan（包括仅 `sourceRoundId` / `sourceMessageIds` linkage）清理。
- stale legacy Proposal 不进入 IndexedDB mode，full-object pointer 不能复活 entity，pointer 被清除。
- `createProposalStorage()` / Dashboard-equivalent count / Search docs / Review lookup 全部为 0。
- valid Proposal 在删除 owner 前保留；删除 owner 后仅删除关联 Proposal，unrelated Proposal 保持。
- valid/deleted direct Review URL 与 stale pointer fallback。
- Conversation Note preview/edit 互斥、cancel restore、save persist、唯一 textarea，以及 Summary/Note label 区分。
- Navigator observer/internal scroll 与 user/document scroll 合约、visible/above/below contained scroll、page-level layout source contract。
- failure injection 默认隐藏、显式 diagnostics flag 可见、真实 Retry/provider/timeout error UI 仍存在。

当前完整测试数为 5 files / 159 tests。

### 真实浏览器 QA

Codex in-app browser 在同一 `localhost:3000` origin 上实际访问了 IndexedDB，并跨 reload 与 production server restart 保持数据；没有清浏览器数据。

1. 初始 orphan cleanup 后：Dashboard `Conversation 0 / Messages 0 / Knowledge 0 / Proposal 0`；Search 无旧 Proposal；旧 URL `/review?proposal=demo-proposal-f962faf8-2086-463d-97f8-73279ff5da8e` 显示 `Proposal 不存在或已删除`。
2. 通过 UI 创建 `v1.6.3.1 QA Conversation`（2 Messages / 1 Round），生成 Proposal `source-proposal-eed7b3b4-0eb7-42fb-b93b-7e8b5a80c881`；Dashboard Proposal 1、Search 1、Review direct URL 可打开同一 Proposal。
3. Note UI 显示最终两组 label；取消不会保留草稿，保存 `v1.6.3.1 QA private context` 后 reload 仍存在，任一时刻只有一个 Note textarea。
4. Navigator collapsed / expanded 均保持 `80px` rail top；滚动 settle 后 `scrollY` 不反向变化；普通 UI 未出现“模拟失败”。
5. 通过 UI 删除 QA Conversation 并 reload：Conversation list 0；Dashboard `Conversation 0 / Messages 0 / Proposal 0`；Search 无 Proposal；刚生成的 direct URL 显示 `Proposal 不存在或已删除`。

Codex 工具执行上述同源浏览器 QA 时，无法在不读取用户其他 Safari tab URL 的情况下定位 authoritative localhost tab；该读取被隐私保护拒绝。因此上述记录只代表真实浏览器 IndexedDB QA，不把工具结果冒充 Safari app QA。随后用户已完成 Safari 专项手工验收并确认通过，collapsed / expanded rail、active number、document scroll、Dashboard/Search/Review 以及 Note / failure-injection 文案的最终 blocker 已关闭。

### 关键文件

- Proposal integrity / pointer：`src/core/services/conversation-referential-integrity.ts`、`src/infrastructure/storage/flow-pointers.ts`、`src/infrastructure/storage/indexeddb/preload.ts`、Browser/IndexedDB Proposal adapters、`canonical-operations.ts`
- Dashboard/Search/Review：`src/core/services/global-search.ts`、`search-index-service.ts`、`proposal-review-lookup.ts`、`src/app/review/review-proposal.tsx`
- Note / Navigator / diagnostics：`src/app/conversation/[id]/conversation-detail.tsx`、`round-navigator.tsx`、`conversation-workspace-mode.tsx`、`round-workspace.tsx`、`note-editing.ts`、`round-navigation.ts`、`analyzer-diagnostics.ts`
- Existing delete/provenance support：Conversation list/workspace service、AnalyzerRun storage、Knowledge list/detail、Source adapters
- Tests：`tests/indexeddb-reliability.test.ts`、`tests/v163-ui-regressions.test.ts`

### Verification 与 commit 建议

最终 gate：`npm run lint` passed；`npm run build` passed（19 routes）；`npm test -- --run` passed（5 files / 159 tests）；`git diff --check` passed。Safari manual QA 已由用户确认通过，提交阻塞项已关闭；本工作树适合整理为单独的 integrity / UI closure commit。

---

# PALOS v1.6.3 — Referential Integrity, Note UX, and Round Navigation Handoff

## 2026-07-14 checkpoint

本轮在 `fix/v1.6.3-referential-integrity`（基于 `v1.6.2-import-count-parity`）完成最小范围实现；未修改 IndexedDB schema、canonical store 集合、ChatGPT parser 或 v1.6.1 的单次 `replaceStores` 原子事务模型，未创建 commit。

### Confirmed root cause

- Conversation 删除只按 `proposal.conversationId` / `proposal.sourceId` 过滤，遗漏只通过 `sourceRoundId` 或 `sourceMessageIds` 关联的 Proposal。
- `current-proposal` 是 LocalStorage 中的完整 Proposal 对象；Browser / IndexedDB Proposal adapter 的 `getAll()` 会把该指针重新合并进集合。canonical Proposal 已删除后，旧指针因此会被 Review 读取，并重新进入运行时 Search 文档。
- Review 页面此前直接实例化 Browser storage，绕过 IndexedDB 默认 storage factory。
- Search 没有持久化索引；幽灵结果的根因是残留 Proposal / 指针被 storage adapter 重新暴露，不是独立 Search 数据库。

Proposal 的真实关联字段为：`conversationId?`、`sourceId?`、`sourceRoundId?`、`sourceMessageIds?`；`targetKnowledgeId?` 是更新目标，不是来源引用。不存在 `sourceRef` 或 `targetEntityId`。

### 删除语义

- 单删与批删统一：Conversation、Message、Round、Source、Proposal、ConversationVersion 删除；AnalyzerRun 按 Conversation / Source / Round / Message 引用清理；Conversation/Round Asset metadata 清理。
- `current-source`、`current-proposal` 在 canonical commit 后按本次 dependency IDs 清理。
- Task 延续既定语义，保留来源快照；不擅自删除。
- 正式 KnowledgeCard 是独立 aggregate，单删和批删均保留。其历史 provenance ID 仍可留作快照，但 Search、Knowledge 列表和 Detail 只有在 Conversation/Round 仍存在时才生成实时跳转；否则明确显示来源已删除。
- Proposal / 未确认草稿随 Conversation 删除，不与正式 KnowledgeCard 混同。
- post-delete verification 现在核对请求 ID、每类 dependent ID、全局 orphan 数、cache/IndexedDB count、Search 重建、Review lookup、current pointers 与 pending write count。

### Note UX

- 根因：Workspace 模式对同一个 `Round.note` 同时展示正文只读预览和右侧 Inspector 无标签编辑器。
- 新交互：正文位置默认只读 `Round Note`；点击“编辑备注”后原位置显示 textarea、保存、取消；预览与编辑器互斥；右侧重复入口移除；继续使用现有 `Round.note` 字段和手动保存。

### Round Navigator

- 根因：Navigator 项点击使用 `scrollIntoView({ block: "center" })`，且 sticky 放在内部子节点，导航内部没有独立 active-item 滚动策略；一旦自动 active 更新接入同一路径，会形成 document scroll → active update → document scroll 的反馈环。
- Navigator 外层现在直接 `sticky top-4 self-start`；IntersectionObserver 只更新 active ID。
- active item 可见性通过 `calculateContainedScrollTop()` 计算，并只调用 Navigator overflow container 的 `scrollTo()`；Observer 路径从不滚动 document。
- 只有用户点击 Round 才调用 `window.scrollTo()` 定位正文，并使用固定 88px header offset。collapsed / expanded 共用同一内部滚动规则；空 Round 文案不变。

### 关键文件

- Referential integrity：`src/core/services/conversation-referential-integrity.ts`、`src/core/services/conversation-workspace.ts`、`src/infrastructure/storage/indexeddb/canonical-operations.ts`
- Pointer / adapter：`src/infrastructure/storage/flow-pointers.ts`、Browser/IndexedDB Proposal 与 Source adapters
- Review / Search / Knowledge：`src/app/review/review-proposal.tsx`、`src/core/services/proposal-review-lookup.ts`、`src/core/services/search-index-service.ts`、Knowledge list/detail
- Note：`src/core/services/note-editing.ts`、`src/app/conversation/[id]/conversation-workspace-mode.tsx`
- Navigator：`src/core/services/round-navigation.ts`、`src/app/conversation/[id]/round-navigator.tsx`、`round-workspace.tsx`
- Tests：`tests/indexeddb-reliability.test.ts`、`tests/v163-ui-regressions.test.ts`

### 自动化验证

截至本 checkpoint：

```text
npm run lint       passed
npm run build      passed, 19 routes
npm test -- --run  passed, 5 files / 151 tests
git diff --check   passed
```

新增回归覆盖 Proposal 指针复活、round/message-only Proposal、Review not-found、Search 重建、Knowledge 保留、100 Conversation 原子批量删除与 reload、pendingWriteCount、AnalyzerRun/Asset sidecar、Task 保留、Note 状态，以及 Navigator contained-scroll 纯函数。

### 限制与下一步

- 当前 Codex 内置浏览器执行环境报告 `indexedDB` 不可用，因此无法在本轮环境中完成用户要求的“真实浏览器 IndexedDB”自动复现；Vitest 覆盖的是完整 IDB transaction/cache harness，不能冒充真实浏览器验证。
- commit 前必须在支持 IndexedDB 的桌面浏览器完成下方 smoke test；在该项完成前不建议 commit。
- 未创建 commit。

### Minimal manual QA

1. IndexedDB 模式创建 Conversation + Message/Round/Source/Proposal；确认 Review 与 Search 可见。
2. 分别单删与 100 条批删，刷新后确认 Proposal、Review URL、Search、current pointers 不恢复，正式 Knowledge 仍可打开且无失效来源跳转。
3. 模拟 AnalyzerRun / Conversation 与 Round Asset metadata，确认删除后 metadata 清理而真实文件不受影响；Task 保留来源快照。
4. Workspace 模式验证 Round Note 默认预览、编辑/取消/保存互斥，右侧无第二编辑器，刷新后内容保持。
5. 长 Conversation 中持续滚动正文，确认 collapsed / expanded Navigator 均固定、只在内部滚动；点击 Round 使用稳定 header offset，无页面向上跳或抖动。

---

# PALOS v1.4 Finalization — IndexedDB Default Storage + Unified Import UX Handoff

## 2026-07-08 checkpoint

本轮完成 PALOS 业务存储默认收敛到 IndexedDB，并统一 Import / App Data / destructive persistence 的关键路径。未创建 commit，未删除现有测试，未回退 Storage Reliability Fix。

### 完成内容

- IndexedDB 成为业务数据默认存储；无 storage mode key 的新用户会直接使用 IndexedDB。
- LocalStorage 保留为轻量配置、UI preference、current pointer、legacy migration source 和 debug/rollback 工具。
- Import 页面一级路径统一为「新建 Conversation」与「追加到已有 Conversation」，两条路径均支持 ChatGPT Export 与手动文本。
- Existing + Text 复用 `ImportParserPipeline` / `ImportService`，追加 Source、Messages、Rounds，并更新 Conversation `updatedAt`，不覆盖旧内容。
- ChatGPT Export 接受 `conversations.json` / `conversations-*.json`，不限制 Conversation 数量；超过 30000 Messages 或 2000 万字符只做二次确认，不硬阻断。
- 批量 ChatGPT Import / Append 继续在 IndexedDB flush transaction complete 后才显示 success；失败时重新 preload cache，不展示成功。
- App Data Export 现在包含 IndexedDB 业务 stores；Import App Data 可 restore IndexedDB stores 并 reload 后保持。
- Settings 的 Storage Engine Migration 改为 Legacy Data Migration；无旧 LocalStorage 数据时显示无需迁移；切回 LocalStorage 移入 Advanced / Debug。
- Conversation 创建、列表读取、删除、批量删除和复制改走 storage factory；IndexedDB 模式下等待 flush 后刷新 UI。
- Clear App Data 新增 IndexedDB business data clear path，不静默删除 legacy LocalStorage。

### 修改文件

- `src/infrastructure/storage/storage-factory.ts`
- `src/infrastructure/storage/app-data-storage.ts`
- `src/core/services/import-service.ts`
- `src/app/import/import-workbench.tsx`
- `src/app/import/chatgpt-export-import.tsx`
- `src/app/settings/data-management.tsx`
- `src/app/conversation/conversation-list.tsx`
- `src/app/conversation/create-conversation-dialog.tsx`
- `tests/indexeddb-reliability.test.ts`
- `tests/chatgpt-export-import.test.ts`
- `PROJECT.md`
- `ARCHITECTURE.md`
- `HANDOFF.md`

### 验证

```
npm run lint ✅
npm run build ✅
npm test -- --run ✅
git diff --check ✅
```

### 已知限制与人工 QA

- 全仓仍有部分历史页面直接实例化 `Browser*Storage`，本轮修复了默认存储、Import、App Data、Conversation list/create/delete 等关键路径；Knowledge/Search/Conversation detail 等旧页面后续应按页面逐步迁到 factory，避免大规模重构。
- App Data Import 会 restore bundle 中的 IndexedDB 业务 stores；LocalStorage legacy data 不会被自动清理，避免破坏迁移来源。
- 需要浏览器手动 QA：首次打开 IndexedDB preload、Import 100+ Conversations、Existing + Text 追加、Export → Clear → Import → Reload、Conversation delete → Reload。

### 是否建议 commit

建议 commit，但本轮按要求未创建 commit。

---

# v1.1 Alpha — Long Conversation UX & Import Stabilization Handoff

## 2026-07-06 Epic C-J checkpoint (FINAL)

Epic C–J 全部实现；每个 Epic 的 lint/build/diff-check checkpoint 均通过。未创建 commit，未删除旧数据，未做数据库迁移。

---

## Epic C: Message Timeline 三态

**目标**：避免长对话直接把用户丢进巨大 Raw Message Timeline。

**实现**：
- Message Timeline 替换了二态的 `isMessageDataVisible` boolean 为三态 `messageTimelineMode: "collapsed" | "preview" | "full"`
- Collapsed（默认）：显示「Message Timeline 已折叠。Round 是默认阅读与操作入口。点击 Preview 查看前 5 条，或 Full 查看全部。」
- Preview：显示前 `PREVIEW_MESSAGE_COUNT=5` 条 Message（只读，无复选框/Edit），底部显示剩余数量与「展开全部 N 条」按钮
- Full：完整 Timeline，保留搜索、全选/清空、Expand/Collapse、Edit、Analyze 全部功能
- 三态通过 Collapsed / Preview / Full 三按钮切换，当前模式显示文案标签
- Restore Snapshot 后重置为 collapsed
- 与 Epic B Round Navigator 不冲突

**修改文件**：`src/app/conversation/[id]/conversation-detail.tsx`

---

## Epic D: Round Inspector

**目标**：让用户在当前 Round 旁边直接管理核心内容。

**实现**：
- 在 Classic Mode 的 RoundWorkspace 中新增 Round Inspector 面板
- 点击 Round 的「Inspect」按钮（选中后显示「✓ Inspecting」）打开右侧 Inspector
- Inspector 显示：
  - Round Note（可编辑，直接保存）
  - Round Summary（可编辑，直接保存）
  - Proposal / AI 整理建议（列出关联 Proposal 链接）
  - Knowledge / 已确认知识（列出关联 Knowledge 链接）
  - Assets（列出关联 Assets，可新增）
  - Analyze 当前 Round 按钮
  - 从当前 Round 创建 Knowledge 按钮
- 上一 Round / 下一 Round 快捷导航按钮（显示当前位置 X / N）
- 关闭按钮可收起 Inspector
- 布局：选中 Round 时列表与 Inspector 并排（`lg:grid-cols-[1fr_340px]`）
- 不实现复杂三栏最终版；只在现有页面内可用

**新增依赖**：RoundWorkspace 新增导入 `BrowserProposalStorage`、`BrowserAssetStorage`、`AssetService`、`RoundKnowledgeService`、相关类型

**修改文件**：`src/app/conversation/[id]/round-workspace.tsx`

---

## Epic E: Import 2.0

**目标**：让导入入口更直观，降低手动导入痛苦。

**实现**：
- 入口菜单文案更新：
  - 「粘贴并导入对话」— 支持六种角色别名
  - 「导入 TXT 文件」— 从本地纯文本文件导入
  - 「📦 导入 ChatGPT Export」— 绿色边框突出显示
- ChatGPT Export 入口在非选中态有 `border-emerald-300 bg-emerald-50` 视觉突出
- Manual Round Builder 按钮改为琥珀色醒目的「✋ 手动整理轮次（Manual Round Builder）」
- Parser Profile 配置区增加明确的 role alias 文档列表：
  - User / Assistant
  - 用户 / AI
  - 我 / GPT
  - 问 / 答
- Import 页面描述更新为「粘贴对话、导入 ChatGPT Export 或手动整理轮次；预览后再确认写入本地」
- Shared link / 浏览器插件入口文本保留为未来预留说明
- 不改变现有 import pipeline 行为

**修改文件**：`src/app/import/import-workbench.tsx`、`src/app/import/page.tsx`

---

## Epic F: Search UX

**目标**：搜索结果更像「找内容」，而不是杂乱实体列表。

**实现**：
- 默认结果分组顺序：Conversation → Knowledge → Round → Proposal → Asset → Task
- Raw Message 默认隐藏，仅在勾选「高级模式：包含 Raw Message」后出现
- Round 结果新增「跳转到对应 Round →」深链（使用 `entityId` 和 `metadata.conversationId`）
- Knowledge 结果保留「查看来源 Round →」深链
- 搜索 placeholder 更新为「搜索 Conversation、已确认知识、Round、AI 整理建议…」
- 保留现有 fuzzy 行为，不引入新搜索库，不实现语义搜索

**修改文件**：`src/app/search/search-experience.tsx`

---

## Epic G: Error / Log / Feedback

**目标**：用户遇到卡住时知道发生了什么，并能记录反馈。

**实现**：
- **Feedback**：
  - Feedback Entity 增加可选 `page` 字段（向后兼容）
  - BrowserFeedbackStorage.save() 接受可选 `page`
  - Feedback 页面新增快速记录表单（分类、自动捕获页面 URL、内容、提交）
  - Conversation Detail 增加「记录反馈」链接，跳转 `/feedback?page=/conversation/{id}`
  - Feedback 列表每项显示 `来源：页面路径`
- **Data Health**：
  - 新增 `duplicate import risk` 检查：共享 `externalConversationId` 的多条 Conversation
  - 新增 `orphan round` 检查：所属 Conversation 已删除的 Round
  - 优化现有检查的描述文案（更具体的信息）
- **Analyze 状态**：已有 providerName、startedAt、status（running/failed/timeout）、latencyMs 显示，以及 Retry/Switch to Demo/Increase Timeout 操作按钮

**修改文件**：`src/core/entities/feedback.ts`、`src/infrastructure/storage/browser-feedback-storage.ts`、`src/app/feedback/feedback-list.tsx`、`src/app/conversation/[id]/conversation-detail.tsx`、`src/app/data-health/data-health-report.tsx`

---

## Epic H: Docs & QA

**目标**：同步 v1.1 文档和手工验收。

**实现**：
- **Help**：新增 v1.1 新功能区域（Conversation Navigator、Message Timeline 三态、Round Inspector、Import 2.0、Search UX、Error/Feedback）；新增 7 个核心概念条目
- **CHANGELOG**：新增 v1.1 Alpha 条目，记录全部 Epic C-J 变更
- **QA_CHECKLIST**：新增 18 条 V11-01 至 V11-18 手动验收项
- **Release Draft**：新增 `docs/releases/v1.1-draft.md`，包含 What's New、Known Limitations、Architecture Impact、Manual QA Steps、Release Blocker
- **HANDOFF**：本文件完整记录 Epic C-J 实现

**修改文件**：`CHANGELOG.md`、`docs/QA_CHECKLIST.md`、`src/app/help/page.tsx`、`HANDOFF.md`
**新增文件**：`docs/releases/v1.1-draft.md`

---

## Epic I: Conversation Workspace

**目标**：实现更接近第二大脑的工作台布局，但不推翻现有架构。

**实现**：
- Workspace Mode 保留为独立模式（Classic / Workspace Mode 切换按钮）
- Workspace Mode 布局：
  - 左侧：RoundNavigator（由 conversation-detail.tsx 的 `<div className="flex gap-6">` 提供）
  - 中间：Round 列表 或 选中 Round 的完整内容（Question + Answer + Summary + Note）
  - 右侧：Round Inspector 面板
- 中间区域支持两种视图：
  - Round 列表视图：搜索/排序 + 所有 Round 卡片，点击进入聚焦视图
  - Round 聚焦视图：显示完整 Q/A/Summary/Note，上一/下一 Round 导航，「← 返回列表」按钮
- 右侧 Inspector 包含：Note 编辑、Summary 编辑、Linked Proposal/Knowledge/Assets、Analyze、Create Knowledge、Update Knowledge Draft
- 与 Epic B/C/D 复用组件，不另造重复组件
- 不做拖拽，不做复杂图谱

**修改文件**：`src/app/conversation/[id]/conversation-workspace-mode.tsx`

---

## Epic J: Daily Sync

**目标**：让重复导入 ChatGPT Export 更适合日常使用。

**实现**：
- 导入完成后显示 📋 Import Report 卡片，四列数据：
  - New · 新增（appended Messages 数量）
  - Skipped · 跳过（去重跳过的重复 Message）
  - Unsupported（附件/图片/tool call 等不支持的内容）
  - Rounds（创建的 Round 数量）
- Report 卡片下方显示：
  - 「Existing Conversation」确认未创建重复副本
  - 「Append only」或「New Conversation」模式指示
- Append only 时显示 ⚠️ 手动操作提醒卡片：
  - 「增量导入仅 append 新 Message。如需更新 Round 结构，请在 Conversation 页面手动 Regenerate Rounds。」
  - 「打开 Conversation →」按钮直接跳转
- 现有机制保留：preview 中 existing/new/skipped 计数，confirm 前 append only 提示，大型对话阈值警告

**修改文件**：`src/app/import/chatgpt-export-import.tsx`

---

## 最终质量检查

```
npm run lint    ✅ 通过
npm run build   ✅ 通过（19 个路由）
git diff --check ✅ 通过（无空白错误）
```

---

## 修改文件清单（14 个修改 + 1 个新增）

| 文件 | Epic | 变更类型 |
|------|------|----------|
| `src/app/conversation/[id]/conversation-detail.tsx` | C, G | Message Timeline 三态 + 记录反馈链接 |
| `src/app/conversation/[id]/round-workspace.tsx` | D | Round Inspector 面板 |
| `src/app/import/import-workbench.tsx` | E | Import 2.0 入口文案与 role alias |
| `src/app/import/page.tsx` | E | 页面描述更新 |
| `src/app/import/chatgpt-export-import.tsx` | J | Import Report 卡片 |
| `src/app/search/search-experience.tsx` | F | Round 深链 + 搜索优化 |
| `src/core/entities/feedback.ts` | G | Feedback.page 可选字段 |
| `src/infrastructure/storage/browser-feedback-storage.ts` | G | save() 支持 page |
| `src/app/feedback/feedback-list.tsx` | G | 快速反馈表单 + page 显示 |
| `src/app/data-health/data-health-report.tsx` | G | duplicate import risk + orphan round |
| `src/app/conversation/[id]/conversation-workspace-mode.tsx` | I | 三栏 Workspace 布局 |
| `src/app/help/page.tsx` | H | v1.1 功能文档 |
| `CHANGELOG.md` | H | v1.1 条目 |
| `docs/QA_CHECKLIST.md` | H | v1.1 手动验收 |
| `docs/releases/v1.1-draft.md` | H | **新增** — v1.1 Release Draft |

---

## Release Blocker

- 人工 QA 未执行（18 条 V11-01 至 V11-18 待验收）
- 未创建 commit
- 浏览器手动回归测试未执行

---

## Manual QA Steps

按 `docs/QA_CHECKLIST.md` V11-01–V11-18 执行：

1. Message Timeline 三态切换（V11-01–V11-04）
2. Round Inspector 编辑/导航/创建（V11-05–V11-08）
3. Import 2.0 入口与文案（V11-09–V11-11）
4. Search Round 深链 + Raw Message 隐藏（V11-12–V11-13）
5. Feedback 一键记录 + page 捕获（V11-14–V11-15）
6. Data Health 新检查项（V11-16）
7. Help 页面完整性（V11-17）
8. 旧功能回归（V11-18）

---

## 是否建议 commit

✅ 建议 commit。所有 Epic C-J 通过自动门禁，无 breaking change。

建议 commit message：

```
feat: v1.1 alpha — Long Conversation UX & Import Stabilization

Epic C: Message Timeline 三态 (Collapsed/Preview/Full)
Epic D: Round Inspector with Note/Summary editing & navigation
Epic E: Import 2.0 — clearer entry points, role alias docs
Epic F: Search UX — Round deep-link, priority ordering
Epic G: Error/Feedback — page-capture feedback, data health checks
Epic H: Docs & QA — v1.1 release draft, help, changelog, QA checklist
Epic I: Conversation Workspace — three-column layout with RoundNavigator
Epic J: Daily Sync — import report card with new/skipped/unsupported/rounds

No breaking changes. All existing data models preserved.
Lint, build, and diff-check pass.
```

---

## 已知限制

- Message Timeline 三态仅在 Conversation Detail 页面；Preview 模式不提供搜索/编辑/选择
- Round Inspector 仅在 Classic Mode 的 Round Workspace；Workspace Mode 有自己的 Inspect 面板
- Import 2.0 不实现 shared link 抓取或浏览器插件
- Search 不实现语义搜索、Embedding 或 RAG
- Feedback 不上传任何数据，仅保存在浏览器 LocalStorage
- Data Health 为只读报告，不会自动修复问题
- 不做数据库迁移，不删除旧数据


- AB App Data Export/Import、Entity Export、ChatGPT `conversations.json` 最小导入与增量/去重已实现。
- App Data 导入支持 key/entity count Preview、按领域选择、二次确认与写入失败回滚；备份脚本保留。
- Conversation 支持 Markdown/JSON，Round/Knowledge 支持 Markdown，Workspace/Folder 支持 JSON bundle。
- ChatGPT 首次导入沿 current-node 主分支线性化 User/Assistant 文本，并经现有 Parser/ImportService 创建 Conversation/Messages/Rounds。
- 重复导入复用 `externalConversationId`，Message 优先按 `externalMessageId`、缺失时按 `contentHash` 去重；只 append 新 Message，不覆盖旧 Rounds。
- unsupported 附件、图片、tool call、canvas、voice/shared link 被跳过或不处理，不阻断文本导入。
- AB checkpoint：`npm run lint`、`npm run build`、`git diff --check` 全部通过。
- 修复记录：BrowserConversationStorage 显式收窄 `externalSource`；BrowserMessageStorage `getAll(): Message[]` 保持 external 字段 optional。
- Git：未创建 commit、未 push；旧数据未删除。

## 2026-07-06 Epic AC checkpoint

- 新增 `docs/reviews/Release-v1.0-alpha-Review.md` 与 `docs/qa/V10-MANUAL-QA-PLAN.md`，更新 v1.0 alpha release notes。
- README、PROJECT、ARCHITECTURE、ROADMAP、CHANGELOG、HANDOFF、QA_CHECKLIST 与 Help 已统一 Phase2 产品语言和 ChatGPT Import 边界。
- Release Review 判断：达到 alpha candidate，但人工 QA 未执行，暂不标记正式 release-ready。
- AC checkpoint：`npm run lint`、`npm run build`、`git diff --check` 全部通过。
- 未创建 commit；未删除旧数据；未加入 API key。

## 2026-07-06 Epic AD final stabilization

- Final gates：`npm run lint`、`npm run build`、`git diff --check` 全部通过；production build 生成 19 个路由。
- Browser smoke：Dashboard、Import、Conversation、Search、Knowledge、Settings、Workspace、Recipes、Feedback、Data Health、Help 均加载预期 H1，console 无 error。
- Compatibility audit：Round Entity/Storage/Service 存在；BrowserStorage 对新增 optional 字段执行安全归一化；ChatGPT 增量路径不调用 remove/clear/replace。
- Analyzer failure UX：显示失败原因、Retry、Switch to Demo、Increase Timeout，并明确不写 Proposal/Knowledge。
- Security audit：App/Core 无直接 LocalStorage；未发现真实 OpenAI/Claude API key；云 Provider 仍 disabled。
- ChatGPT Import audit：Preview 显示 title/message/create/update 与 existing/new/skipped；首次导入生成 Rounds，重复导入 append-only 并提示手动 regenerate。
- Manual blocker：当前 in-app 浏览器测试 profile 中没有旧 Conversation/Round 数据，因此旧数据真实浏览器回归与完整 ChatGPT/App Data fixture QA 尚未执行。详见 `docs/qa/V10-MANUAL-QA-PLAN.md`。
- Release decision：建议作为 v1.0 alpha candidate 进入人工 QA；通过 P0 前不标记正式 release-ready。
- Git：未创建 commit、未 push。

---

# Previous Handoff — v1.0 Phase1 Conversation / Round

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

## Historical Phase1 follow-up list（superseded; not current TODO）

以下是旧 Phase1 checkpoint 的历史记录；其中已完成项以本文件顶部 v1.6.4 matrix 和当前 ROADMAP 为准，不应作为当前待办继续执行。

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
