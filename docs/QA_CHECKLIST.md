# Manual QA Checklist

本清单基于 Sprint11、README、PROJECT、ROADMAP、HANDOFF 与当前页面实现整理。它是手工验收基线，不代表测试已经执行，不包含自动化测试。

## 测试准备

- 准备普通、空白和非 TXT 文件各一份。
- 准备包含中英文角色标记、三反引号代码块、无角色标记的对话文本。
- 使用独立浏览器配置或预先备份站点数据，避免误删真实 LocalStorage 数据。
- Ollama 成功链路需要本机服务已启动且目标模型已下载；不具备该环境时至少执行失败链路。

## Import

| ID | 操作 | 预期结果 | 是否可能失败 | 失败模块 |
| --- | --- | --- | --- | --- |
| IMP-01 | 打开 `/import`。 | 同时显示 TXT File Import 和 Clipboard Import。 | 是：入口缺失或页面报错。 | Import Page |
| IMP-02 | Clipboard Import 不手动填写标题，粘贴带 User 消息的有效文本。 | 自动以第一条 User Message 前 30 字建议标题，仍可手动修改。 | 是：标题未更新或覆盖手动输入。 | Clipboard Smart Title |
| IMP-03 | 填写标题，但只粘贴空格或换行。 | 导入按钮不可用，不创建 Conversation。 | 是：空内容被保存。 | Clipboard Import Validation |
| IMP-04 | 依次选择 ChatGPT、Claude、DeepSeek、Gemini、Manual、Plain Text。 | 六种来源均可选，选择值正常保留。 | 是：来源缺失或保存错误。 | Import / Conversation Entity |
| IMP-05 | 粘贴超过 1000 字的多行文本，核对字符数、行数和 Preview。 | 字符数与原文一致，行数正确，Preview 最多显示前 1000 字。 | 是：统计或截断错误。 | Clipboard Import UI |
| IMP-06 | 输入标题、来源和有效文本，点击“导入并打开 Conversation”。 | 显示成功状态并跳转详情；只创建 Conversation 和 Source，不生成 Messages、Proposal 或调用 AI。 | 是：部分数据落盘或产生额外实体。 | Import / BrowserStorage |
| IMP-07 | 刷新导入后的详情页。 | 标题、来源和原始全文仍存在。 | 是：持久化失败。 | Conversation / Source Storage |
| IMP-08 | 选择有效 TXT 文件。 | 显示文件名、字符数及前 300 字预览。 | 是：文件读取失败。 | TXT Import |
| IMP-09 | 选择非 `.txt` 文件。 | 显示仅支持 TXT 的错误，不允许保存。 | 是：类型校验绕过。 | TXT Import Validation |
| IMP-10 | 选择空 TXT 文件。 | 显示无可分析文字的错误，不创建 Source。 | 是：空 Source 被保存。 | TXT Import Validation |
| IMP-11 | 将 TXT 保存为新 Conversation。 | 使用文件名作为标题，来源为 TXT，并跳转详情页。 | 是：Conversation 或 Source 未创建。 | TXT Import / Storage |
| IMP-12 | 将 TXT 保存到已有 Conversation。 | 不创建重复 Conversation；目标 Conversation 更新时间变化并关联 Source。 | 是：关联错误。 | TXT Import / Conversation Storage |

## Sprint11 Smoke Test

