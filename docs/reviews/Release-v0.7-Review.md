# Release v0.7 Review

- Review date：2026-07-04
- Release：v0.7 Daily Learning Workflow
- Phase：Phase2
- Review scope：README、ROADMAP、CHANGELOG、HANDOFF、ARCHITECTURE、v0.7 Release Notes 与 Manual QA Checklist

## Review 结论

v0.7 已完成 Epic D 的既定范围，在原有“导入 → 分析 → 人工审核 → 知识沉淀”闭环旁建立了可日常使用的 Task 行动闭环。当前版本适合单人、单浏览器、小数据量的本地学习管理；发布前仍应完成新数据与旧数据两轮手工验收。本文是文档评审，不代表 `docs/QA_CHECKLIST.md` 中的手工用例已经执行。

## 1. v0.7 完成了什么

- 建立独立 Task Domain，覆盖状态、优先级、类型、到期日、Workspace、SourceRef 快照及生命周期时间，并支持创建、完成、重开、归档、恢复和删除。
- 提供 `/today` 日常入口，按 Overdue、Today、Upcoming、Inbox、Completed Today 组织任务，并支持 Workspace 筛选与 Quick Capture。
- 将 `/tasks` 建成完整任务管理页，支持日期视图、Workspace、Priority、Type、标题和描述筛选，以及完整生命周期操作。
- 支持从 Knowledge、Conversation 和选中 Messages 显式创建 Task；来源删除后 Task 仍保留，继续显示标题和摘要快照。
- 将 Task 接入 Search 2.0，覆盖 title、description、SourceRef titleSnapshot 和 summarySnapshot，并提供 Task 类型及 Workspace、status、priority、type 筛选。
- 保持既有知识链路、Workspace 回迁、Conversation Snapshot、Provider 安全边界和旧 LocalStorage 数据兼容；没有引入云 Provider、数据库或自动化 Task 决策。

## 2. 当前核心链路

### 知识沉淀链路

```text
TXT / Clipboard Import
  → Conversation + Source + Messages
  → Demo Provider 或用户显式启用的本地 Ollama
  → Proposal + Evidence + 生成元数据
  → 人工 Review
  → KnowledgeCard + Tags + 来源快照
```

Analyzer 只能生成 Proposal，不能直接创建 KnowledgeCard；接受或拒绝必须由用户完成。Provider 或结构校验失败时记录 AnalyzerRun，但不写入 Proposal。

### 日常行动链路

```text
Quick Capture
或 Knowledge / Conversation / selected Messages
  → Task + Workspace + SourceRef 快照
  → Today / Tasks
  → Complete / Reopen / Archive / Restore / Delete
  → Search 2.0 检索与筛选
```

Task 与知识实体保持独立生命周期。删除 Conversation 或 Knowledge 来源不会级联删除 Task；删除普通 Workspace 时相关 Task 回迁 Inbox。

## 3. 当前可日常使用的流程

1. 在 `/today` 用 Quick Capture 记录临时事项，并通过到期日自动进入 Inbox、Overdue、Today 或 Upcoming。
2. 从 TXT 或剪贴板导入学习材料，在 Conversation 中核对 Messages，选择重要片段生成 Proposal。
3. 在 `/review` 人工接受或拒绝 Proposal；接受后编辑 KnowledgeCard、关联 Tag，并保留证据与 Provider 快照。
4. 从 Knowledge、Conversation 或选中 Messages 创建有来源的 Task，在 `/today` 推进，在 `/tasks` 做完整管理。
5. 使用 `/search` 跨 Conversation、Proposal、Knowledge、Tag、Workspace 和 Task 查找内容，并用 Workspace 或实体专属条件缩小范围。
6. 需要本地模型时，由用户在 Settings 显式配置并启用 Ollama；不可用时可回退 Demo Provider，失败不会产生 Proposal。

这组流程已经能够支持“收集材料—提炼知识—转成行动—当天执行—后续检索”的单设备日常循环。

## 4. 已知限制

