# Architecture Risk Review v0.9

## Review 摘要

v0.9 架构在当前“单人、单浏览器、单设备、小数据量”边界内保持清晰：Core 与 BrowserStorage 隔离、Search 是只读投影、Asset 只保存 metadata、Provider 必经 Proposal 与人工 Review。最大风险不是某个类的组织方式，而是用户数据已逐步承担长期价值，底层仍依赖无事务、无完整导出恢复的 LocalStorage。

风险判断：**当前架构可以支撑 v0.9，但不应在没有 Export / Import、规模测量和迁移计划的情况下继续叠加高价值数据或真实云 Provider。**

## 评估尺度

| 等级 | 含义 |
| --- | --- |
| Critical | 可能造成不可恢复数据丢失、安全/隐私事故或错误发布，必须在发布/扩展前处理 |
| High | 数据增长或关键流程中很可能造成明显故障，需要进入 v1.0 优先队列 |
| Medium | 当前边界可接受，但应有监测、测试或明确降级 |
| Low | 已被架构边界良好控制，维持约束即可 |

## 当前架构最稳的部分

### 1. 依赖方向与持久化隔离 — Low

`Entity → Contract ← BrowserStorage` 的方向稳定。Core 不依赖 React、Next.js 或 LocalStorage，Page 不直接复制 storage key 或自行 JSON 解析。未来替换存储时有明确 Adapter seam，不必先重写领域模型。

保持条件：继续禁止 Page/Component/Service 直接访问 `window.localStorage`；新增集合必须有 Contract、归一化与失败语义。

### 2. Raw / Interpreted 分层与 Human Review — Low

Conversation/Source/Message、派生 Q&A Pair、Proposal 与 KnowledgeCard 的权威性和生命周期不同。Analyzer 只能产出 Proposal，人工接受后才生成 Knowledge；Search 读取各层但不将原始证据与解释结果混成一个 canonical store。

保持条件：真实 Provider、搜索增强或未来 RAG 都不得绕过 Proposal/Review，也不得让搜索结果反向改写源实体。

### 3. SearchDocument 作为非持久化读模型 — Low/Medium

当前实现避免了 canonical data 与持久化 index 的双写、迁移、备份和 stale-index 问题。具体文本单元的 identity、snippet、path 与 matched fields 让搜索职责比旧聚合映射更明确。

保持条件：在决定持久化索引前，先定义重建、版本、失效、备份与一致性策略。

### 4. Asset metadata/content 分离 — Medium

Asset 通过独立 Entity/Contract/Service 管理引用，不把二进制数据塞入 LocalStorage，也不让 owning domain 或 Page 依赖文件系统/对象存储 SDK。这为 CLI、desktop 或对象存储 Adapter 保留了边界。

保持条件：UI 必须持续声明当前没有读取、复制、校验或删除文件内容。Conversation copy/delete 已通过 Workspace Service 与 Asset Contract 实现显式 metadata 生命周期：复制生成新 Asset ID 并重定向 owner，删除只清理对应 owner metadata。

### 5. Provider Contract 与失败隔离 — Medium

Demo 默认可用、Ollama 显式启用、云 Provider 不可用；非法输出和网络失败不写 Proposal。Provider metadata/capability snapshot 使历史生成记录不完全依赖当前配置。

保持条件：不得在缺少密钥、安全、隐私、费用、错误和验收设计时启用真实云 Provider。

## 最容易失控的部分

### 1. 跨集合生命周期与兼容规则 — High

Conversation、Source、Message、Snapshot、AnalyzerRun、Proposal、Knowledge、Task、Tag、Workspace、Asset 已形成多集合引用网络。复制、Restore、级联删除、Workspace 回迁和来源缺失各有不同语义；LocalStorage 又没有事务。任何新字段或新关系都可能产生部分写入、悬空引用或历史快照被误改。

控制建议：建立跨集合 invariants 清单、fixture-based integration tests 和导出时引用校验；新增关系前先定义 copy/delete/restore/export 行为。

### 2. Product scope 越过 runtime 边界 — High

Asset File Handling、Real AI、RAG、Activity/Agent 和数据库都需要新的安全与生命周期责任。如果把设置页占位、metadata foundation 或 Contract seam 当成“已经准备好”，很容易在没有备份、权限和失败设计时启用高风险能力。

控制建议：所有边界扩展继续使用独立 RFC/ADR 与可验证 acceptance criteria；Roadmap 候选不得视为批准。

### 3. 文档、UI 声明与真实保障不一致 — High

“Backup”“Local Asset Library”“local-first”容易让用户推断数据已完整备份、文件已受管理或资料永不离开设备。当前实际能力更窄：脚本不导出 LocalStorage，Asset 只是路径引用，Ollama 才是显式本地调用。

控制建议：在 UI、README、release notes 和错误提示中持续使用精确措辞，并通过人工 QA 验证用户不会被误导。

## LocalStorage 风险 — Critical

### 风险