| ID | 操作 | 预期结果 | 是否可能失败 | 失败模块 |
| --- | --- | --- | --- | --- |
| S11-01 | 依次选择 ChatGPT、Claude、DeepSeek、Gemini、Manual、Plain Text Profile。 | 六种 Profile 均显示来源说明，选择后使用对应角色别名重新计算预览。 | 是：Profile 映射或别名错误。 | Import Profile Service |
| S11-02 | 粘贴有首条 User Message 的文本，再粘贴无法识别角色的文本。 | 标题先取 User 内容前 30 字；无法解析时取原文首个非空行。 | 是：回退顺序或截断错误。 | Smart Title |
| S11-03 | 自动标题出现后手动修改，再继续编辑原文。 | 手动标题保持不变，不被后续自动建议覆盖。 | 是：用户输入被重置。 | Clipboard Import UI |
| S11-04 | 粘贴可识别的多轮对话。 | 导入前显示预计 Message 总数、User / Assistant / Unknown 数量及前三条 Message。 | 是：统计或预览与落盘不一致。 | Import Preview |
| S11-05 | 使用 Plain Text 或让 Unknown 超过总数一半。 | 显示“当前文本可能无法准确识别对话轮次，但仍会保留原文。” | 是：阈值或提示缺失。 | Import Preview QA |
| S11-06 | 完成 Clipboard Import。 | 成功摘要显示 title、sourceType、message count、unknown count 和“进入 Conversation”按钮。 | 是：结果摘要缺字段。 | Import Result |
| S11-07 | 进入新导入的 Conversation Detail。 | 显示 Import Profile 名称与说明；重新生成 Messages 仍使用该 Profile。 | 是：Profile 未持久化或重解析漂移。 | Conversation Detail |
| S11-08 | 返回 Dashboard 查看 Recent Imports。 | 新记录明确显示 sourceType 与 message count，数量与详情一致。 | 是：Dashboard 统计不同步。 | Dashboard |
| S11-09 | 粘贴 JSON 字符串或普通无标记文本。 | 只按纯文本处理，不读取 JSON 结构；原文完整保留。 | 是：越界实现 JSON 导入或丢失原文。 | Import Boundary |

## Conversation

| ID | 操作 | 预期结果 | 是否可能失败 | 失败模块 |
| --- | --- | --- | --- | --- |
| CON-01 | 在 `/conversation` 创建 Conversation。 | 必须填写标题；成功后打开详情，来源类型正确。 | 是：空标题提交或来源错误。 | Conversation Create |
| CON-02 | 点击标题重命名，输入新标题后按 Enter 或失焦。 | 标题被保存，刷新后仍存在。 | 是：只更新 UI 未持久化。 | Conversation Detail |
| CON-03 | 重命名时清空标题或按 Escape。 | 空标题恢复原值；Escape 取消修改。 | 是：标题被清空。 | Conversation Rename |
| CON-04 | 修改原始文本并等待约 800ms。 | 状态从 `Editing...` 变为 `Saved`；统计和时间更新，刷新后内容保留。 | 是：防抖或保存失败。 | Conversation Autosave |
| CON-05 | 复制包含 Source、Messages、Proposal 的 Conversation。 | 生成独立副本，关联实体使用新 ID，原记录不变。 | 是：副本引用仍指向原记录。 | Conversation Workspace Service |
| CON-06 | 删除 Conversation 时取消确认。 | Conversation 及其关联数据不变。 | 是：取消后仍删除。 | Conversation Delete |
| CON-07 | 确认删除测试 Conversation。 | 提示影响 Source、Messages、Proposal、KnowledgeCard、AnalyzerRun；确认后全部级联删除。 | 是：残留孤儿数据或误删其他数据。 | Conversation Workspace Service |
| CON-08 | 查看 Conversation Card 和详情统计。 | 来源、Message、Proposal、Knowledge 数量与实际一致。 | 是：计数遗漏。 | Conversation Statistics |
| CON-09 | 打开不存在的 Conversation URL。 | 显示“不存在”页面和返回入口，不崩溃。 | 是：空引用异常。 | Conversation Routing |

## Messages

| ID | 操作 | 预期结果 | 是否可能失败 | 失败模块 |
| --- | --- | --- | --- | --- |
| MSG-01 | 使用 `用户：`、`我:`、`User:`、`You:` 解析。 | 均识别为 User，内容和顺序正确。 | 是：角色映射错误。 | Message Parser |
| MSG-02 | 使用 ChatGPT、GPT、Assistant、Claude、AI、Gemini、DeepSeek 标记。 | 均识别为 Assistant。 | 是：别名或大小写解析错误。 | Message Parser |
| MSG-03 | 混用中英文冒号和大小写。 | 正常切分，不丢字符。 | 是：正则边界错误。 | Message Parser |
| MSG-04 | 在三反引号代码块中加入 `User:`、`Assistant:`。 | 代码块内部标记不产生新 Message，代码完整保留。 | 是：代码块被错误切分。 | Message Parser |
| MSG-05 | 输入完全无角色标记的文本。 | 生成一条 Unknown Message，并保留全文。 | 是：不生成或丢失文本。 | Message Parser |
| MSG-06 | 原文为空或只有空白。 | “生成 Messages”按钮不可用。 | 是：生成空 Message。 | Conversation Messages UI |
| MSG-07 | 已存在 Messages 时再次生成并取消确认。 | 原 Messages、ID 和关联 Proposal 不变。 | 是：取消仍覆盖。 | Message Replacement |
| MSG-08 | 已存在 Messages 时确认覆盖。 | 新时间线替换旧时间线，选择数清零。 | 是：旧消息残留。 | Message Storage |
| MSG-09 | 执行单选、多选、全选和清空选择。 | 选中计数准确；未选择时生成 Proposal 按钮不可用。 | 是：选择状态不同步。 | Message Selection |
| MSG-10 | 打乱勾选顺序后生成 Proposal。 | Evidence 和 Message ID 按原始 `order` 排列，而不是勾选顺序。 | 是：证据顺序错误。 | Analyzer Provider |

