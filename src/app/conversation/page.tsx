import { ConversationList } from "./conversation-list";

export default function ConversationPage() {
  return (
    <main className="workspace-shell">
      <p className="eyebrow">Conversation</p>
      <h1 className="workspace-title">对话工作区</h1>
      <p className="workspace-description">
        收集原始内容，在同一个上下文中整理 Proposal 与 Knowledge。
      </p>
      <ConversationList />
    </main>
  );
}
