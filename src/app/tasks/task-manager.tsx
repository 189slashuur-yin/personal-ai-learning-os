"use client";

import { type FormEvent, useEffect, useState } from "react";
import { TaskSourceDetails } from "@/app/task-source-details";
import {
  taskPriorities,
  taskTypes,
  type Task,
  type TaskPriority,
  type TaskType,
} from "@/core/entities/task";
import type { Workspace } from "@/core/entities/workspace";
import { TaskService } from "@/core/services/task-service";
import { WorkspaceService } from "@/core/services/workspace-service";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserMessageStorage } from "@/infrastructure/storage/browser-message-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserTaskStorage } from "@/infrastructure/storage/browser-task-storage";
import { BrowserWorkspaceStorage } from "@/infrastructure/storage/browser-workspace-storage";

const taskViews = [
  { id: "inbox", label: "Inbox" },
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "completed", label: "Completed" },
  { id: "archived", label: "Archived" },
  { id: "all", label: "All" },
] as const;

type TaskView = (typeof taskViews)[number]["id"];

type TaskItem = Task & {
  sourceMissing: boolean;
  sourceCurrentTitle?: string;
  workspaceName: string;
};

type TaskViewData = {
  tasksByView: Record<TaskView, TaskItem[]>;
  workspaces: Workspace[];
};

function createTaskService() {
  return new TaskService(
    new BrowserTaskStorage(),
    new BrowserWorkspaceStorage(),
  );
}

function loadTaskView(): TaskViewData {
  const taskStorage = new BrowserTaskStorage();
  const workspaceStorage = new BrowserWorkspaceStorage();
  const taskService = new TaskService(taskStorage, workspaceStorage);
  const workspaces = new WorkspaceService(
    workspaceStorage,
    new BrowserConversationStorage(),
    taskStorage,
  ).listWorkspaces();
  const workspaceById = new Map(
    workspaces.map((workspace) => [workspace.id, workspace]),
  );
  const sourceStorages = {
    conversations: new BrowserConversationStorage(),
    knowledgeCards: new BrowserKnowledgeCardStorage(),
    messages: new BrowserMessageStorage(),
    proposals: new BrowserProposalStorage(),
    workspaces: workspaceStorage,
  };
  const decorate = (tasks: Task[]): TaskItem[] =>
    tasks.map((task) => {
      const source = taskService.resolveSource(task, sourceStorages);
      return {
        ...task,
        sourceMissing: source.missing,
        sourceCurrentTitle: source.currentTitle,
        workspaceName:
          workspaceById.get(task.workspaceId ?? "inbox")?.name ?? "Inbox",
      };
    });

  return {
    workspaces: workspaces.filter((workspace) => !workspace.archivedAt),
    tasksByView: {
      inbox: decorate(taskService.listByStatus("inbox")),
      today: decorate(taskService.listToday()),
      upcoming: decorate(taskService.listUpcoming()),
      completed: decorate(taskService.listByStatus("completed")),
      archived: decorate(taskService.listByStatus("archived")),
      all: decorate(taskService.listTasks()),
    },
  };
}

function formatDate(value?: string, includeTime = false) {
  if (!value) {
    return "—";
  }

  const displayDate = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
  }).format(displayDate);
}

function TaskCard({ item, onChange }: { item: TaskItem; onChange: () => void }) {
  const taskService = createTaskService();

  function remove() {
    if (!window.confirm(`永久删除 Task「${item.title}」？来源内容不会被删除。`)) {
      return;
    }
    taskService.deleteTask(item.id);
    onChange();
  }

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-zinc-950">{item.title}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            {item.description ?? "No description"}
          </p>
        </div>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">{item.priority}</span>
      </div>

      <dl className="mt-4 grid gap-2 text-xs text-zinc-500 sm:grid-cols-2">
        <div><dt className="inline font-medium text-zinc-700">Status：</dt><dd className="inline">{item.status}</dd></div>
        <div><dt className="inline font-medium text-zinc-700">Type：</dt><dd className="inline">{item.type}</dd></div>
        <div><dt className="inline font-medium text-zinc-700">Priority：</dt><dd className="inline">{item.priority}</dd></div>
        <div><dt className="inline font-medium text-zinc-700">Due Date：</dt><dd className="inline">{formatDate(item.dueDate)}</dd></div>
        <div><dt className="inline font-medium text-zinc-700">Workspace：</dt><dd className="inline">{item.workspaceName}</dd></div>
        <div><dt className="inline font-medium text-zinc-700">Created：</dt><dd className="inline">{formatDate(item.createdAt, true)}</dd></div>
        <div className="sm:col-span-2"><dt className="inline font-medium text-zinc-700">Updated：</dt><dd className="inline">{formatDate(item.updatedAt, true)}</dd></div>
      </dl>

      <TaskSourceDetails
        currentTitle={item.sourceCurrentTitle}
        sourceMissing={item.sourceMissing}
        task={item}
      />

      <div className="mt-4 flex flex-wrap gap-3 border-t border-zinc-100 pt-4 text-sm font-medium">
        {item.status === "completed" ? (
          <button className="text-emerald-700 hover:text-emerald-900" onClick={() => { taskService.reopenTask(item.id); onChange(); }} type="button">Reopen</button>
        ) : item.status === "archived" ? (
          <button className="text-emerald-700 hover:text-emerald-900" onClick={() => { taskService.restoreTask(item.id); onChange(); }} type="button">Restore</button>
        ) : (
          <button className="text-emerald-700 hover:text-emerald-900" onClick={() => { taskService.completeTask(item.id); onChange(); }} type="button">Complete</button>
        )}
        {item.status !== "archived" ? <button className="text-zinc-600 hover:text-zinc-950" onClick={() => { taskService.archiveTask(item.id); onChange(); }} type="button">Archive</button> : null}
        <button className="text-red-600 hover:text-red-800" onClick={remove} type="button">Delete</button>
      </div>
    </article>
  );
}

