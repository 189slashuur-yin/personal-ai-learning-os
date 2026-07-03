import { TaskManager } from "./task-manager";

type TasksPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const { q = "" } = await searchParams;

  return (
    <main className="workspace-shell pb-24">
      <p className="eyebrow">Task Management</p>
      <h1 className="workspace-title">Tasks</h1>
      <p className="workspace-description">
        按日期视图、Workspace、Priority 和 Type 管理 Task，并搜索标题或描述。
      </p>
      <TaskManager initialQuery={q} />
    </main>
  );
}
