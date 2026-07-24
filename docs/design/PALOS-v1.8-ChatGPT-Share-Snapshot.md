# PALOS v1.8 — ChatGPT Share Snapshot Import Design

## 文档状态

- 状态：Design Proposal，仅设计，不授权实现
- 日期：2026-07-25
- 基线：PALOS v1.7 release，分支 `feat/v1.8-share-snapshot`
- 目标：不等待完整 ChatGPT Data Export，也能把用户主动提供的分享内容保存为本地 Conversation Snapshot，并在后续捕获中只把安全确认的增量写入 PALOS
- 非目标：接入 OpenAI API、读取 ChatGPT 账号、模拟登录、自动抓取分享页、绕过 workspace 权限、自动生成 Knowledge

## 1. 结论摘要

当前 Conversation / Message / Round / Source / Import / Knowledge 的领域边界总体适合 v1.8，不需要改变 Conversation Aggregate Root，也不需要把 Snapshot、Knowledge 或远端账号做成 Conversation 的子类型。

但现有运行时只能可靠处理 ChatGPT Export 的“按外部 Message ID 追加”场景，还不能完整表达可审计的分享快照：

- `ImportedSource` 可以承载一次分享内容捕获，但当前只有 `kind: "text"`，缺少快照 hash、前序快照、解析器版本和消息 manifest。
- `Conversation.externalSource / externalConversationId` 面向 Export，对“分享链接 identity”和“原始 ChatGPT Conversation identity”没有明确区分。
- `Message.externalMessageId / contentHash` 适合 Export 去重，但分享页手动文本通常没有稳定 Message ID；现有 FNV hash 也不适合作为快照完整性标识。
- 当前更新逻辑只追加“未见过的 ID”，不能识别同 ID 内容变化、远端截短、重排或中间插入。
- `ConversationVersion` 是 PALOS 本地恢复点，只包含 Conversation + Messages，不包含 Source / Round，不应复用为远端分享快照历史。
- Knowledge 的独立生命周期和人工确认边界是合适的；任何分享快照更新都不得自动改写 Knowledge。

v1.8 MVP 建议：

1. 分享 URL 仅用于用户主动打开、来源标识和匹配；PALOS 不请求该 URL。
2. 用户在浏览器中打开分享页，手动复制可见文本并粘贴到 PALOS。
3. PALOS 使用纯函数、版本化 `ChatGPT Share Snapshot Parser` 生成候选快照。
4. 每次已确认的不同内容保存为一条不可变 Snapshot Source；不新增 IndexedDB store。
5. 先比较完整 transcript hash，再做有序 Message diff。
6. 只有“旧消息序列是新消息序列的精确前缀”时才自动形成 append plan；其它变化进入 conflict preview，不写现有 Conversation。
7. Conversation / Round 的本地备注、Context、Summary、Task、Proposal、Knowledge 都属于 local enrichment，不受快照更新覆盖。

这里的“增量更新”是本地持久化和领域写入增量，不是网络传输增量。没有官方 delta API 时，即使未来允许 URL fetch，也只能先重新取得完整公开快照，最多利用标准 HTTP conditional request 避免未变化内容重复传输。

## 2. 官方产品与合规事实

以下事实以 2026-07-25 的 OpenAI 官方资料为准：

- 普通 ChatGPT 分享链接是“持链接可见”的内容：任何获得链接的人都可以查看，且链接可能被继续转发。
- 普通分享链接保存的是创建或更新分享时的 Conversation Snapshot；原 Conversation 后续新增内容不会自然出现在旧 Snapshot 中，分享者需要主动更新链接。
- 分享链接可以被删除或因原 Conversation / 账号删除而失效；失效不应让 PALOS 静默删除此前由用户确认保存的本地副本。
- 分享页可能只包含单条 Assistant Response，也可能包含截至分享时的完整历史，不能假定一定是完整 Conversation。
- Enterprise / Edu 分享链接可能只允许同一 workspace 成员访问；PALOS 不能把用户浏览器已经登录视为自身获得了访问授权。
- OpenAI 当前 Terms of Use 明确限制自动或程序化提取数据或 Output，并禁止绕过 rate limit、访问限制或保护措施。

