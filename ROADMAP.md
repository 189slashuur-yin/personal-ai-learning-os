# Roadmap

状态定义：`已完成` 表示能力已在当前 `main` 实现；`未开始` 表示尚无实现承诺。Sprint7–9 的主题是交接建议，开始前需要重新确认范围。

| Sprint | 状态 | 交付范围 |
| --- | --- | --- |
| Sprint1 | 已完成 | Import → Demo Analyzer → Proposal → Review → KnowledgeCard 最小闭环。 |
| Sprint2 | 已完成 | Conversation Workspace：创建、编辑、自动保存、重命名、复制、级联删除与本地统计。 |
| Sprint3 | 已完成 | Search、Dashboard、Knowledge 工作区增强与项目工程文档整理。 |
| Sprint4 | 已完成 | Message Engine、原始文本解析、Message 选择 → Proposal、Conversation Proposal Workspace。 |
| Sprint5 | 已完成 | Tag System、Knowledge Tag 筛选、Proposal 生命周期稳定与来源质量提示。 |
| Sprint6 | 已完成 | AI Provider Interface、Provider Registry/Service、Settings、Analyzer 与 Knowledge 元数据。仅 Demo Provider 可用。 |
| Sprint7 | 未开始 | 建议：存储版本、数据导出/导入、备份恢复与迁移验证。范围待确认。 |
| Sprint8 | 未开始 | 建议：自动化测试、可访问性、错误状态、性能与浏览器兼容性。范围待确认。 |
| Sprint9 | 未开始 | 建议：生产化决策；评估部署与可选真实 Provider。只有安全和产品方案获批后才接入真实 AI。范围待确认。 |

## 已完成里程碑

### Sprint1 — Core Knowledge Flow

- TXT Source 导入与 BrowserStorage。
- Demo Analyzer 生成 Proposal。
- Proposal Review 状态转换。
- Accepted Proposal 创建 KnowledgeCard。

### Sprint2 — Conversation Workspace

- Conversation 创建、列表、详情和 Source 编辑。
- 防抖自动保存、字数统计、最近打开与 inline rename。
- Conversation 复制和关联数据级联删除。

### Sprint3 — Search / Dashboard / Engineering

- Dashboard 本地统计与快捷入口。
- Conversation、Proposal、Knowledge 全局搜索。
- Knowledge 列表、详情、编辑、状态和本地查询体验。
- 项目说明与架构文档、重复文件清理。

### Sprint4 — Message and Proposal Workspace

- 原始文本解析为 Message 时间线。
- Message 多选与基于选中 Messages 生成 Proposal。
- Conversation 内多 Proposal 列表、详情、Review 入口与删除。

### Sprint5 — Tag and Knowledge Quality

- Tag 创建、编辑、删除、计数和 Knowledge 关联。
- Knowledge 按 Tag/未标记状态筛选。
- Proposal 支持 Pending、Accepted、Rejected、Applied。
- Knowledge 保存 Message 来源快照并提示缺失引用。

### Sprint6 — AI Provider Boundary

- `AIProvider` Entity 与 `AnalyzerProvider` Contract。
- Demo Provider、Provider Registry、Provider Service 和当前 Provider 存储。
- Settings 页面展示 Provider 状态；未实现 Provider 保持禁用。
- Proposal 与 Knowledge 增加 Provider、生成时间、分析模式、来源数量和证据元数据。

## 下一 Sprint 开始前

1. 由产品负责人确认 Sprint7–9 的实际范围与验收标准。
2. 不把建议主题视为已批准需求。
3. 保持 Demo Provider 为唯一启用项，除非收到明确的真实 AI 接入任务。
4. 每个 Sprint 完成时同步更新 README、PROJECT、ARCHITECTURE、ROADMAP、CHANGELOG 和 HANDOFF。