## Proposal / Analyzer

| ID | 操作 | 预期结果 | 是否可能失败 | 失败模块 |
| --- | --- | --- | --- | --- |
| PRO-01 | 使用 Demo 从完整 Source 生成 Proposal。 | 新增 Pending Proposal，AnalyzerRun 为 success。 | 是：未生成或重复写入。 | Analyzer Execution |
| PRO-02 | 使用 Demo 从选中 Messages 生成 Proposal。 | `analysisMode=messages`，Message 数、引用和 Evidence 正确。 | 是：来源引用缺失。 | Messages Analyzer |
| PRO-03 | 查看 Proposal 详情。 | 显示 Provider、Capability、生成时间、来源类型、confidence、risk、suggested action 和 Evidence。 | 是：元数据缺失。 | Proposal Workspace |
| PRO-04 | 连续生成多个 Proposal。 | 全部保留并按创建时间倒序显示。 | 是：覆盖旧 Proposal。 | Proposal Storage |
| PRO-05 | Demo 下点击“模拟失败”。 | AnalyzerRun 为 failed；显示错误和 Retry；Proposal 数不增加。 | 是：失败仍写 Proposal。 | Analyzer Safety |
| PRO-06 | 对可恢复失败点击 Retry。 | 使用同一 Source 或 Message IDs 重试，成功后生成 Proposal。 | 是：重试来源改变。 | Analyzer Retry |
| PRO-07 | 编辑尚未自动保存的 Source。 | `Editing...` 期间 Source 分析按钮不可用。 | 是：分析了旧内容。 | Conversation / Analyzer UI |
| PRO-08 | 删除未生成 Knowledge 的 Proposal，分别取消和确认。 | 取消不变；确认后只删除目标 Proposal。 | 是：取消无效或误删。 | Proposal Workspace |
| PRO-09 | 删除已生成 KnowledgeCard 的 Proposal。 | KnowledgeCard 保留，并可继续查看生成时的 Evidence 快照。 | 是：知识卡被级联删除。 | Proposal / Knowledge Integrity |
| PRO-10 | 打开没有 Proposal 的 `/review`。 | 显示未找到提示和返回 Analysis 入口。 | 是：页面异常。 | Review Routing |

## Review

| ID | 操作 | 预期结果 | 是否可能失败 | 失败模块 |
| --- | --- | --- | --- | --- |
| REV-01 | 从指定 Proposal 点击“前往 Review”。 | 打开正确 Proposal，而不是仅打开最近一条。 | 是：proposalId 路由错误。 | Review Page |
| REV-02 | 核对 Messages Proposal 的来源。 | 显示所属 Conversation、选中 Messages、数量和 Evidence。 | 是：引用内容不一致。 | Review / Message Storage |
| REV-03 | 拒绝 Pending Proposal。 | 状态变为 Rejected，操作按钮禁用，不创建 KnowledgeCard。 | 是：错误创建 Knowledge。 | Proposal Review Service |
| REV-04 | 接受 Pending Proposal。 | 创建一张 KnowledgeCard，Proposal 变为 Applied，并跳转知识详情。 | 是：状态不同步。 | Review / Knowledge Creation |
| REV-05 | 重复访问已处理 Proposal。 | 不创建第二张 KnowledgeCard，按钮显示已处理状态。 | 是：重复知识卡。 | Knowledge Creation Service |
| REV-06 | 原 Message 被覆盖或删除后打开 Review。 | 显示缺失 Message 数，Evidence 快照仍可读。 | 是：页面崩溃或证据消失。 | Review Source Integrity |

