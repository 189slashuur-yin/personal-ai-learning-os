# Release v0.9 Review

## Review 结论

v0.9 `Data Foundation & Search` 的主要实现范围已经完成，架构边界整体与 RFC-004、ADR-003 一致，自动质量门禁已有通过记录。Release Review 发现的 Conversation / Asset owner lifecycle blocker 已修复：删除 Conversation 会清理其 Asset metadata，复制 Conversation 会创建使用新 ID 且指向新 Conversation 的 metadata 副本，真实文件始终不被复制或删除。**当前没有已知的 Asset lifecycle release blocker；v0.9 仍保持 `draft`，待完成 release-blocking 人工 QA 后再评估正式发布。**

## v0.9 完成了什么

- 将搜索从聚合实体导航升级为九类具体文本单元的本地检索。
- 为 Conversation 增加独立 Note，并保持旧数据缺字段兼容。
- 引入非持久化 `SearchDocument` 读模型和运行时 `SearchIndexService`。
- 增加 exact、contains 与低权重 subsequence fuzzy 匹配及结果评分。
- 建立 Local Asset Library 的 metadata foundation，仅登记引用，不处理文件内容。
- 提供项目文档与项目内 `data/` 的时间戳备份脚本。
- 在 Settings 与 Help 中补充 Data Management 边界说明。
- 保留既有 Conversation → Proposal → Review → Knowledge 主链路、Task 能力和 Demo/Ollama Provider 边界，没有引入数据库、RAG、云同步或真实云 Provider。

## 数据与搜索架构变化

v0.9 没有改变 canonical data 的所有权。Conversation、Source、Message 属于原始或用户编辑的数据；Q&A Pair 是 Message 上的派生读模型；Proposal 是待审核解释；KnowledgeCard 是人工接受后的长期知识。Search 横跨这些层读取文本，但不拥有、覆盖或合并它们。

这次变化的核心是新增统一的运行时搜索读模型。各 BrowserStorage Adapter 继续负责既有集合和兼容归一化，`SearchIndexService` 在查询时读取集合、构建文档并线性评分。没有新增持久化搜索索引或新的索引 LocalStorage key，因此不存在 canonical data 与持久化索引双写问题；代价是每次构建成本随本地数据量线性增长。

## Conversation Note

Conversation 新增可选 `note` 字段，和 Source、Message、Tag、Knowledge 分离。Note 可显式 Save/Cancel，保存时更新 Conversation `updatedAt`，并作为 Conversation 搜索文本的一部分。旧 Conversation 缺少该字段时按空值读取，不需要清空或迁移旧记录。修改 Note 不应改写 Source、Message、Proposal、Knowledge 或 Snapshot。

Review 判断：职责清晰、兼容策略合理。需要人工验证 Save/Cancel、刷新持久化、搜索命中，以及 Note 修改不污染历史证据快照。

## SearchDocument

`SearchDocument` 覆盖 Workspace、Conversation、Source、Message、派生 Q&A Pair、Proposal、KnowledgeCard、Task 与 Tag。文档携带稳定来源身份、标题/正文、Workspace、时间、来源路径及可选元数据；结果提供 snippet、matched fields、score 和 match mode。

该模型是非持久化 read model，不是第十类业务实体。它让搜索结果能够指向具体文本单元，同时保持 Search 不修改源数据。当前类型与 Workspace 过滤已进入 v0.9 范围；更复杂的语义检索、持久化索引和数据库全文索引不在本版本内。

## Fuzzy Search

fuzzy 使用文本标准化后的 subsequence 匹配，并让 exact / contains 的分数高于 fuzzy。它适合处理轻微遗漏和跨字符匹配，保持本地、确定性且无需新增依赖。

它不是编辑距离、拼写纠正或语义搜索。短查询可能产生较宽泛的低分结果；中英文空格、标点、大小写和超长内容仍需人工检查排序质量。v1.0 前应先收集误命中和漏命中样本，再决定继续调权、引入浏览器索引库或转向桌面 SQLite FTS。

## Asset metadata

Asset 通过独立 Entity、Contract、BrowserStorage 与 Service 保存 owner、filename/original name、MIME type、size、hash、local/relative path、note 和时间等 metadata。当前 UI 只在 Conversation Detail 登记文件名、路径和备注，并允许删除 metadata。

浏览器不会上传、复制、扫描或读取任意本地文件；删除 metadata 也不会删除文件系统内容。该边界避免把二进制内容塞入 LocalStorage，并为未来 CLI、桌面适配器或对象存储保留可替换接口。当前路径由用户输入，存在性、权限、hash 完整性和可移植性均未验证。

