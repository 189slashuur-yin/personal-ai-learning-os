# Project Status

> Historical engineering snapshot captured for v0.6 on 2026-07-03. It is not the current release/domain status. Current runtime is v0.9 draft; v1.0 Phase0 Architecture Freeze candidate is awaiting human approval. See `PROJECT.md` and the Phase0 Freeze Report.

- 统计日期：2026-07-03
- Current Version：v0.6
- Current Phase：Phase2
- Current Epic：Epic C Completed

## Engineering Summary

以下为按职责目录和文件入口统计的近似数量，用于描述 v0.6 工程规模，不代表运行时对象数量或代码行数。

| Category | Approximate Count | Counting Basis |
| --- | ---: | --- |
| Entity | 18 | `src/core/entities` 顶层 TypeScript 文件。 |
| Service | 20 | `src/core/services` 顶层 TypeScript 文件。 |
| Storage | 12 | `src/infrastructure/storage` 顶层 BrowserStorage Adapter 文件。 |
| Page | 12 | `src/app` 下的 `page.tsx` 路由入口。 |
| Documentation | 16 | 仓库 Markdown 文件；包含本次新增的 Release Notes 与 Project Status，不包含依赖目录。 |

## Completed

| Epic | Status | Summary |
| --- | --- | --- |
| Epic A | ✅ Completed | Conversation Editing、Timeline UX、Snapshot 与 Restore。 |
| Epic B | ✅ Completed | Workspace Foundation、Inbox 兼容与 Workspace 集成。 |
| Epic C | ✅ Completed | Search 2.0、结构化过滤与跨页面搜索入口。 |

## Future

| Epic | Status | Summary |
| --- | --- | --- |
| Epic D | ❌ Not Started | 范围与验收标准待产品负责人确认。 |
| Epic E | ❌ Not Started | 范围与验收标准待产品负责人确认。 |
| Epic F | ❌ Not Started | 范围与验收标准待产品负责人确认。 |

未来 Epic 不构成已批准需求。真实云 AI、RAG、数据库、云同步、Memory 或 Agent 等候选方向必须分别评审安全、隐私、成本、数据兼容和验收方案。
