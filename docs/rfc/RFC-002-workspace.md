# RFC-002: Workspace Foundation

## Status

Accepted for Epic B.

## Why Workspace

Conversation 需要稳定归属，否则数量增长后只能依赖标题和时间查找。Workspace 提供一个最小、可理解的组织单位，未来可以代表项目、主题或长期学习单元，并为 Dashboard、Search 与 Knowledge 来源展示提供共同上下文。

## Decision

- Workspace 是 Conversation 的单层可选归属。
- 系统首次使用时创建不可删除、不可归档的默认 Workspace：Inbox。
- 旧 Conversation 缺少 `workspaceId` 时在读取和业务判断中视为属于 Inbox。
- 删除普通 Workspace 不删除 Conversation；关联 Conversation 自动回到 Inbox。
- Workspace 支持名称、可选描述、可选颜色、归档和恢复。

## Non-goals

- 不做多级目录或 Workspace 树形层级。
- 不做权限、账号或团队协作。
- 不做数据库、云同步或跨设备合并。

## Compatibility

`Conversation.workspaceId` 保持可选。兼容逻辑由 BrowserStorage 与 WorkspaceService 集中处理，不静默清空或批量改写 Sprint1–Sprint11 的浏览器数据。
