# Product Roadmap Review

## 阶段判断

- Phase1 / MVP：已完成。产品已经验证 Import / Conversation → Source / Message → Proposal → Review → KnowledgeCard 的本地闭环。
- Phase2：当前阶段。重点是 Workspace、Conversation Editing 与 Knowledge Editing，让内容可以长期归属、维护和回看。
- Phase3：未来方向。Real AI、Search 2.0 与 RAG 需要独立评审安全、隐私、费用、数据基础设施和验收方案后才能开始。
- Phase4：未来方向。Memory 与 Agent 只有在知识质量、检索和权限边界成熟后再评估。

## Phase2 的边界

Epic B 只增加单层 Workspace。Workspace 可作为项目、主题或长期学习单元，Conversation 归属其中；不实现多级目录、树形层级、团队权限、团队协作、数据库或云同步。旧 Conversation 没有 `workspaceId` 时归入系统 Inbox，避免破坏已有数据。
