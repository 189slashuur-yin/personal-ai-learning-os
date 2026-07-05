# v0.9 Manual QA Execution Plan

## 目的与发布规则

本计划验证 v0.9 `Data Foundation & Search`，不替代现有 `docs/QA_CHECKLIST.md`。由于仓库当前没有覆盖 v0.9 的自动化测试套件，**以下 50 条在本次 release review 中都必须人工执行并记录证据**；表中的“未来自动化”仅表示后续适合自动化的部分。

执行顺序为 Smoke → Regression → Edge Case。任一标记“是”的用例失败，release 保持 `v0.9 draft`；修复后必须重测失败用例及其关联主链路。标记“否”的失败也必须登记、定级和给出接受理由，不能静默忽略。

## 测试准备

- 环境 A：全新浏览器 profile，用于默认值、空数据与新建链路。
- 环境 B：保留 Sprint1–Sprint6 形状数据的 profile，用于缺字段兼容。
- 环境 C：可清理的压力/异常 profile，用于配额、损坏数据和大数据量测试。
- 使用 Demo Provider 完成确定性主流程；Ollama 只验证默认关闭与失败隔离，不要求安装模型。
- 准备唯一关键词、长中英文文本、Emoji、CRLF/LF 文本、同名实体、存在/不存在的本地文件路径。
- 每条记录浏览器、Node 版本、步骤、实际结果、截图或日志、缺陷编号和复测结果。

“未来自动化”含义：`E2E` 为浏览器端流程；`Unit` 为纯 Service/归一化逻辑；`Integration` 为多 Adapter/Service 组合；`CLI` 为备份脚本；`人工保留` 表示即使增加自动化也应保留人工判断。

## 10 条最小 Smoke Test

| ID | 操作 | 预期 | 失败影响模块 | 阻塞 release | 本次执行 / 未来自动化 |
| --- | --- | --- | --- | --- | --- |
| SMK-01 | 打开 Dashboard、Conversation、Search、Settings、Help，观察控制台。 | 页面无白屏、阻塞错误或错误导航，主入口可达。 | Routing / Navigation | 是 | 必须人工；未来 E2E，视觉与控制台人工保留 |
| SMK-02 | 新建 Conversation，填写独立 Note，保存后刷新。 | Note 保留，Save/Cancel 状态正确，未改写 Source。 | Conversation / BrowserStorage | 是 | 必须人工；未来 E2E + Integration |
| SMK-03 | 在 Note、Source、Message、Q&A Pair 中放入不同唯一关键词并逐一搜索。 | 各关键词返回正确具体文本单元、snippet、来源路径与 matched fields。 | SearchDocument / Search Index | 是 | 必须人工；未来 E2E + Unit |
| SMK-04 | 用一个完整值、一个子串和 `oa` 弱查询搜索同一语料。 | 分别出现 exact、contains、fuzzy；直接匹配排序高于 fuzzy。 | Search Ranking / Fuzzy | 是 | 必须人工；未来 Unit + E2E |
| SMK-05 | 在 Search 分别切换 entity type 与 Workspace，并刷新带参数 URL。 | 结果满足组合条件；`q`、`type`、`workspaceId` 可恢复。 | Search Filters / Routing | 是 | 必须人工；未来 E2E |
| SMK-06 | 在 Conversation 登记文件名、路径、备注，刷新页面。 | 只保存 Asset metadata；页面不读取、上传或复制文件。 | Asset Service / Storage / UI | 是 | 必须人工；未来 E2E，文件未被访问需人工保留 |
| SMK-07 | 删除 Asset metadata，先取消再确认，并检查本地文件。 | 取消不变；确认只删除 metadata；本地文件仍存在。 | Asset Deletion Safety | 是 | 必须人工；未来 E2E，文件存续人工保留 |
| SMK-08 | 在临时副本或允许的测试目录运行默认备份命令两次。 | 生成两个不覆盖的时间戳目录，包含白名单文档；缺少 `data/` 不失败。 | Backup Script | 是 | 必须人工；未来 CLI integration |
| SMK-09 | 打开 Settings、Help、README 的 Data Management 说明。 | 均明确 LocalStorage、项目文件、Asset 引用及脚本不导出浏览器数据/外部文件。 | Data Management Documentation | 是 | 必须人工；未来文案断言可自动化，理解性人工保留 |
| SMK-10 | 完成 Conversation → Messages → Demo Proposal → Review → Knowledge，刷新并再搜索证据。 | 主链路唯一、可追溯、持久化；Search 能回到对应层，未产生重复 Knowledge。 | Core Knowledge Flow / Search | 是 | 必须人工；未来 E2E |