官方参考：

- [ChatGPT Shared Links FAQ](https://help.openai.com/en/articles/7925741-chatgpt-shared-links-faq)
- [How to Update a Shared Link](https://help.openai.com/en/articles/7943614)
- [ChatGPT Shared Links FAQ — Enterprise](https://help.openai.com/en/articles/8474715)
- [OpenAI Terms of Use](https://openai.com/policies/terms-of-use/)

因此，当前设计不能把“公开可访问”直接等同于“允许第三方程序抓取”。在没有官方外部导入 API、明确书面许可或专项法律/合规结论前，自动 URL fetch、DOM scraping、内部接口调用和定时 polling 都不进入 v1.8 MVP。

本节是产品与工程风险边界，不构成法律意见。正式分发抓取能力前仍需由产品所有者完成适用于目标用户、地区和部署方式的条款/隐私评审。

## 3. 现有架构适配性审查

| 现有部分 | 适配性 | 可复用内容 | 当前缺口 | v1.8 决策 |
| --- | --- | --- | --- | --- |
| Import Parser / Preview / Confirm | 高 | pure、versioned parser；preview 后显式确认才写入 | 当前没有 Share Snapshot 语义和更新 diff | 增加专用纯 Parser 与 Comparator，不让 Parser 写 Storage |
| Conversation | 高 | 一个逻辑 ChatGPT thread 映射一个 PALOS Conversation | Export identity 与 share-link identity 混在同一组 optional 字段 | 保留 Aggregate Root；新增兼容 optional `shareOrigin` |
| ImportedSource | 中高 | 已能保存多个属于同一 Conversation 的 Source，随 Conversation 删除 | 类型过窄；Contract 只能直接取得“最近一条”，无法明确列出快照历史 | MVP 把 Snapshot 建模为带 metadata 的 Source；扩展按 Conversation 列表读取 |
| Message | 中 | 已有 `externalMessageId`、`contentHash`、稳定 PALOS ID | 手动分享文本通常无外部 ID；无 first-seen Snapshot；现有 hash 语义过松 | 保留旧字段；新增 optional origin metadata 和 SHA-256 hash 版本 |
| Round | 中高 | 是正确的本地整理单元；已有稳定 ID 和 local record | 仅对新增 Messages 重新分 Round 会把“后补 Assistant 回答”误建为 orphan Round | Delta Projector 必须按完整边界决定“扩展最后一轮”或“新建后续轮次” |
| ConversationVersion | 低（不适合作为 Share Snapshot） | 适合本地手工/自动恢复点和 Context Timeline | Snapshot 只含 Conversation + Messages；不含 Source / Round；restore 语义是本地恢复 | 不复用、不增加 `kind=share`；Share Snapshot 历史归 Source |
| Proposal / Knowledge | 高 | 来源快照、人工 Review、Knowledge 独立生命周期 | 可选 provenance 尚不能指向具体 Share Snapshot | MVP 不自动更新；后续可给 provenance 增加 optional Snapshot Source ID |
| IndexedDB canonical stores | 中高 | 已有 7 stores、批量 replace/verify 基础、旧数据 optional 字段兼容 | 普通 Adapter 写入是异步 fan-out；没有 Snapshot Update 的单一原子 use case | MVP 不新增 store；更新使用 staged plan + 同事务/可恢复批量写 + reload verification |
| Search | 中 | 可从 Conversation、Message、Round、Source 构建投影 | 当前 Source 选择逻辑没有显式 latest snapshot 规则，历史快照会造成重复搜索 | 默认索引 canonical Message/Round 与最新 Snapshot；历史 Snapshot 仅高级查看 |

### 3.1 ImportReceipt 现状

RFC-006 已设计 `ImportReceipt`，但当前运行时没有对应 Entity / Contract / Store。v1.8 不应把尚未实现的 Receipt 当作既有能力。

MVP 的最小审计记录由 Snapshot Source metadata 提供。只有当一个捕获动作需要跨多个 Conversation、需要独立保留失败/取消记录，或 Receipt 有明确查询生命周期时，再单独实施 RFC-006 的 ImportReceipt；不能为了命名完整而新增一个没有用例的 Aggregate。

### 3.2 为什么不复用 ConversationVersion

`ConversationVersion` 表示“PALOS 当前 Conversation 的本地恢复点”，Share Snapshot 表示“某时刻对外部分享内容的一次观察”。两者 authority 不同：

```text
ConversationVersion
  PALOS local state → local restore

Share Snapshot Source
  user-provided external observation → provenance / compare / append
```

把两者合并会导致三个问题：

1. 用户可能误以为恢复 Version 等于恢复远端 ChatGPT。
2. 当前 Version 不保存 Round / Source，无法成为完整的导入回滚依据。
3. Local Context、Note 与远端原文会进入同一版本语义，破坏来源与 enrichment 边界。

## 4. 领域语言与 authority 分层

### 4.1 四个明确概念

1. **Original ChatGPT Conversation**
   - 只存在于 ChatGPT。
   - PALOS 不拥有、不读取账号，不保证能识别其真实 Conversation ID。
   - Share URL 不是 PALOS 对原 Conversation 的读写授权，也不是实时同步 API。

2. **ChatGPT Share Resource**
   - 由 `https://chatgpt.com/share/...` 定位的持链接可见资源。
   - 可能是完整历史快照，也可能只是一条 Response。
   - URL identity 只标识这条分享资源，不自动等于原 ChatGPT Conversation identity。

3. **Imported Conversation Snapshot**
   - 用户在某一时刻主动提供给 PALOS 的可见内容。
   - 是不可变的本地来源记录，包含 capture time、parser version、hash、manifest、unsupported diagnostics 和前序 Snapshot 引用。
   - Snapshot 可投影为 canonical Message / Round，但 Snapshot 自身不会被本地编辑覆盖。

4. **Local Enrichment**
   - PALOS 中用户维护的标题、Conversation Note / Summary / Conclusion / Context、Round Record / Context、Task、Proposal、Knowledge 和 Tags。
   - 来源更新不能自动覆盖、删除或重新生成这些内容。
   - Knowledge 仍然只通过人工 Review / Apply 或现有人工确认路径创建和更新。

### 4.2 Authority 图

```text
Original ChatGPT Conversation
          │ user creates/updates share
          ▼
ChatGPT Share Resource
          │ user opens and manually copies visible text
          ▼
Imported Snapshot Source (immutable)
          │ confirmed projection / safe append only
          ▼
PALOS Conversation → Message → Round
          │ user-controlled enrichment
          ├─ Conversation Context / Note / Summary
          ├─ Round Record / Context
          ├─ Task
          ├─ Proposal → Review → Knowledge
          └─ Search / Export
```

PALOS 只保存“用户提供的观察结果”，不声称保存了 ChatGPT 的原始后端记录，也不声称与远端保持实时同步。

## 5. 分享快照数据模型

### 5.1 Conversation：分享来源 identity

不复用 `externalConversationId` 保存 share token。该字段继续表示能够从正式 Export 证明的外部 Conversation ID。

建议增加兼容 optional 字段：

```ts
type ConversationShareOrigin = {
  kind: "chatgpt-share";
  schemaVersion: 1;
  shareUrlHash: string;            // normalized URL 的 SHA-256，用于匹配
  maskedUrl: string;               // 只用于 UI，例如 …/••••a1b2
  retainedCanonicalUrl?: string;   // 用户显式选择后才保存在当前浏览器
  captureMode: "manual-paste";
  latestSnapshotSourceId?: string;
  firstImportedAt: string;
  lastImportedAt: string;
};

type Conversation = {
  // existing fields...
  shareOrigin?: ConversationShareOrigin;
};
```

规则：

- 旧 Conversation 缺少 `shareOrigin` 时按普通 Conversation 读取，不回写。
- 同一 `shareUrlHash` 默认只能归属一个 active PALOS Conversation；重复输入时进入 Update Preview，而不是新建 Copy。
- `retainedCanonicalUrl` 必须显式 opt-in。未保存 URL 时，用户下次重新粘贴同一 URL，仍可通过 hash 匹配。
- 完整 URL、share token 不进入 diagnostics、console、Analyzer prompt 或普通搜索索引。
- App Data Export 如果包含 retained URL，必须在导出确认中说明；后续可以提供 redact 选项。

### 5.2 ConversationSnapshot：复用 Source store 的不可变判别类型

MVP 不增加第 8 个 canonical store。产品层的 `ConversationSnapshot` 是一类带 metadata 的 `ImportedSource`：

```ts
type ShareSnapshotMetadata = {
  kind: "chatgpt-share-snapshot";
  schemaVersion: 1;
  shareUrlHash: string;
  captureMode: "manual-paste";
  capturedAt: string;
  transcriptHash: string;          // SHA-256 canonical transcript
  metadataHash?: string;           // source title 等非正文 metadata
  hashAlgorithm: "sha256-v1";
  parserId: "chatgpt-share";
  parserVersion: string;
  previousSnapshotSourceId?: string;
  messageCount: number;
  unsupportedCount: number;
  manifest: ShareSnapshotMessageManifestItem[];
};

type ImportedSource = {
  // existing fields...
  snapshot?: ShareSnapshotMetadata;
};
```

`ImportedSource.content` 保存规范化的纯文本 transcript，不保存整页 HTML、脚本、cookies、隐藏页面状态或内部 API response。

不可变规则：

- Snapshot 一经确认就使用新 Source ID 写入。
- 相同 `transcriptHash + metadataHash` 的再次捕获只报告 no change，不新增 Source。
- 内容变化时创建新 Source，并通过 `previousSnapshotSourceId` 串成时间线。
- Service 不允许用同一 ID 覆盖历史 Snapshot。

为支持历史，需要给 `SourceStorage` 增加 `getById()` 和 `getAllByConversationId()`；现有 `getByConversationId()` 继续返回兼容的 latest Source，但 latest 选择必须由明确时间/链路规则定义，不能依赖数组插入顺序。

### 5.3 Message：canonical 投影与来源

建议保留现有 Export 字段，增加可选来源：

```ts
type ShareMessageOrigin = {
  kind: "chatgpt-share";
  firstSeenSnapshotSourceId: string;
  sourceMessageKey?: string;
  identityConfidence: "external-id" | "ordered-content";
  contentHash: string;
  hashAlgorithm: "sha256-v1";
};

type Message = {
  // existing fields...
  shareOrigin?: ShareMessageOrigin;
};
```

identity 优先级：

1. 只有在用户提供的、允许解析的正式数据中确实存在稳定 Message ID 时，才使用 `external-id`。
2. 手动粘贴文本通常使用 `ordered-content`：`role + exact content hash + occurrence index`。
3. 不用单纯 content hash 做跨 Source 全局去重，因为同一句话在同一对话中可以合法重复。

SHA-256 canonicalization 只统一换行符和传输层首尾空白，不折叠正文中的连续空格，不改变 code block 缩进。现有 FNV hash 继续服务旧 Export 数据，不能冒充 v1.8 Snapshot integrity hash。

### 5.4 Round：不新增 Snapshot 字段

Round 通过 `messageIds` 关联 canonical Messages，Snapshot lineage 由 Message 和 Source 提供。MVP 不在 Round 上再复制 snapshot ID。

更新时：

- 新 User 开始新 Round。
- 新 Assistant 紧跟本地最后一个 unanswered Round 时，扩展该 Round 的 `messageIds` / `answer`，保留其 `note`、`summary`、`context` 和 stable Round ID。
- 完整新问答追加新 Round。
- 任何中间插入、编辑、重排或缩短都不自动改写现有 Round。

### 5.5 Knowledge / Proposal provenance

MVP 保持现有模型：

- Snapshot 更新只写 Source / Message / Round / Conversation metadata。
- 不自动运行 Analyzer，不创建 Proposal，不接受 Proposal，不创建或更新 Knowledge。
- 已有 Knowledge 保留其生成时 evidence snapshot，即使远端分享以后改变或失效。
- 用户主动分析新增 Messages 时，Proposal 可继续引用 canonical Message IDs 和当前 Snapshot Source ID。

后续如果需要显示“这条 Knowledge 来自第几次分享快照”，可以给 Proposal / Knowledge provenance 增加 optional `sourceSnapshotId`，但这不是 MVP 持久化更新的前置条件。

## 6. 捕获、解析与确认架构

```text
User-provided share URL
  → strict URL validation + hash/mask
  → user opens URL in normal browser
  → user manually pastes visible transcript
  → ChatGPTShareSnapshotParser (pure, versioned)
  → SnapshotCandidate + diagnostics
  → ShareSnapshotComparator (pure)
  → no-change | safe-append | conflict | initial
  → Preview
  → explicit Confirm
  → ShareSnapshotImportService
  → staged canonical write + durable verification
```

Parser 不得：

- 访问网络或 BrowserStorage；
- 创建 canonical ID；
- 读取 cookies、账号或浏览器历史；
- 调用 Analyzer；
- 创建 Proposal / Knowledge；
- 静默丢弃 unknown / unsupported content。

### 6.1 Capture Artifact

MVP 输入为：

- `channel = clipboard`
- `producer = ChatGPT`
- `format = provider-transcript`
- optional validated share URL 作为 provenance
- 用户手动粘贴的纯文本

不接受 HTML 文件、HAR、cookies、session token 或从 DevTools 复制的私有 API response。

### 6.2 Preview 必须展示

- 新建 Conversation 或匹配到哪个已有 Conversation；
- 当前 Snapshot 序号、捕获时间、parser ID/version；
- 本地和候选的 Message / Round 数量；
- 新增 Message 数、最后一轮是否被扩展、新增 Round 数；
- unknown / unsupported 数量和有界内容预览；
- 判定结果：initial、no change、safe append 或 conflict；
- 明确说明本次不会改变哪些 local enrichment；
- 保存完整 URL 的隐私选项；
- 确认前零写入。

## 7. 更新机制

### 7.1 是否重新抓取 URL

MVP：**不抓取**。

原因：

- 当前 OpenAI Terms of Use 对自动或程序化提取有明确限制。
- 没有面向第三方的官方 Share Link Import / Delta API。
- 分享页 HTML / client payload 不是稳定公共 contract。
- 浏览器直接 fetch 还受 CORS 影响；服务端 proxy 会让 private conversation content 经过 PALOS 服务器，破坏当前 local-first 隐私预期。

用户可以从 PALOS 点击“在 ChatGPT 打开”，但这是普通导航。用户完成查看、复制和粘贴后，所有解析、hash、diff 和持久化都在 PALOS 本地完成。

未来如果存在官方允许的接口或明确许可，可以增加 `ShareSnapshotCaptureGateway` Adapter。领域模型、Comparator 和 ImportService 不需要随之重写。

### 7.2 hash 比较

hash 分三层：

1. `shareUrlHash`
   - 只用于同一分享资源匹配和 URL 去敏。
2. `transcriptHash`
   - 对有序 `{role, content}` canonical JSON 做 SHA-256。
   - 相同即正文 no change。
3. `message contentHash`
   - 用于有序 diff 和单条 provenance。
   - 不能单独决定跨位置 dedup。

title、分享者显示名等 metadata 使用单独 `metadataHash`。只改标题时不应伪装成 Message 增量。

### 7.3 Message 级 diff

MVP 使用确定性、保守 diff：

```text
old == new
  → no change

old messages are an exact ordered prefix of new messages
  → safe append

new messages are an exact ordered prefix of old messages
  → remote shorter / conflict; no delete

same position has same source key but different content hash
  → edited message / conflict; no overwrite

insert / reorder / role change / ambiguous parser output
  → conflict; no write
```

MVP 不做 LCS 自动合并，不把“最相似”当作“相同”，也不自动创建 tombstone。

safe append 仍需 preview + confirm。确认后只创建：

- 1 条新的 Snapshot Source；
- 新增的 canonical Messages；
- 必要的新 Rounds；
- 或对最后一个 unanswered Round 做一次保留 enrichment 的扩展；
- Conversation 的 `latestSnapshotSourceId / lastImportedAt / updatedAt`。

### 7.4 Conflict 的产品语义

Conflict 不是失败，也不是自动覆盖许可。

UI 展示首个分歧位置、旧/新 bounded excerpt 和可能原因：

- 分享者编辑了早期消息；
- 分享范围从完整 Conversation 变为单条 Response；
- 分享内容被缩短；
- Parser 版本或复制方式变化；
- 文本复制不完整。

MVP 只允许：

- 返回修正粘贴内容；
- 把候选作为新的独立 Conversation 导入；
- 取消。

“用远端替换 imported projection，同时保留所有本地 enrichment”需要完整重映射、provenance 降级和回滚方案，推迟到 v1.8.1。

### 7.5 失败与失效

MVP 不主动检查远端状态，因此 UI 使用“最后捕获于”，不使用“已同步”或“远端最新”。

如果用户自己打开链接发现 404、deleted、workspace restricted：

- PALOS 不删除已有 Snapshot；
- 用户可手工标记来源为 unavailable；
- 删除本地内容仍走 Conversation 既有显式影响确认和 cascade；
- PALOS 不把登录、换账号或复制 cookies 作为错误恢复建议。

## 8. 写入、事务与兼容

### 8.1 Staged Update Plan

`ShareSnapshotImportService` 在任何写入前生成完整 plan：

```text
Snapshot Source to create
Messages to append
Last Round extension, if any
Rounds to create
Conversation metadata update
Expected post-write counts and references
```

确认后：

1. drain pending IndexedDB writes；
2. 捕获相关 stores 的 recovery snapshot；
3. 在同一 canonical write boundary 应用 plan；
4. clear caches + preload；
5. 验证 Conversation / Source / Message / Round count、ownership、order、Round.messageIds 和 latest Snapshot chain；
6. 只有验证成功才显示 success；
7. 失败时恢复 recovery snapshot，并明确报告 rollback 是否验证成功。

不能只依赖现有 fire-and-forget Adapter 完成跨实体更新，也不能用不完整的 `ConversationVersion.restoreSnapshot()` 作为 rollback。

### 8.2 向后兼容

- 旧 v1.7 Conversation / Source / Message 缺少新增字段时继续正常读取。
- 不进行 page-load migration，不回填不存在的 share provenance。
- 现有 ChatGPT Export import 继续使用 `externalConversationId / externalMessageId`；Share Snapshot 不改变其去重语义。
- App Data Export / Restore 继续保存 optional 字段并进行引用验证。
- MVP 不新增 IndexedDB store，不提升 DB schema version。
- Conversation copy 默认复制可见内容和 local enrichment，但不复制 retained Share URL，也不让副本继续占用原 `shareUrlHash`；副本是 detached local copy。
- Conversation delete 继续级联删除其 Snapshot Sources、Messages、Rounds 和 Versions；Knowledge / Task 按现有独立生命周期保留 snapshot provenance。

## 9. Import 页面流程

### 9.1 新入口

在现有三个输入来源旁增加第四个入口：

> ChatGPT 分享快照
>
> 打开用户主动提供的分享链接，手动粘贴可见对话；PALOS 不登录、不抓取网页。

Share Snapshot 的目标由 `shareUrlHash` 决定，不强迫用户先理解 New / Existing：

- 未匹配：显示“将创建新的 Conversation”并选择 Workspace。
- 已匹配：显示“将更新现有 Conversation「…」”。
- 同一 URL 已归属其它 Conversation：阻止静默追加，导航到已关联项。
- 用户要把候选放进任意其它 Conversation 时，使用普通 Paste Text；不污染 share identity。

### 9.2 引导步骤

1. **提供链接**
   - 只接受 `https://chatgpt.com/share/<id>`。
   - 显示“链接是持链接可见信息，请只导入你有权保存的内容”。
   - 复选项：“在当前浏览器保存完整链接，便于以后打开”；默认关闭。

2. **打开并复制**
   - “在 ChatGPT 打开”使用普通新标签页导航。
   - 说明 PALOS 不读取该标签页、不读取登录状态。
   - 用户手动复制当前可见 transcript。

3. **粘贴 Snapshot**
   - 文本框、本地字符数和 Parser version。
   - 保留 code block。
   - unknown 比例过高时阻止确认或要求 Manual Round Builder。

4. **变更预览**
   - Initial：将创建多少 Messages / Rounds。
   - No change：不显示确认写入。
   - Safe append：新增多少 Messages；扩展最后一轮还是创建新轮次。
   - Conflict：显示分歧，不提供覆盖按钮。

5. **确认**
   - 按钮文案明确为“确认保存 Snapshot”或“确认追加 N 条 Message”。
   - 文案列出 local enrichment 不会变化。

6. **结果**
   - Snapshot 序号和时间；
   - appended / skipped / unsupported；
   - durable verification；
   - 打开 Conversation；
   - 可选“分析新增 Messages”，但不自动触发。

### 9.3 Conversation Detail 补充

在来源区域增加：

- `ChatGPT 分享快照` badge；
- “最后捕获于”，不写“同步于”；
- Snapshot timeline：时间、Message 数、delta、parser version；
- “更新 Snapshot”返回 Import 引导；
- masked URL，以及 retained URL 存在时的“打开链接”；
- 原文 / 本地整理的视觉分区。

Snapshot history 默认折叠，Search 默认不重复索引每个历史 transcript。

## 10. 权限、安全和隐私边界

### 10.1 MVP 允许

- 用户主动粘贴严格格式的 ChatGPT share URL；
- PALOS 校验、mask 和本地 hash URL；
- 用户主动在普通浏览器标签页打开链接；
- 用户手动复制并粘贴可见文本；
- PALOS 在本地解析、比较和保存；
- 用户明确确认每次初始导入或增量更新。

### 10.2 MVP 不允许

- PALOS 自动请求或定时重新请求分享 URL；
- headless browser、Playwright 或 WebView 模拟登录；
- 读取或转发 ChatGPT cookies、session、authorization header；
- 调用未公开的 ChatGPT internal API、GraphQL/RSC endpoint；
- 绕过 401 / 403、workspace gate、CAPTCHA、rate limit、robots 或其它保护；
- 接受任意 URL、跟随到非 allowlist host、批量 crawl；
- 把 Enterprise workspace link 当作 public link；
- 把分享内容发送到 PALOS server、Analyzer 或云 Provider；
- 日志记录完整 URL、share token、正文或未脱敏错误 response；
- 因远端变化或失效自动删除本地 Snapshot / Knowledge。

### 10.3 用户责任提示

导入确认前提示：

- 只保存你有权处理的内容；
- 分享链接可能包含他人个人信息、机密或受版权保护内容；
- “任何持有链接的人都能访问”不等于内容可任意再分发；
- PALOS Snapshot 是独立本地副本，远端撤销不会自动清除本地副本；
- 用户可通过 Conversation 删除流程清除本地 raw snapshot；Knowledge / Task 的独立保留影响继续单独说明。

## 11. v1.8 MVP 范围

### 11.1 In scope

- Share URL strict validation、mask、hash 和 optional local retention；
- 普通浏览器打开链接；
- 手动纯文本 Snapshot capture；
- 专用 pure/versioned parser、diagnostics、preview；
- Snapshot Source optional metadata，不新增 store；
- initial / no-change / exact-prefix safe-append / conflict 四态 comparator；
- SHA-256 transcript/message hash；
- safe append 的 Message / Round 投影，包括最后 unanswered Round extension；
- Snapshot timeline 和 Conversation 来源 badge；
- local enrichment 不覆盖、不自动 Analyzer / Knowledge；
- staged write、rollback、reload verification；
- v1.7 数据和 ChatGPT Export 路径兼容；
- 单元测试、IndexedDB reliability test、浏览器人工 QA 和必要文档。

### 11.2 Out of scope

- 自动 URL fetch / re-fetch、conditional GET、定时 polling；
- ChatGPT 登录、OAuth、cookies、browser session；
- Enterprise / Edu workspace-gated link；
- HTML / DOM / internal payload parser；
- attachments、images、voice、canvas、tool calls；
- 中间编辑、删除、重排的自动 reconciliation；
- 多设备 sync、server storage、cloud crawler；
- AI 自动摘要、自动 Proposal、自动 Knowledge；
- 新 canonical store 或数据库迁移；
- 证明分享者身份、Conversation 所有权或原始 Conversation 完整性。

### 11.3 MVP 验收标准

1. 旧 v1.7 数据无需迁移即可读取。
2. 首次手动 Snapshot 导入创建 1 Conversation、1 Snapshot Source、正确 Messages / Rounds。
3. 相同 URL + 相同 transcript 得到 no change，零 canonical 写入。
4. 相同 URL + exact appended suffix 只写新增 Messages / Rounds 和 1 个新 Snapshot Source。
5. Assistant-only suffix 正确扩展最后 unanswered Round，不创建错误 orphan Round。
6. 中间编辑、缩短、重排或 parser ambiguity 进入 conflict，现有 Conversation 零改动。
7. Conversation / Round local enrichment、Task、Proposal、Knowledge 数量和内容在更新前后不变。
8. 完整 URL 和 transcript 不出现在 diagnostics / console。
9. IndexedDB 写入后 reload 验证 Snapshot chain、counts、ownership 和 references。
10. `npm run lint`、`npm run build`、全量 Vitest、相关 E2E 和 `git diff --check` 通过。

## 12. 后续版本规划

### v1.8.1 — Snapshot History and Conflict Resolution

- Snapshot 详情和 bounded diff viewer；
- 明确的“导入为新 Conversation”与 detached copy；
- 经人工确认的 replace/rebase plan；
- 保留 Round local enrichment 的稳定映射；
- remote-shorter / edited / removed message 状态；
- Proposal / Knowledge optional `sourceSnapshotId` provenance；
- retained URL 的 App Data Export redact / include 选择；
- Snapshot retention / delete impact preview。

### v1.9 — Official Capture Adapter（有前置门槛）

只有满足以下至少一个前置条件才开始：

- OpenAI 提供并记录了允许外部读取 Share Snapshot 的官方 API / export mechanism；
- 获得适用于 PALOS 的明确许可；
- 产品所有者完成书面法律、隐私和部署评审并批准具体实现。

在获得批准后：

- `ShareSnapshotCaptureGateway` 通过 documented endpoint 获取数据；
- 不使用用户 ChatGPT cookies；
- strict host allowlist、redirect revalidation、size/time/rate limits；
- 若官方接口支持 ETag / Last-Modified，则使用 conditional request；
- 仍复用 v1.8 Parser/Comparator/Preview/Confirm；
- 默认手动刷新，不直接开启 schedule。

### v2.x Candidate — Multi-source Snapshot

- Claude / Gemini 等明确允许的 shared artifact；
- provider-specific parser capability matrix；
- attachments metadata 与 unsupported preservation；
- 用户显式 opt-in 的 scheduled check；
- 跨设备同步必须另行设计密钥、权限、隐私和删除语义。

## 13. 实施前需要产品负责人确认

1. 接受 v1.8 MVP 为“手动捕获 + 本地增量”，而不是自动 URL 抓取。
2. 是否默认不保存完整 share URL，仅保存 hash；本设计建议默认不保存。
3. conflict MVP 是否只提供“修正 / 独立导入 / 取消”；本设计建议不提供覆盖。
4. Snapshot 历史是否默认全部保留；本设计建议保留所有已确认的不同 Snapshot。
5. 是否把 URL-fetch capability 设为明确的 compliance gate；本设计建议是。

以上五项确认后，才进入实现拆分与验收计划。