- 数据只保存在当前浏览器 LocalStorage，没有正式备份、导出恢复、跨设备同步、数据库或多人协作。
- Workspace 只有单层归属；没有目录树、账号、权限或团队空间。
- Search 与 Task 查询均为同步线性读取，没有索引、相关性评分、Embedding 或 RAG，适合小数据量。
- Task 搜索结果按标题打开 `/tasks?q=...`，不能按 Task ID 精确聚焦；同名 Task 可能同时出现。
- Search URL 只恢复 `q`、`type`、`workspaceId`；Task status、priority、type 不持久化。
- Clipboard Import 只处理纯文本和确定性角色规则，不解析平台 JSON、DOM、附件或复杂嵌套引用。
- 云 Provider 未启用；Ollama 默认关闭，只支持用户显式配置的本地非流式调用。
- Activity、Calendar、Reminder、Recurring Task、Agent、AI Suggest Task、RAG 与自动化均不是 v0.7 能力。

## 5. 技术债

- `package.json` 没有自动化测试脚本，当前回归主要依赖 ESLint、生产构建和篇幅较大的手工 QA 清单；核心生命周期与跨实体删除边界缺少可重复的自动验证。
- LocalStorage 同步读写、容量有限且没有事务；跨多个集合的复制、恢复、级联删除与 Workspace 回迁只能由 Service 编排，异常中断时缺少事务级恢复能力。
- Search 每次从多个 BrowserStorage 集合读取并在线性内存映射；数据量增长后，性能、排序质量和可观测性都会成为瓶颈。
- Task 的搜索跳转和筛选 URL 状态不完整，导致精确定位、刷新恢复和分享当前视图的能力不足。
- SourceRef 采用可失效引用和快照降级，能够保住内容，但当前没有统一的失效引用巡检、修复或数据健康报告。
- 发布质量仍依赖人工在全新数据与历史数据上分别执行兼容回归，缺少固定测试数据集和自动迁移验证。

## 6. v0.8 推荐方向

建议以 Epic E — Knowledge Productivity 为候选主线，但在开发前单独批准范围、数据模型和验收标准。优先级建议如下：

1. **先冻结 Knowledge Productivity 问题定义。** 明确要改善的是复习、组织还是复用，并为日常频率、完成率或检索成功率定义可验收指标。
2. **补最小自动化回归基线。** 优先覆盖 Task 生命周期、Workspace 删除回迁、SourceRef 降级、Conversation Restore 边界、Proposal Review 幂等与旧数据归一化。
3. **改善精确定位和状态恢复。** 评估 Task ID 深链接，以及 Task status、priority、type 的 URL 恢复；这类改动应保持 Search 只读和 Task 独立生命周期。
4. **评估本地数据可恢复性。** 在不预设数据库或云同步的前提下，先定义导出、导入、备份与失败语义，再决定是否实施。
5. **保持范围护栏。** Activity、Agent、RAG、Calendar、Reminder、Recurring Task、云 Provider 和自动化不得因 v0.8 讨论被默认批准。

## 7. 手动验收建议

### 测试轮次

- 第一轮使用全新浏览器配置，验证默认 Inbox、空状态、首次写入和完整主链路。
- 第二轮使用保留 Sprint1–Sprint6 数据的浏览器配置，验证缺失新字段时的兼容读取；开始前备份站点数据。
- Ollama 成功链路只在本地服务和模型就绪时执行；否则至少验证默认关闭、连接失败、非法输出和 Demo 回退路径。

### 发布阻断用例

1. 完整执行 `V07-01` 至 `V07-08`，覆盖导航、Task 日期分区、生命周期、来源降级、Workspace 回迁、Task Search 和发布文档一致性。
2. 回归 Import → Messages → Proposal → Review → KnowledgeCard，并确认同一 Proposal 最多生成一张 KnowledgeCard。
3. 回归 Conversation Snapshot / Restore，确认只恢复 Conversation 与新 ID Messages，不修改 Proposal、Knowledge、AnalyzerRun、Tag、Provider 或 Snapshots。
4. 验证删除 Knowledge、Conversation、Workspace、Proposal、Tag 和 Task 各自的确认提示与跨实体边界，尤其检查 Task 快照和历史 Evidence 是否保留。
5. 验证 Search 的六类实体、最近 12 条、组合筛选、URL 刷新恢复，以及同名 Task 的已知降级行为。
6. 验证 LocalStorage 写满或损坏数据时不静默清空已有内容；所有破坏性测试只在隔离配置中进行。

### 发布判定

- `npm run lint`、`npm run build`、`git diff --check` 全部通过。
- 两轮手工验收没有阻断主链路、数据丢失、越界级联删除、绕过人工 Review 或意外网络调用的问题。
- 非阻断问题记录复现步骤、影响范围和归属版本；若未执行手工验收，则发布状态应明确标记为“自动门禁通过，手工验收待执行”。