## 20 条核心 Regression Test

| ID | 操作 | 预期 | 失败影响模块 | 阻塞 release | 本次执行 / 未来自动化 |
| --- | --- | --- | --- | --- | --- |
| REG-01 | 用 TXT 新建 Conversation，再将另一 TXT 导入已有 Conversation。 | 新建与关联流程均正常，原文和来源信息保留。 | TXT Import / Source Storage | 是 | 必须人工；未来 E2E |
| REG-02 | 用 Clipboard Profile 导入多轮对话，核对预览和落盘 Messages。 | Profile、角色、顺序、Unknown 统计与导入结果一致。 | Clipboard Import / Parser | 是 | 必须人工；未来 Unit + E2E |
| REG-03 | 重命名 Conversation，编辑 Source 并等待自动保存后刷新。 | 标题和 Source 均保留，保存状态及更新时间正确。 | Conversation Editing | 是 | 必须人工；未来 E2E |
| REG-04 | 编辑一条 Message，再查看旧 Proposal/Knowledge evidence。 | Message 更新；生成时 evidence snapshot 不被回写。 | Message Editing / Provenance | 是 | 必须人工；未来 Integration + E2E |
| REG-05 | 创建 Conversation Snapshot，修改 Conversation/Messages 后恢复。 | 只恢复 Conversation/Messages，新 Message ID 正确；Snapshot 与其它实体不变。 | Conversation Versioning | 是 | 必须人工；未来 Integration + E2E |
| REG-06 | 复制含 Source、Messages、Proposal 的 Conversation。 | 副本实体和引用独立，原 Conversation 不变。 | Conversation Workspace Service | 是 | 必须人工；未来 Integration |
| REG-07 | 删除测试 Conversation，先取消再确认，核对影响清单。 | 取消无变化；确认只级联目标关联数据并遵循现有引用规则。 | Cascade Delete / Data Integrity | 是 | 必须人工；未来 Integration + E2E |
| REG-08 | 从完整 Source 用 Demo 生成 Proposal。 | 生成一个 Pending Proposal，provider、mode、evidence 与 metadata 完整。 | Analyzer / Proposal | 是 | 必须人工；未来 Integration + E2E |
| REG-09 | 选择多个 Messages 和 Q&A Pair 分别 Analyze。 | 使用正确 Message 顺序与 ID，Q&A 仍为派生视图，不新增 canonical pair。 | Message/Q&A Analyzer | 是 | 必须人工；未来 Unit + E2E |
| REG-10 | 触发 Demo 模拟失败，再 Retry。 | 失败只记录 AnalyzerRun，不写 Proposal；Retry 使用原来源成功恢复。 | Analyzer Safety / Retry | 是 | 必须人工；未来 Integration |
| REG-11 | 接受一个 Proposal 并重复打开/点击处理入口。 | 只创建一张 KnowledgeCard，Proposal 状态合法且幂等。 | Review / Knowledge Creation | 是 | 必须人工；未来 Integration + E2E |
| REG-12 | 拒绝另一个 Pending Proposal。 | 状态变为 Rejected，不创建 KnowledgeCard。 | Review State Machine | 是 | 必须人工；未来 Integration |
| REG-13 | 编辑、归档、恢复并搜索 KnowledgeCard。 | 内容持久化，Active/Archived 过滤和搜索均正确。 | Knowledge Lifecycle | 是 | 必须人工；未来 E2E |
| REG-14 | 创建、编辑、关联、筛选和删除 Tag。 | 关联计数同步；删除 Tag 只解除引用，不删除 Knowledge。 | Tag Service / Knowledge | 是 | 必须人工；未来 Integration + E2E |
| REG-15 | 创建 Workspace，移动 Conversation，按 Workspace 搜索后删除 Workspace。 | 归属和过滤正确；删除策略回迁 Inbox，不丢业务数据。 | Workspace Service / Search | 是 | 必须人工；未来 Integration + E2E |
| REG-16 | 创建普通 Task 和来源关联 Task，完成、重开、归档、恢复。 | 生命周期与 SourceRef 快照保持，Knowledge/Conversation 不被修改。 | Task Domain | 是 | 必须人工；未来 Integration + E2E |
| REG-17 | 搜索 Task title、description、SourceRef，并组合 Task 筛选。 | Task 结果与筛选正确；清除筛选恢复其它实体结果。 | Task Search | 否 | 必须人工；未来 Unit + E2E |
| REG-18 | 在 Settings 测试 Demo，尝试启用未实现云 Provider。 | Demo Success；云 Provider 不索取 Key、不发请求、不能成为当前 Provider。 | Provider Safety | 是 | 必须人工；未来 E2E + network mock |
| REG-19 | 保持 Ollama 默认关闭，再模拟服务不可达的 Test/Analyze。 | 默认不请求；失败可恢复且不写 Proposal，可明确回退 Demo。 | Ollama / Analyzer Safety | 是 | 必须人工；未来 Integration + E2E |
| REG-20 | 在环境 B 加载旧数据并执行列表、详情、Search、编辑与刷新。 | 缺少 note/workspace/metadata 等可选字段时安全默认，不清空或伪造历史数据。 | Compatibility / BrowserStorage | 是 | 必须人工；未来 fixture-based Integration |

