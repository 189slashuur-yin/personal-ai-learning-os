import { WorkspaceManager } from "./workspace-manager";

export default function WorkspacePage() {
  return (
    <main className="workspace-shell">
      <p className="eyebrow">Workspace</p>
      <h1 className="workspace-title">学习空间</h1>
      <p className="workspace-description">
        用单层 Workspace 组织 Conversation。Inbox 始终接住未分类内容和旧数据。
      </p>
      <WorkspaceManager />
    </main>
  );
}