## Knowledge

| ID | 操作 | 预期结果 | 是否可能失败 | 失败模块 |
| --- | --- | --- | --- | --- |
| KNO-01 | 打开新生成的 KnowledgeCard。 | 标题、摘要、内容、Source、Conversation、Messages、Provider 和 Capability 快照正确。 | 是：快照缺失。 | Knowledge Creation |
| KNO-02 | 编辑标题、摘要和内容后保存并刷新。 | 显示未保存/已保存状态，刷新后修改保留。 | 是：编辑未持久化。 | Knowledge Detail |
| KNO-03 | 切换为 Archived 并保存。 | 默认 Active 列表不再显示，Archived 筛选可找到。 | 是：状态或筛选错误。 | Knowledge Status |
| KNO-04 | 恢复为 Active。 | Active 筛选重新显示该卡片。 | 是：归档状态错误。 | Knowledge Status |
| KNO-05 | 搜索标题、摘要、内容或来源。 | 匹配项正确，大小写不敏感。 | 是：搜索字段遗漏。 | Knowledge Search |
| KNO-06 | 测试最新、最早、标题 A-Z 排序。 | 排序结果符合选择。 | 是：日期或中文排序错误。 | Knowledge List |
| KNO-07 | 创建超过 6 条匹配知识并翻页。 | 每页最多 6 条，上下页和页码正确。 | 是：分页越界。 | Knowledge Pagination |
| KNO-08 | 删除原 Message 后查看知识卡。 | 提示原 Message 不可用，同时展示 Evidence 快照。 | 是：来源质量提示缺失。 | Knowledge Source Integrity |
| KNO-09 | 点击彻底删除，分别取消和确认。 | 取消不删除；确认后从知识库移除，旧 URL 显示不存在。 | 是：确认失效。 | Knowledge Delete |

## Tag

| ID | 操作 | 预期结果 | 是否可能失败 | 失败模块 |
| --- | --- | --- | --- | --- |
| TAG-01 | 创建带名称和可选颜色的 Tag。 | Tag 出现在列表，颜色和时间正确。 | 是：颜色或名称保存失败。 | Tag Management |
| TAG-02 | 创建空名称或仅空格名称。 | 显示校验错误，不创建 Tag。 | 是：空 Tag 被创建。 | Tag Validation |
| TAG-03 | 创建大小写不同但同名的 Tag。 | 显示“已存在同名 Tag”。 | 是：重复 Tag。 | Tag Management |
| TAG-04 | 编辑 Tag 名称和颜色并保存。 | Tag 列表及 Knowledge 中同步更新。 | 是：关联处仍显示旧值。 | Tag Storage |
| TAG-05 | 在 Knowledge 详情添加、移除及快速新建 Tag。 | 选择状态变化，保存后刷新仍保留。 | 是：未保存或重复关联。 | Knowledge Tag Association |
| TAG-06 | 使用 All、Untagged 和指定 Tag 筛选 Knowledge。 | 结果数量与关联关系一致。 | 是：筛选错误。 | Knowledge Tag Filter |
| TAG-07 | 删除未使用 Tag。 | 确认后只删除 Tag。 | 是：误删知识卡。 | Tag Delete |
| TAG-08 | 删除已关联 Tag。 | 提示受影响 Knowledge 数；删除后解除全部关联，但 KnowledgeCard 保留。 | 是：残留 tagId 或误删知识。 | Tag Management Service |

## Provider