## 20 条 Edge Case Test

| ID | 操作 | 预期 | 失败影响模块 | 阻塞 release | 本次执行 / 未来自动化 |
| --- | --- | --- | --- | --- | --- |
| EDGE-01 | 搜索空字符串、纯空格、大小写变体、全角/半角标点。 | 空查询显示最近内容；其它输入稳定归一化且页面不报错。 | Search Normalization | 是 | 必须人工；未来 Unit + E2E |
| EDGE-02 | 搜索 1 个常见字符及极短 fuzzy 查询。 | 弱匹配可辨识且低分，不压过 exact/contains；页面不被海量结果卡死。 | Fuzzy Ranking / Performance | 否 | 必须人工；未来 benchmark + Unit，相关性人工保留 |
| EDGE-03 | 搜索不存在的词、Emoji、中日韩混合词和换行附近文本。 | 无结果提示正常；Unicode 文本不损坏，snippet 合理。 | Search Text Handling | 是 | 必须人工；未来 Unit + E2E |
| EDGE-04 | 创建同名 Conversation/Task/Knowledge 后搜索，并逐个打开。 | 每条结果保留正确 type、source identity 和路径，不串实体。 | Search Identity / Routing | 是 | 必须人工；未来 E2E |
| EDGE-05 | 搜索超长 Source/Message 末尾的唯一词。 | 能命中且 snippet 聚焦匹配处，不只截取开头。 | Search Snippet | 是 | 必须人工；未来 Unit |
| EDGE-06 | 在修改 Note 后立即搜索，再取消一次未保存修改。 | 已保存值可搜；取消值不可搜；不会出现旧/新双份文档。 | Conversation Note / Index Rebuild | 是 | 必须人工；未来 E2E |
| EDGE-07 | 删除或恢复源实体后立即重复相同搜索。 | 运行时结果反映 canonical data 当前状态，无陈旧持久化索引。 | Runtime Search Index | 是 | 必须人工；未来 Integration |
| EDGE-08 | 用足量本地数据反复输入查询并快速切换筛选。 | UI 保持可操作、结果最终对应最新输入，无明显冻结或旧结果覆盖。 | Search Runtime / Debounce | 否 | 必须人工；未来 performance E2E |
| EDGE-09 | 给 Asset 输入空文件名、空路径、前后空格和超长备注。 | 必填与 trim 规则一致，非法值不落盘，长文本不破坏布局。 | Asset Validation / UI | 是 | 必须人工；未来 Unit + E2E |
| EDGE-10 | 登记不存在、相对、带空格/Unicode、外部绝对路径。 | metadata 可按当前边界保存；UI 不谎称文件已验证或已备份。 | Asset Path Semantics | 是 | 必须人工；未来 E2E，语义文案人工保留 |
| EDGE-11 | 两条 Asset 使用同名文件或相同路径，删除其中一条。 | 仅目标 metadata 删除，其它记录与本地文件不变。 | Asset Identity / Deletion | 是 | 必须人工；未来 Integration |
| EDGE-12 | 为同一 Conversation 登记两条 Asset metadata，记录原 ID 后复制 Conversation，再删除原 Conversation；在浏览器 Application 面板只读核对 Asset 集合，不编辑存储。 | 副本 metadata 使用新 ID、指向新 Conversation，并保留路径、文件名、备注、hash、MIME 与 size；删除原 Conversation 后只清理原 owner metadata，副本及 Knowledge / Task / Workspace metadata 不受影响，真实文件始终不变。 | Asset Ownership / Copy / Cascade | 是 | 已覆盖的 blocker 复测项；必须人工；未来 Integration，文件存续人工保留 |
| EDGE-13 | 运行备份时 `data/` 不存在，再在存在空 `data/` 时运行。 | 两种情况均成功且报告准确，不把缺失目录描述为已复制内容。 | Backup Script | 是 | 必须人工；未来 CLI integration |
| EDGE-14 | 对含空格和 Unicode 的自定义 `--target` 运行备份两次。 | 正确创建独立时间戳目录，不覆盖或写错位置。 | Backup Target Handling | 是 | 必须人工；未来 CLI integration |
| EDGE-15 | 检查备份产物是否含浏览器数据或外部 Asset 文件。 | 均不包含，输出与文档明确提示此限制。 | Backup Safety / Documentation | 是 | 必须人工；未来 CLI assertions，边界理解人工保留 |
| EDGE-16 | 在环境 C 接近 LocalStorage 配额后保存 Note/Asset/Conversation。 | 失败可见，不静默清空、覆盖或部分伪成功。 | BrowserStorage Failure Handling | 是 | 必须人工；未来 mocked Integration |
| EDGE-17 | 注入单个损坏或缺字段的旧集合记录后打开 Search。 | 损坏被安全隔离或报告；其它可读数据不被清空，页面不白屏。 | Storage Normalization / Search | 是 | 必须人工；未来 fixture-based Integration |
| EDGE-18 | 快速双击接受 Proposal、删除 Asset、删除 Conversation。 | 接受幂等；破坏性操作只执行一次且仍要求确认。 | Concurrency / Destructive Safety | 是 | 必须人工；未来 E2E |
| EDGE-19 | 打开不存在的 Conversation、Knowledge、Review ID 及由搜索历史留下的旧 URL。 | 显示 Not Found/返回入口，不崩溃、不创建占位数据。 | Routing / Missing References | 是 | 必须人工；未来 E2E |
| EDGE-20 | 在刷新、关闭标签页和重启浏览器后复核 Note、Asset metadata、搜索与主链路数据。 | 已保存内容一致；未保存内容不被误报为已保存；当前版本无数据消失。 | Persistence / Release Integrity | 是 | 必须人工；未来 E2E，重启浏览器人工保留 |

