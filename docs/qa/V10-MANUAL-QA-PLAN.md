# v1.0 Alpha Manual QA Plan

## Test setup

- 使用可丢弃浏览器 profile；先准备一份 Sprint1–Sprint6/Phase1 旧数据快照。
- 准备一个最小 ChatGPT `conversations.json`、一个包含 unsupported 节点的文件，以及同一 Conversation 的增量版本。
- 不在真实个人数据 profile 上首次执行 App Data Import。

## P0 smoke

1. 打开 `/`、`/import`、`/conversation`、旧 `/conversation/[id]`、`/search`、`/knowledge`、`/settings`。
2. 打开 `/workspace`、`/recipes`、`/feedback`、`/data-health`，确认无白屏。
3. 旧 Conversation 可打开；旧 Message 可读；已有 Round 数量与内容不变。
4. Workspace Mode 可选中 Round，Note/Summary 保存后刷新仍存在。
5. Demo Analyze 成功生成 AI 整理建议；模拟失败显示原因、Retry/Switch Demo/Timeout 提示，且不写 Knowledge。
6. Proposal 接受后生成已确认知识；拒绝与保留不生成 Knowledge。
7. Search Round 结果进入对应 Conversation Workspace Mode 并定位 Round。
8. Settings Export App Data 下载 JSON；Import Preview 显示 keys/counts，取消确认不写入。
9. App Data 导入人为制造失败时，原数据仍可读取。
10. `conversations.json` 首次导入显示 title/message/create/update preview，并创建 Conversation/Messages/Rounds。

## ChatGPT import regression

11. mapping 包含分叉时只线性化 current-node 主分支。
12. user/assistant text 正确排序；system/tool/image 等 unsupported 被计数并跳过，不阻断导入。
13. 重复选择同一 externalConversationId，不创建第二个 PALOS Conversation。
14. 原文件再次导入：existing 等于已有数量，new 为 0，skipped 等于重复数量。
15. 增量文件导入：只 append 新 Message；旧 Message ID/内容不变。
16. external message ID 缺失时，content hash 阻止相同文本重复导入。
17. 增量导入后旧 Rounds、Round Note/Summary、Proposal/Knowledge 关系不变，并显示手动 regenerate 提示。
18. 非 `conversations.json` 文件名、损坏 JSON、非数组顶层均给出错误且不写入。

## Workspace / Knowledge / Asset regression

19. 创建三层 Folder，移动 Conversation，上下排序、归档、恢复。
20. 删除 Folder：Conversation 移到上级或 Inbox，子 Folder 提升，Conversation 不删除。
21. 同一 Round 手动创建多条 Knowledge；Duplicate 后来源 Round 可追溯。
22. Knowledge Update Draft 未确认前不覆盖；确认后 previous content snapshot 可见。
23. Conversation/Round Asset 可 Relink/Mark Missing；删除 metadata 不删除真实文件。
24. Search 显示命中字段、片段、完整 Folder 路径；Message 默认隐藏在 Advanced。

## Export regression

25. Conversation Markdown/JSON 内容包含 Rounds/Messages。
26. Round Markdown、Knowledge Markdown、Workspace/Folder JSON bundle 可打开。
27. App Data 按 Workspaces、Conversations、Rounds/Messages、Proposals、Knowledge、Tags、Tasks、Assets 分组选择。
28. 二次确认前无 PALOS key 被替换；导入后刷新数据一致。

## Security and non-goals

29. 仓库与导出示例不含 API key、token、真实聊天记录或隐私数据。
30. OpenAI/Claude 仍 disabled；ChatGPT Plus 文案不暗示 API 额度。
31. 无 RAG/Embedding/Agent/Calendar/Reminder/Cloud Sync/数据库调用。
32. ChatGPT 附件、图片、tool call、canvas、voice/shared link 不被宣称支持。

## Exit criteria

- P0 全通过；P1 无数据丢失、错误覆盖或安全问题。
- 失败项记录复现步骤、浏览器、数据来源和是否影响旧数据。
- QA 未实际执行前，Release Review 保持 alpha / manual QA pending。