| ID | 操作 | 预期结果 | 是否可能失败 | 失败模块 |
| --- | --- | --- | --- | --- |
| PRV-01 | 打开 `/settings`。 | 显示 Demo、OpenAI、Claude、Gemini、Ollama、DeepSeek、Azure OpenAI 配置。 | 是：默认配置缺失。 | Provider Configuration |
| PRV-02 | 首次进入或当前配置不可用时检查当前 Provider。 | Demo 为可用默认回退。 | 是：没有可用 Provider。 | Provider Registry |
| PRV-03 | 选择 Demo 并刷新。 | Demo 仍为当前 Provider。 | 是：选择未持久化。 | Provider Service |
| PRV-04 | 点击未实现的云 Provider。 | 显示“尚未实现”，不得成为当前 Provider。 | 是：错误启用真实云调用。 | Provider Safety |
| PRV-05 | 对 Demo 执行 Test Connection。 | 返回 Success，并保存 Last Test 时间。 | 是：状态未保存。 | Provider Connection Test |
| PRV-06 | 对云 Provider 执行 Test Connection。 | 返回 Not Implemented，不发起真实请求或要求 API Key。 | 是：越过产品边界。 | Provider Safety |
| PRV-07 | 检查 Capability Badge。 | Settings、Conversation、Proposal、Review、Knowledge 的能力显示一致。 | 是：能力快照错配。 | Provider Capability |
| PRV-08 | 点击 Reset Analyzer Templates。 | 恢复 Source/Messages 默认模板，模板保持只读。 | 是：模板丢失。 | Prompt Template Service |
| PRV-09 | 刷新 Dashboard。 | Current Provider 和 Last Test 与 Settings 一致。 | 是：跨页面状态不同步。 | Dashboard / Provider Storage |

## Ollama

| ID | 操作 | 预期结果 | 是否可能失败 | 失败模块 |
| --- | --- | --- | --- | --- |
| OLL-01 | 检查默认配置。 | 默认关闭；地址为 `http://localhost:11434`，模型为 `qwen2.5:7b`，超时为 60000ms。 | 是：默认值或旧数据归一化错误。 | Ollama Configuration |
| OLL-02 | 保存末尾带 `/` 的合法 Base URL。 | 保存后自动去除尾部 `/`。 | 是：生成重复斜线 URL。 | Provider Configuration Service |
| OLL-03 | 输入非 HTTP URL、空模型或小于 1000ms 的超时。 | 显示对应校验错误，不保存无效配置。 | 是：校验绕过。 | Ollama Validation |
| OLL-04 | 未启动 Ollama 时 Test Connection。 | 显示 Failed、具体原因和排查提示，Last Test 更新。 | 是：无反馈或错误显示 Success。 | Ollama Connection Test |
| OLL-05 | 启动服务但配置不存在的模型后测试。 | 显示模型不可用或连接失败信息。 | 是：只测服务未测模型。 | Ollama Connection Test |
| OLL-06 | 服务及模型正常时 Test Connection。 | 显示 Success，Last Test 时间持久化。 | 是：CORS、地址、模型或网络问题。 | Ollama Connection Test |
| OLL-07 | 启用并选择 Ollama，刷新页面。 | Ollama 仍为当前 Provider。 | 是：enabled 与 current 不一致。 | Provider Registry |
| OLL-08 | 使用 Ollama 从 Source 生成 Proposal。 | 发起非流式本地请求；输出通过结构校验后才写入 Pending Proposal。 | 是：请求或输出校验失败。 | Ollama Provider |
| OLL-09 | 使用 Ollama 从选中 Messages 生成 Proposal。 | Message 顺序、引用、Evidence 和 Provider 元数据正确。 | 是：Messages 请求组装错误。 | Ollama Provider |
| OLL-10 | 关闭 Ollama 服务后执行分析。 | 显示可恢复错误、Retry 和切回 Demo 提示；Proposal 数不增加。 | 是：失败写入 Proposal。 | Analyzer Safety |
| OLL-11 | 制造请求超时。 | 到达配置超时后终止请求并显示超时错误，不写 Proposal。 | 是：请求长期挂起。 | Ollama Timeout |
| OLL-12 | 让 Ollama 返回非法 JSON、空内容或字段越界。 | 记录输出校验失败，不写 Proposal。 | 是：非法结果被接受。 | Output Validator |
| OLL-13 | 当前为 Ollama 时关闭其 enabled。 | 当前 Provider 自动回退 Demo，刷新后仍为 Demo。 | 是：仍引用禁用 Provider。 | Provider Fallback |

## Dashboard / Search