export function TaskManager() {
  const [data, setData] = useState<TaskViewData | null>(null);
  const [view, setView] = useState<TaskView>("inbox");
  const [workspaceFilter, setWorkspaceFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | TaskType>("all");
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [workspaceId, setWorkspaceId] = useState("inbox");
  const [type, setType] = useState<TaskType>("todo");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    setData(loadTaskView());
  }

  useEffect(() => {
    const timer = window.setTimeout(reload, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    try {
      createTaskService().createTask({
        title,
        dueDate,
        workspaceId,
        type,
        priority,
        sourceRef: { type: "manual", titleSnapshot: title.trim() },
      });
      setTitle("");
      setDueDate("");
      setError(null);
      setNotice("Task 已创建。");
      reload();
    } catch {
      setError("Task 标题不能为空，且浏览器必须允许本地保存。");
    }
  }

  if (!data) {
    return <p className="mt-8 text-sm text-zinc-500" role="status">正在读取 Tasks…</p>;
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const tasks = data.tasksByView[view].filter((task) => {
    const matchesSearch = !normalizedQuery || `${task.title} ${task.description ?? ""}`.toLocaleLowerCase().includes(normalizedQuery);
    return matchesSearch &&
      (workspaceFilter === "all" || task.workspaceId === workspaceFilter) &&
      (priorityFilter === "all" || task.priority === priorityFilter) &&
      (typeFilter === "all" || task.type === typeFilter);
  });

  return (
    <div className="mt-8 space-y-8">
      <form className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5" onSubmit={createTask}>
        <label className="text-sm font-medium text-zinc-700 lg:col-span-2">Create Task<input className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5" onChange={(event) => setTitle(event.target.value)} placeholder="Task title" value={title} /></label>
        <label className="text-sm font-medium text-zinc-700">Due Date<input className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5" onChange={(event) => setDueDate(event.target.value)} type="date" value={dueDate} /></label>
        <label className="text-sm font-medium text-zinc-700">Workspace<select className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5" onChange={(event) => setWorkspaceId(event.target.value)} value={workspaceId}>{data.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>
        <div className="flex items-end"><button className="w-full rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300" disabled={!title.trim()} type="submit">Create</button></div>
        <label className="text-sm font-medium text-zinc-700">Type<select className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5" onChange={(event) => setType(event.target.value as TaskType)} value={type}>{taskTypes.map((taskType) => <option key={taskType} value={taskType}>{taskType}</option>)}</select></label>
        <label className="text-sm font-medium text-zinc-700">Priority<select className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5" onChange={(event) => setPriority(event.target.value as TaskPriority)} value={priority}>{taskPriorities.map((taskPriority) => <option key={taskPriority} value={taskPriority}>{taskPriority}</option>)}</select></label>
        {notice ? <p className="text-sm text-emerald-700 sm:col-span-2 lg:col-span-3" role="status">{notice}</p> : null}
        {error ? <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-3" role="alert">{error}</p> : null}
      </form>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {taskViews.map((taskView) => <button className={`rounded-lg px-3 py-2 text-sm font-medium ${view === taskView.id ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`} key={taskView.id} onClick={() => setView(taskView.id)} type="button">{taskView.label}</button>)}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium text-zinc-700">Search<input className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5" onChange={(event) => setQuery(event.target.value)} placeholder="Title or description" type="search" value={query} /></label>
          <label className="text-sm font-medium text-zinc-700">Workspace<select className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5" onChange={(event) => setWorkspaceFilter(event.target.value)} value={workspaceFilter}><option value="all">All Workspaces</option>{data.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>
          <label className="text-sm font-medium text-zinc-700">Priority<select className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5" onChange={(event) => setPriorityFilter(event.target.value as "all" | TaskPriority)} value={priorityFilter}><option value="all">All Priorities</option>{taskPriorities.map((taskPriority) => <option key={taskPriority} value={taskPriority}>{taskPriority}</option>)}</select></label>
          <label className="text-sm font-medium text-zinc-700">Type<select className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5" onChange={(event) => setTypeFilter(event.target.value as "all" | TaskType)} value={typeFilter}><option value="all">All Types</option>{taskTypes.map((taskType) => <option key={taskType} value={taskType}>{taskType}</option>)}</select></label>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-zinc-950">{taskViews.find((taskView) => taskView.id === view)?.label} Tasks</h2>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-semibold text-zinc-600">{tasks.length}</span>
        </div>
        {tasks.length ? <div className="mt-4 grid gap-4 lg:grid-cols-2">{tasks.map((task) => <TaskCard item={task} key={task.id} onChange={reload} />)}</div> : <p className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">没有符合当前筛选条件的 Task。</p>}
      </section>
    </div>
  );
}