Conversation Workspace Service 已通过 Asset Contract 协调 owner lifecycle：复制 Conversation 时只复制关联 metadata，并为副本生成新 Asset ID、重定向 `entityId`；删除 Conversation 时只清理该 owner 的 metadata。Knowledge、Task 与 Workspace 的 Asset metadata 不受这两项操作影响；缺失或损坏的旧 Asset 集合会安全降级，不阻断 Conversation 主操作。

## Backup script

`node scripts/backup-local-data.mjs` 默认在 `backups/` 下创建不覆盖旧内容的时间戳目录，也支持 `--target` 指定输出位置。白名单包含 `docs/`、核心项目文档和存在时的项目内 `data/`。

脚本不跟随外部 Asset 路径，不读取项目外文件，也不能从 Node.js 自动导出浏览器 LocalStorage。因此它是“项目资料备份”，不是完整用户数据备份或恢复方案。人工 QA 必须分别验证默认目标、自定义目标、重复执行不覆盖、缺少 `data/` 时的行为和输出说明。

## Data Management

Settings、Help 与 README 已说明三类位置：浏览器结构化记录、仓库文档/项目内数据、Asset metadata 指向的外部文件。说明中包含备份命令，同时明确 LocalStorage 与外部文件未被脚本覆盖。

该说明降低了“运行脚本等于完整备份”的误解，但尚不能替代可验证的 Export / Import、schema version、预览、冲突处理、回滚和恢复演练。

## 已知限制

- 人工 v0.9 QA 尚未执行，当前不能声明 release-ready 已获实测确认。
- SearchIndexService 同步重建并线性评分，只适合当前单浏览器、小数据量假设。
- Message 与 Q&A 结果只打开所属 Conversation，不会滚动到精确行锚点。
- fuzzy 对短词可能产生宽泛弱匹配，不提供错别字纠正或语义召回。
- Asset path 不验证存在性、权限、内容或 hash，不管理文件生命周期。
- Conversation copy/delete 采用 LocalStorage 顺序写入而非事务；AssetStorage 缺失或旧数据损坏时优先保证 Conversation 主操作不白屏。
- 备份脚本不导出 LocalStorage，不复制外部 Asset，也没有恢复流程。
- LocalStorage 容量有限、同步、无事务，不支持跨设备、并发或可靠灾备。
- Ollama 仍依赖用户本地环境；云 Provider 仍未实现且不得启用。
- 仓库目前没有覆盖 v0.9 行为的自动化测试套件。

## 技术债

| 优先级 | 技术债 | 影响 | 建议处理 |
| --- | --- | --- | --- |
| P0 | 缺少完整 LocalStorage Export / Import 与恢复验证 | 清站点数据可能造成不可恢复丢失 | v1.0 优先设计版本化导出、校验、预览、回滚和恢复演练 |
| P0 | v0.9 人工回归未执行 | 发布质量未知 | 执行 V09 Manual QA Plan 中全部阻塞项并留存证据 |
| P1 | 搜索无精确 Message/Q&A anchor | 找到内容后定位成本高 | 增加稳定 anchor 与定位失败降级 |
| P1 | 搜索质量和规模没有基准 | 数据增长后排序或性能可能退化 | 建立固定语料、相关性样本和数据量基准 |
| P1 | Asset metadata 与实际文件可能漂移 | 链接失效且用户难以判断 | 在批准的 CLI/desktop 边界增加显式 integrity check |
| P2 | LocalStorage 无事务、schema version 和统一迁移编排 | 跨集合操作与未来迁移脆弱 | 先定义导出 schema 和迁移清单，再评估数据库 Adapter |
| P2 | Provider UX 尚未具备真实云接入治理 | 密钥、费用、隐私与错误责任未解决 | 仅做设计评审，不提前启用云 Provider |

## 是否满足 v0.9 目标

| 目标 | 结论 | 依据与保留条件 |
| --- | --- | --- |
| 数据可长期积累的基础 | 部分满足 | 分层与兼容边界清楚，但 LocalStorage 仍不是长期生产存储 |
| 找到具体本地材料 | 满足实现目标 | 九类 SearchDocument、snippet、路径、字段和三种匹配模式已实现；精确行 anchor 仍缺失 |
| 文件引用基础 | 满足实现目标 | metadata/path 已隔离，Conversation copy/delete owner 生命周期已闭合；真实文件仍明确不受管理 |
| 手动备份边界清晰 | 满足说明目标 | 脚本与文档明确，但不是完整数据备份 |
| 不引入未批准基础设施 | 满足 | 未加入数据库、RAG、云同步、云 Provider 或新依赖 |
| 可正式发布 | 尚未满足 | 必须先完成 release-blocking 人工 Smoke、Regression 与 Edge Case 测试 |

最终判定：**v0.9 的数据与搜索主目标基本达到，已知 Asset owner lifecycle blocker 已修复。Release 状态保持 draft；完成 EDGE-12 与完整人工 QA、记录缺陷并确认无其它阻塞问题后，才可将版本口径切换为 v0.9。**
