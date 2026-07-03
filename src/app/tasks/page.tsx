import { TaskManager } from "./task-manager";

export default function TasksPage() {
  return (
    <main className="workspace-shell pb-24">
      <p className="eyebrow">Task Domain Debug</p>
      <h1 className="workspace-title">Tasks</h1>
      <p className="workspace-description">
        用于验证 Task 生命周期、日期分区、Workspace 回迁和来源快照；这不是正式 Today 产品页。
      </p>
      <TaskManager />
    </main>
  );
}
