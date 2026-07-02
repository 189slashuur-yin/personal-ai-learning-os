# Sprint9 Handoff

## 当前状态

截至 2026-07-02，Sprint9A、Sprint9B、Sprint9C 已完成。只接入本地 Ollama，没有接入 OpenAI、Claude 或其它云 Provider，没有保存 API Key、引入数据库或创建 Git commit。Demo Provider 行为保持不变，并继续作为默认回退。

## Part1 — Sprint9A Ollama Provider Adapter

- 新增 `OllamaProvider`，实现 `AnalyzerProvider.providerInfo`、`analyzeSource` 和 `analyzeMessages`。
- AnalyzerProvider Contract 与执行器改为异步，以支持本地 HTTP；Demo 输出逻辑未改变。
- 默认配置为 `http://localhost:11434`、`qwen2.5:7b`、60000 ms，且默认 disabled。
- 使用 Ollama `/api/chat`，固定 `stream: false` 与 JSON 格式；未实现 streaming、embedding 或 tool calling。
- 网络不可达和超时作为 recoverable AnalyzerError，Provider 不依赖或写入 ProposalStorage。
- checkpoint：lint、build、diff-check 通过。

## Part2 — Sprint9B Ollama Settings

- Settings 支持编辑并持久化 Ollama enabled、baseUrl、model、timeout。
- Ollama Test Connection 真实请求配置地址的 `/api/tags`，保存 Success/Failed、时间和错误信息。
- Demo Test Connection 仍为 Success；其它云 Provider 仍为 Not Implemented，且不会发请求。
- 明确展示：`Ollama runs locally and requires Ollama service to be running.`
- checkpoint：lint、build、diff-check 通过。

## Part3 — Sprint9C Use Ollama for Analyzer

- Provider Registry 在 Ollama enabled 时注册 OllamaProvider；禁用或不可用配置会回退 Demo。
- Source Analysis 和 selected Messages Analysis 都支持当前选中的 Ollama。
- Prompt 使用 Sprint7 PromptTemplate；模型 JSON 使用 Sprint7 AnalyzerOutputValidator。
- 非法 JSON 或结构记录 `INVALID_OUTPUT` 并显示错误；页面只在执行器返回 Proposal 后写 ProposalStorage。
- Proposal Workspace、Review 与 KnowledgeCard 继续展示 providerName、generatedAt、analysisMode 和 capabilities 快照。
- checkpoint：lint、build、diff-check 通过；首次 build 暴露 Settings SSR 读取 BrowserStorage，已做一次最小修复后通过。

## 新增文件

- `src/core/services/ollama-provider.ts`

## 修改文件

- Contract / Entity：`src/core/contracts/analyzer-provider.ts`、`src/core/entities/proposal.ts`、`src/core/entities/provider-configuration.ts`
- Service：`src/core/services/analyzer-execution.ts`、`demo-provider.ts`、`provider-configuration-service.ts`、`provider-registry.ts`、`provider-service.ts`
- Storage：`src/infrastructure/storage/browser-provider-configuration-storage.ts`
- UI：Analysis、Conversation Detail、Dashboard、Settings
- 文档：README、PROJECT、ARCHITECTURE、ROADMAP、CHANGELOG、HANDOFF

## 手动验收步骤

1. 启动 Ollama，执行 `ollama pull qwen2.5:7b`，再运行本项目。
2. 打开 `/settings`，确认提示 Ollama 需要本地服务；编辑 baseUrl/model/timeout，启用 Ollama并保存。
3. 点击 Ollama Test Connection，确认服务运行时显示 Success；停止服务后重试，确认显示 Failed 和错误。
4. 确认 Demo Test Connection 为 Success；OpenAI、Claude 等云 Provider 为 Not Implemented 且不产生网络请求。
5. 启用 Ollama 后在顶部 Provider 列表选择 Ollama，刷新页面确认选择保留。
6. 导入 TXT 后进入 `/analysis`，确认当前 Provider 为 Ollama，并能生成带 providerName、generatedAt、analysisMode、capabilities 的 Proposal。
7. 在 Conversation 生成 Messages、选择多条并生成 Proposal，确认 Message 引用和元数据正确。
8. Review 并接受 Proposal，确认 KnowledgeCard 保留 Provider Capability Snapshot。
9. 将 model 改为不存在的模型或让模型返回不合法结构，确认显示错误且 Proposal 数量不增加。
10. 回到 Settings 选择 Demo，确认 Source 与 Messages 两条分析链路仍可运行。

## 已知限制

- 需要用户自行安装、启动 Ollama 并下载所选模型；项目不会管理 Ollama 进程或模型。
- 浏览器必须能够访问配置的 Ollama 地址；Ollama CORS、HTTPS mixed-content、防火墙或代理设置可能阻止请求。
- 不支持 streaming、embedding、tool calling、RAG、自动模型下载或 API Key。
- 结构化输出质量取决于本地模型；Validator 会拒绝不完整或越界字段，但不会自动修复模型输出。
- LocalStorage 仍是单浏览器存储，不具备事务、同步或正式备份恢复。
- 没有自动化测试套件；验收边界为每 Part 的 lint、production build、diff-check 和上述手动流程。

## Ollama 未安装或未启动时的提示

Settings 的 Test Connection 显示 `Failed` 及浏览器返回的连接错误。Analyzer 显示“无法连接 Ollama（配置地址）。请确认本地 Ollama service 已启动。”，运行记录标记为可恢复，允许服务启动后 Retry；不会写入 Proposal。用户也可随时在 Settings 切回 Demo Provider。

## 质量检查

Sprint9A、Sprint9B、Sprint9C 的 `npm run lint`、`npm run build`、`git diff --check` 均通过；文档同步后的最终三项检查也通过。