- 浏览器/设备相关配额小且不可预测；大 Source、Message 与多集合 JSON 会竞争同一额度。
- 同步读写和 JSON 序列化会阻塞主线程，数据量增长后影响 Search 与编辑体验。
- 无跨 key 事务；级联写入、Import、Restore 或删除中断可能留下部分状态。
- 站点数据清理、浏览器 profile 损坏或域名变化可能造成全部数据丢失。
- 当前项目备份脚本无法读取浏览器 LocalStorage；尚无正式 Export / Import 或恢复演练。
- 各 Adapter 的局部归一化能兼容缺字段，但缺少全局 schema version、迁移顺序和可验证 manifest。

### 可能后果

不可恢复数据丢失、部分实体存在但引用缺失、保存 UI 显示与实际持久化不一致、搜索漏数据、未来迁移无法判断来源版本。

### 现有缓解

所有访问集中在 BrowserStorage；新增字段通常可选并有默认值；损坏/失败不应静默清空；Service 负责部分跨实体规则。

### 建议

v1.0 P0 建立版本化 Export / Import：独立 exchange schema、记录计数与引用校验、preview/dry-run、最安全的 replace 策略、写入前回滚快照、round-trip fixtures。之后再根据容量与性能数据决定 IndexedDB、SQLite 或其它 Adapter，不能先迁库再补可恢复性。

## Asset metadata 风险 — High

### 风险

- 用户输入的绝对/相对路径可能不存在、移动、改名、无权限或仅在一台设备有效。
- filename、size、MIME、hash 都可能是未验证声明；metadata 与真实文件会漂移。
- Conversation owner 的 copy/delete metadata 语义已经闭合，但其它 owner 与未来 managed file 的完整生命周期矩阵仍未定义。
- LocalStorage 无事务；Asset lifecycle 采用清晰的顺序写入，并在可选存储缺失或旧数据异常时优先避免阻断 Conversation 主操作。
- 备份脚本不跟随外部路径；用户可能误以为登记后文件已纳入备份。
- 路径本身可能泄露用户名、目录结构或私人项目名称，导出时属于敏感信息。

### 可能后果

失效引用、错误完整性提示、迁移后无法定位文件、误删/漏删、导出文件泄露本地环境信息。

### 现有缓解

文件内容不进 LocalStorage；浏览器不读、复制或删除文件；Asset 有独立 Contract/Service；Conversation Workspace Service 已协调 metadata copy/delete；ADR-003 明确未来 Adapter 方向。

### 建议

Conversation metadata owner 生命周期已闭合：复制只复制 metadata 引用并生成新 ID，删除 owner 时只清理对应 metadata，绝不隐式删除外部文件。发布前应通过 EDGE-12 复测该规则。之后保持 metadata-only 直到 runtime 被明确选择。若做 integrity check，应由用户显式触发的 CLI/desktop Adapter 完成，并区分 `external-reference`、`managed`、`missing`、`changed`。任何删除文件能力都需独立确认、trash/rollback 策略和备份 manifest。

## Search runtime index 风险 — High

### 风险

- 每次从多个 LocalStorage 集合同步构建并线性评分，成本随文档数与正文长度增长。
- Source、Message、Q&A Pair 等可能重复同段文本，造成结果拥挤和相关性偏差。
- subsequence fuzzy 对短词召回过宽；没有编辑距离、语言分词或语义能力。
- snippet 与 matched fields 若来自不同标准化路径，可能出现分数正确但展示难以解释。
- Message/Q&A 结果缺少稳定行 anchor，只能打开 owning Conversation。
- 搜索读取九类数据，对任一 Adapter 的损坏/异常都更敏感。

### 可能后果

输入卡顿、排序失去可信度、具体证据难定位、数据增长后功能从“可用”突然变成“不可接受”。

### 现有缓解

索引不持久化，因此没有 stale index；exact/contains 高于 fuzzy；Search 不修改 canonical data；当前产品明确限制为小数据量。

### 建议

先建立 1k/10k 文档基准、真实中英文相关性样本、误命中/漏命中清单和查询延迟阈值。优先增加稳定 anchor 与结果解释。只有数据证明当前方案不足时，再比较 MiniSearch、Fuse.js、IndexedDB 索引或 desktop SQLite FTS，并定义重建与版本策略。

## Provider 风险 — High（云 Provider 为 Critical）

### 风险

- Ollama 依赖本地服务、模型存在性、CORS、超时与非确定输出。
- 云 Provider 会引入 API Key、浏览器暴露、隐私/数据出境、费用、限流、模型退役和供应商差异。
- Provider 输出 schema 看似统一，但内容质量、证据忠实度和模型版本不可控。
- Retry 可能重复产生成本或不同解释；若幂等/审计不清晰，用户难以理解历史。
- UI 若只显示“当前 Provider”，不足以说明哪些原文将被发送到哪里。

### 可能后果

隐私事故、密钥泄露、不可控费用、失败写入错误 Proposal、历史来源不可审计，或用户误以为云调用仍是 local-only。

