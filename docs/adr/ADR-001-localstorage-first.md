# ADR-001: LocalStorage First

## Status

Accepted.

## Context

当前产品用于验证单人、单浏览器、单设备的小数据量学习闭环。引入服务端数据库会同时带来账号、部署、迁移、隐私、同步和运维问题，超出 Phase2 的目标。

## Decision

当前继续使用 LocalStorage，并通过 `src/core/contracts` 与 `src/infrastructure/storage` 隔离具体实现。Page、Component 和 Service 不直接访问 `window.localStorage`，也不复制 storage key 或自行解析 JSON。

## Consequences

优点是零后端、低运行成本、数据默认留在浏览器、迭代速度快。限制是容量有限、同步读写、无事务、无自动备份、无跨设备同步。未来更换存储时新增 Contract Adapter 和明确迁移方案，不让持久化细节扩散到 UI。
