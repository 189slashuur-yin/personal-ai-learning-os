# Sprint10 Clipboard Import Engine Handoff

## 当前状态

截至 2026-07-03，Sprint10A、10B、10C、10D 已连续完成。现有 TXT 导入、Demo Provider、Ollama Provider、Source → Proposal 与人工 Review 边界保持不变；未新增数据库、云 Provider、API Key 或 Git commit。

## Part 1 — Sprint10A Clipboard Import UI

- Import 页面提供 TXT File Import 与 Clipboard Import 两个入口。
- Clipboard Import 支持 Conversation 标题、ChatGPT / Claude / DeepSeek / Gemini / Manual / Plain Text 来源选择、大文本粘贴、字符数、行数与前 1000 字预览。
- 导入只创建 Conversation 并保存原始 Source，随后跳转 Conversation Detail；不生成 Proposal、不调用 AI。
- checkpoint：lint、build、diff-check 通过。

## Part 2 — Sprint10B Conversation Text Parser

- Parser 支持我、用户、User、You、ChatGPT、GPT、Assistant、Claude、AI、Gemini、DeepSeek，以及中英文冒号。
- 三反引号代码块内的发言标记不会触发错误切分。
- 无可识别角色时生成一条 Unknown Message 并保留完整内容；生成结果保持 conversationId、role、content 与 order。
- Conversation Detail 一键生成 Messages；已有 Messages 时必须确认才覆盖。
- checkpoint：lint、build、diff-check 通过。

## Part 3 — Sprint10C Clipboard Import → Analyze Flow

- Conversation Detail 展示原始文本 → Messages → 选择 Messages → Proposal → Review → KnowledgeCard 六步流程。
- 无 Messages 时提示先解析；已有 Messages 时可选择并生成 Proposal。
- 继续复用 Demo / Ollama Provider、AnalyzerRun、Validator、Retry、Provider metadata 和失败不写 Proposal 的安全边界。
- Source → Proposal 老流程保持可用，未新增 Analyzer。
- checkpoint：lint、build、diff-check 通过。

## Part 4 — Sprint10D Import History / UX polish

- Dashboard 增加 Recent Imports，展示来源类型、字符数、Message 数量与创建时间。
- Conversation Card 继续展示 sourceType、Message / Proposal / Knowledge 数量与更新时间。
- Conversation Detail 展示原始文本字符/行数、Message、Proposal 与 Knowledge 统计。
- Clipboard 导入限制空文本，展示友好错误，并在跳转后的详情页显示成功提示。
- README、ROADMAP、CHANGELOG 与 HANDOFF 已同步。

## 新增文件

- `src/app/import/clipboard-import-form.tsx`

## 修改文件

- Entity / Service：`src/core/entities/conversation.ts`、`src/core/services/message-parser.ts`
- UI：`src/app/import/page.tsx`、`src/app/conversation/[id]/page.tsx`、`src/app/conversation/[id]/conversation-detail.tsx`、`src/app/dashboard-overview.tsx`
- 文档：`README.md`、`ROADMAP.md`、`CHANGELOG.md`、`HANDOFF.md`
- 工作区中原有 Sprint9 Stabilization 未提交修改已保留。

## 手动验收步骤

1. 打开 `/import`，确认 TXT File Import 仍可选择文件并保存。
2. 在 Clipboard Import 输入标题，依次确认六种来源可选；粘贴多行文本，核对字符数、行数与 1000 字预览。
3. 验证空文本按钮不可用；导入有效文本后确认跳转详情、显示成功提示，并能在 Dashboard / Conversation List 找到记录。
4. 使用中英文冒号及全部发言标记生成 Messages，核对 role、顺序和内容。
5. 在三反引号代码块中放入 `User:` 或 `Assistant:`，确认不会错误切分；使用无标记文本确认生成一条 Unknown Message 且全文保留。
6. 再次生成 Messages，取消覆盖确认后核对原 Messages 不变；确认覆盖后核对新结果。
7. 选择 Messages，分别用 Demo 与已配置的 Ollama 生成 Proposal；核对 AnalyzerRun、metadata、Validator 与 Retry 行为。
8. 制造 Ollama 失败，确认显示原因、不新增 Proposal，并提示可切回 Demo；完成 Review 后确认 KnowledgeCard 可追溯。
9. 打开 Dashboard，核对 Recent Imports 的来源、字符数、Message 数与创建时间，以及 Conversation Card / Detail 的各项统计。

## 已知限制

- 只解析纯文本发言标记，不支持平台导出 JSON、嵌套引用或消息编辑。
- 三反引号保护按 fence 行切换，不实现完整 Markdown 语法树；未闭合代码块会保护其后的剩余文本。
- LocalStorage 仍受浏览器容量、单设备和无事务限制；大文本可能受浏览器配额影响。
- 项目不管理 Ollama 安装、进程或模型；云 Provider 仍为禁用占位。
- 当前没有自动化测试套件，验收边界为每 Part 的 lint、production build、diff-check 与上述手动流程。

## 是否建议拆分 commit

建议后续由维护者拆为两个 commit：`Sprint10A/B Clipboard Import + Parser` 与 `Sprint10C/D Analyze Flow + UX/docs`。本轮按要求未创建 commit。

## 质量检查

- Sprint10A：lint、build、diff-check 通过。
- Sprint10B：lint、build、diff-check 通过。
- Sprint10C：lint、build、diff-check 通过。
- Sprint10D / 最终检查：lint、build、diff-check 通过。
- 本地 UI smoke test：Import 双入口、64 字符/6 行统计、成功跳转、六步流程、详情统计与代码块保护均通过。

## Manual QA Checklist 文档交接

- 新增 `docs/QA_CHECKLIST.md`，覆盖 Sprint10 新功能与 Sprint1-Sprint9 回归范围。
- 清单重点覆盖 Import、Conversation、Messages、Proposal、Review、Knowledge、Tag、Provider 和 Ollama。
- 每个用例均记录操作、预期结果、失败可能性与失败模块。
- 文档保留独立的 Smoke Test、Regression Test 和 Edge Case Checklist。
- `README.md` 已增加 Manual QA Checklist 入口。
- 本次仅修改文档，未修改业务代码，未创建 Git commit。
- 本次文档交付检查：`npm run lint`、`npm run build`、`git diff --check` 通过。
- 限制：该文件是待执行的手工验收基线，不表示所有 UI 或 Ollama 场景已在本次实际执行。
- 下一步：由 QA 按 Smoke Test 起步，再执行完整 Regression 与 Edge Case；Ollama 成功链路需准备本地服务和模型。