## 必须人工执行的测试

本次发布前，SMK-01–10、REG-01–20、EDGE-01–20 **全部必须人工执行**。其中以下判断即使未来有自动化也必须保留人工检查：

- 搜索结果 snippet、排序和 fuzzy 弱匹配是否对真实阅读有用。
- Message/Q&A 结果缺少精确 anchor 时，当前导航是否仍可接受。
- Asset metadata UI 是否明确表达“没有读取、复制、校验或删除本地文件”。
- 备份脚本和 Data Management 文案是否会让用户误以为 LocalStorage 已备份。
- 破坏性确认、错误提示、空状态和长文本布局是否清楚可理解。
- 浏览器真实刷新/重启、LocalStorage 配额与操作系统文件存续行为。

## 未来可自动化的测试

- Unit：查询标准化、exact/contains/fuzzy 评分、snippet、SearchDocument 映射、旧字段归一化、Asset 校验。
- Integration：九类集合构建索引、Conversation Note 持久化、Asset owner 生命周期、Analyzer/Review 幂等、旧数据 fixtures。
- E2E：Smoke 主链路、搜索过滤与 URL 恢复、Note Save/Cancel、Asset metadata CRUD、Provider guard、Not Found。
- CLI integration：备份白名单、缺失/空 `data/`、自定义 target、时间戳不覆盖、禁止跟随外部路径。
- Performance：固定 1k/10k SearchDocument 语料的构建时间、查询延迟、输入响应与排序快照。

自动化建立后仍需以人工 release pass 覆盖用户理解、视觉质量、真实浏览器持久化和操作系统文件边界。

## 执行结果模板

| 字段 | 内容 |
| --- | --- |
| Build / commit |  |
| 浏览器与版本 |  |
| Node / OS |  |
| 执行人 / 日期 |  |
| Smoke | `0/10` passed |
| Regression | `0/20` passed |
| Edge Case | `0/20` passed |
| Release blockers |  |
| 非阻塞缺陷与接受理由 |  |
| 最终建议 | 保持 draft / 发布 v0.9 |
