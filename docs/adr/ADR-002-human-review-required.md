# ADR-002: Human Review Required

## Status

Accepted.

## Context

Analyzer 输出可能不完整、误解来源或生成错误内容。若直接修改 Knowledge，错误会被当作用户确认过的长期事实，并削弱来源追溯。

## Decision

任何 Analyzer 都必须实现 `AnalyzerProvider`，并且只能生成带来源与生成元数据的 Proposal。用户必须在 Review 中明确接受，之后才能由 KnowledgeCard Creation Service 创建 KnowledgeCard。Analyzer 不得直接创建或修改 KnowledgeCard，也不得自动接受 Proposal。

v1.0 Phase0 进一步定义 Review 为不可变的 `ReviewDecision`：一个 Proposal 最多有一个终态人工决定。Accepted 仍不自动修改 Knowledge；必须通过幂等 apply 用例创建 Knowledge 或追加 KnowledgeRevision。直接用户编辑可追加 revision，但 Provider/Analyzer 永远不能直接写 Knowledge。详细模型见 RFC-008；该扩展需人工批准后才生效。

## Consequences

用户多一次审核操作，但获得可见的证据、风险判断和最终控制权。未来接入 Real AI、RAG、Memory 或 Agent 时仍保持这一边界，除非经过新的 RFC、风险评审和明确验收。