| ID | 操作 | 预期结果 | 是否可能失败 | 失败模块 |
| --- | --- | --- | --- | --- |
| DSH-01 | 打开 Dashboard Recent Imports。 | 显示最近导入的来源、字符数、Message 数和创建时间。 | 是：导入记录缺失。 | Dashboard |
| DSH-02 | 核对 Dashboard 总数。 | Conversation、Message、Proposal、Knowledge 数量与各列表一致。 | 是：统计口径错误。 | Dashboard |
| SEA-01 | 搜索 Conversation 标题。 | 返回正确 Conversation 并可打开。 | 是：索引遗漏。 | Global Search |
| SEA-02 | 搜索 Proposal 标题或摘要。 | 返回正确 Proposal。 | 是：Proposal 映射错误。 | Global Search |
| SEA-03 | 搜索 Knowledge 内容。 | 返回正确 KnowledgeCard。 | 是：内容字段遗漏。 | Global Search |
| SEA-04 | 搜索无结果、空格及大小写变体。 | 空结果提示正常，页面不报错。 | 是：查询归一化错误。 | Global Search |

## Smoke Test Checklist

| ID | 操作 | 预期结果 | 是否可能失败 | 失败模块 |
| --- | --- | --- | --- | --- |
| SMK-01 | 打开 Dashboard、Import、Conversation、Review、Knowledge、Tags、Search、Settings。 | 所有主页面可加载，无白屏。 | 是。 | Routing / App |
| SMK-02 | Clipboard 导入一段有效对话。 | 创建 Conversation 并显示导入成功提示。 | 是。 | Import |
| SMK-03 | 从原文生成 Messages。 | 时间线角色、顺序和内容正确。 | 是。 | Messages |
| SMK-04 | 选择 Messages，使用 Demo 生成 Proposal。 | 新增 Pending Proposal。 | 是。 | Analyzer / Proposal |
| SMK-05 | 打开 Review 并接受 Proposal。 | 生成唯一 KnowledgeCard。 | 是。 | Review |
| SMK-06 | 编辑并保存 KnowledgeCard。 | 刷新后修改保留。 | 是。 | Knowledge |
| SMK-07 | 创建 Tag 并关联 Knowledge。 | Tag 可显示、可筛选。 | 是。 | Tag |
| SMK-08 | 从 Source 生成第二个 Proposal。 | Source 老流程仍可用。 | 是。 | Analyzer |
| SMK-09 | Demo 模拟失败并 Retry。 | 失败不写 Proposal，Retry 可恢复。 | 是。 | Analyzer Safety |
| SMK-10 | 测试 Demo Connection。 | 返回 Success。 | 是。 | Provider |
| SMK-11 | Ollama 不可达时执行测试或分析。 | 显示错误，不新增 Proposal。 | 是。 | Ollama |
| SMK-12 | 刷新浏览器并复核全链路数据。 | Conversation、Messages、Proposal、Knowledge、Tag 均持久化。 | 是。 | BrowserStorage |

## Regression Test Checklist

| ID | 操作 | 预期结果 | 是否可能失败 | 失败模块 |
| --- | --- | --- | --- | --- |
| REG-01 | TXT 导入并保存到新/已有 Conversation。 | Sprint1 TXT 流程保持可用。 | 是。 | TXT Import |
| REG-02 | 执行 Source → Demo Proposal → Review → Knowledge。 | Sprint1 主闭环完整。 | 是。 | Core Knowledge Flow |
| REG-03 | 创建、重命名、自动保存 Conversation。 | Sprint2 编辑能力正常。 | 是。 | Conversation |
| REG-04 | 复制 Conversation。 | 副本引用独立完整。 | 是。 | Workspace Service |
| REG-05 | 级联删除 Conversation。 | 只删除目标工作区及关联实体。 | 是。 | Workspace Service |
| REG-06 | 查看 Dashboard 统计和最近打开。 | 数量和时间正确。 | 是。 | Dashboard |
| REG-07 | 全局搜索三类实体。 | 结果类型和跳转正确。 | 是。 | Search |
| REG-08 | Message 多选生成 Proposal。 | Sprint4 流程正常。 | 是。 | Messages |
| REG-09 | 检查多 Proposal 列表、详情和删除。 | 不覆盖、不误删。 | 是。 | Proposal |
| REG-10 | 检查 Pending、Rejected、Applied 状态。 | Proposal 状态转换合法。 | 是。 | Review |
| REG-11 | 测试 Knowledge 搜索、排序、分页和归档。 | 列表行为正确。 | 是。 | Knowledge |
| REG-12 | 测试 Tag CRUD 和 Knowledge 关联。 | 计数、筛选和解除关联正确。 | 是。 | Tag |
| REG-13 | 测试 Provider 选择和 Demo 回退。 | 无真实云调用。 | 是。 | Provider |
| REG-14 | 重置 Prompt Template。 | 默认模板恢复。 | 是。 | Analyzer Template |
| REG-15 | 测试 AnalyzerRun 错误和 Retry。 | 失败隔离有效。 | 是。 | Analyzer Safety |
| REG-16 | 检查 Proposal/Knowledge Capability 快照。 | 后续配置变化不破坏历史快照。 | 是。 | Capability |
| REG-17 | 测试 Ollama 配置、连接、Source/Messages 分析。 | Sprint9 功能正常。 | 是。 | Ollama |
| REG-18 | 刷新页面和重启浏览器。 | 本地数据及当前 Provider 保留。 | 是。 | BrowserStorage |