### 现有缓解

Demo 默认；Ollama 默认关闭且显式配置/测试/选择；云 Provider 未实现；输出先校验且只写 Proposal；失败不写 Proposal；Knowledge 保存生成能力快照。

### 建议

v1.0 不启用真实云 Provider。先完成 threat model、密钥运行时、逐次数据发送说明、费用上限、脱敏日志、Provider test doubles 和验收语料。人工 Review 必须继续不可绕过。

## 未来数据库迁移风险 — High

### 风险

- 当前数据分散在多个 LocalStorage key，缺少全局 schema/version 与单一迁移 manifest。
- SQLite/服务端数据库/IndexedDB 的事务、ID、日期、空值、排序和全文索引语义不同。
- Snapshot、Evidence、SourceRef 等故意保存历史副本，不能简单“去重”成外键。
- Inbox 默认值、旧缺字段归一化和 owner 删除规则必须在迁移后保持。
- 双写迁移会产生权威来源歧义；一次性迁移失败则需要可靠 rollback。
- Asset external path 在另一设备/服务器上通常无意义。

### 可能后果

静默数据丢失、历史 provenance 被折叠、跨实体引用断裂、旧数据无法升级、回滚后两个存储互相覆盖。

### 建议迁移路线

1. 先定义与内部 LocalStorage key 解耦的 versioned exchange schema。
2. 建立全量导出、引用/计数校验、round-trip 和旧版本 fixtures。
3. 用实际容量、延迟和失败数据确认迁移触发条件。
4. 新 Adapter 先离线导入并对比，禁止无观测双写。
5. 提供 dry-run、备份、校验报告、切换点与 rollback。
6. 明确保留 Snapshot/Evidence 的历史副本语义，不做未经批准的规范化。

## 风险矩阵

| 风险 | 概率 | 影响 | 等级 | 当前是否阻塞 v0.9 |
| --- | --- | --- | --- | --- |
| 清站点数据且无完整恢复 | 中 | 极高 | Critical | 不阻塞 draft；阻塞把当前方案描述为长期可靠备份 |
| 跨集合部分写入/引用损坏 | 中 | 高 | High | 人工回归失败时阻塞 |
| Search 随数据量卡顿 | 中 | 高 | High | 当前小数据边界内不阻塞；需基准 |
| fuzzy 误命中与定位不足 | 高 | 中 | High | 核心搜索不可用时阻塞；轻微排序可分级 |
| Asset 路径失效或误解已备份 | 高 | 高 | High | 文案/删除安全失败时阻塞 |
| Ollama 失败写入 Proposal | 低/中 | 高 | High | 阻塞 |
| 提前启用云 Provider | 低（当前禁用） | 极高 | Critical | 阻塞且禁止发布 |
| 未验证数据库迁移 | 低（未开始） | 极高 | High | 不阻塞 v0.9；阻塞未来迁移实施 |

## 建议优先修复顺序

1. **完成 v0.9 人工 QA 并处理所有 release blocker。** 优先复测已修复的 EDGE-12，再验证旧数据兼容、失败不清空、Analyzer/Review 幂等、Asset 删除安全与备份边界。
2. **实现版本化 Local Data Export / Import 与恢复演练。** 这是降低不可恢复数据风险的 P0，不等同于数据库迁移。
3. **建立跨集合 invariants 与自动化回归。** 覆盖 copy/delete/restore、SourceRef、Evidence、Asset owner 和旧数据 fixtures。
4. **增加 Search anchors 与相关性/性能基准。** 先测量再选算法或索引库。
5. **收紧 Asset 状态与用户语言。** 明确 external reference、missing/unchecked 和 backup coverage；文件 integrity 仅在批准的 adapter 中实现。
6. **定义数据库迁移触发条件和 Adapter PoC。** Export schema 稳定、数据证明需要后再推进。
7. **最后评审真实 AI Provider。** 只有安全、密钥、隐私、费用、错误和验收方案齐全时才可能进入 runtime。

## v0.9 Architecture Gate

v0.9 的整体分层可判为稳定，Conversation 与 Asset metadata 的已知 owner lifecycle blocker 已修复，release architecture gate 的该项实现检查已通过；完整 release gate 仍等待人工 QA。其余边界结论如下：

- 分层与依赖方向符合既有约束。
- Conversation Note、SearchDocument 与 Asset metadata 均有清晰职责和兼容边界。
- Search index 非持久化，不制造双写权威来源。
- Demo/Ollama 与 Proposal/Review 安全边界未被突破。
- 数据库、RAG、云同步和云 Provider 未被提前实现。

剩余解除条件是：先复测 Asset metadata 的 copy/delete 语义，再执行完整人工 QA；任何数据丢失、旧数据清空、失败写 Proposal、删除本地文件或误导完整备份的缺陷都必须阻塞 release。正式 v1.0 planning 应先处理可恢复性，而不是继续扩大领域数量。