## Edge Case Checklist

| ID | 操作 | 预期结果 | 是否可能失败 | 失败模块 |
| --- | --- | --- | --- | --- |
| EDGE-01 | 导入标题前后带大量空格。 | 保存为 trim 后的标题。 | 是。 | Clipboard Import |
| EDGE-02 | 导入只包含 Emoji、中日韩文字或特殊符号的文本。 | 内容完整保存，字符统计不导致页面异常。 | 是。 | Import / Encoding |
| EDGE-03 | 导入超过 1000 字的文本。 | 全文保存，Preview 只显示前 1000 字。 | 是。 | Import Preview |
| EDGE-04 | 导入接近 LocalStorage 配额的超大文本。 | 失败时显示友好错误，不静默清空已有数据。 | 是。 | BrowserStorage |
| EDGE-05 | 使用 CRLF、LF 和混合换行文本。 | 行数和 Message 内容合理一致。 | 是。 | Text Normalization |
| EDGE-06 | 角色标记前有空格或使用大小写变体。 | 仍能识别角色。 | 是。 | Message Parser |
| EDGE-07 | 角色名出现在普通句子中而不是行首。 | 不错误切分。 | 是。 | Message Parser |
| EDGE-08 | 使用未闭合三反引号代码块。 | 后续内容继续受代码块保护，不错误切分。 | 是。 | Message Parser |
| EDGE-09 | 角色标记后没有内容。 | 不产生无内容 Message，后续内容仍正确归属。 | 是。 | Message Parser |
| EDGE-10 | 覆盖已被 Proposal 引用的 Messages。 | Proposal/Knowledge Evidence 快照仍可用，并提示原 Message 缺失。 | 是。 | Source Integrity |
| EDGE-11 | 快速重复点击接受同一 Proposal。 | 最多生成一张 KnowledgeCard。 | 是。 | Review Idempotency |
| EDGE-12 | 删除 Proposal 后访问原 Review URL。 | 显示未找到，不崩溃。 | 是。 | Review Routing |
| EDGE-13 | Tag 使用仅空格、超长名称或大小写重复名称。 | 空值和重复值被拒绝，长名称不破坏布局。 | 是。 | Tag Validation / UI |
| EDGE-14 | Ollama 返回 HTTP 4xx/5xx。 | 展示状态码和错误，不写 Proposal。 | 是。 | Ollama Provider |
| EDGE-15 | Ollama 返回 confidence 越界或非法枚举。 | Validator 拒绝输出，不写 Proposal。 | 是。 | Output Validator |
| EDGE-16 | 禁用当前 Ollama 后立即分析。 | 使用 Demo 回退，不继续请求 Ollama。 | 是。 | Provider Registry |
| EDGE-17 | 打开不存在的 Conversation/Knowledge ID。 | 显示 Not Found 和返回入口。 | 是。 | Routing |
| EDGE-18 | 浏览器禁用或写满 LocalStorage。 | Import 显示保存失败，已有数据不被静默清空。 | 是。 | BrowserStorage |
