"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  taskPriorities,
  taskTypes,
  type Task,
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

type TaskItem = Task & {
  sourceMissing: boolean;
  workspaceName: string;
};

type TaskSection = {
  id: string;
  title: string;
  description: string;
  items: TaskItem[];
};

type TaskViewData = {
  sections: TaskSection[];
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
    tasks.map((task) => ({
      ...task,
      sourceMissing: taskService.isSourceMissing(task, sourceStorages),
      workspaceName: workspaceById.get(task.workspaceId ?? "inbox")?.name ?? "Inbox",
    }));

  return {
    workspaces: workspaces.filter((workspace) => !workspace.archivedAt),
    sections: [
      {
        id: "inbox",
        title: "Inbox",
        description: "未指定日期的待办。",
        items: decorate(taskService.listByStatus("inbox")),
      },
      {
        id: "today",
        title: "Today",
        description: "今天到期和已逾期的未完成 Task。",
        items: decorate(taskService.listToday()),
      },
      {
        id: "upcoming",
        title: "Upcoming",
        description: "今天之后到期的 Task。",
        items: decorate(taskService.listUpcoming()),
      },
      {
        id: "completed",
        title: "Completed",
        description: "已经明确完成的 Task。",
        items: decorate(taskService.listByStatus("completed")),
      },
      {
        id: "archived",
        title: "Archived",
        description: "从活动视图移出的 Task。",
        items: decorate(taskService.listByStatus("archived")),
      },
    ],
  };
}

function formatDate(value?: string) {
  if (!value) {
    return "—";
  }

  const displayDate = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
  }).format(displayDate);
}

function TaskCard({
  item,
  onChange,
}: {
  item: TaskItem;
  onChange: () => void;
}) {
  const taskService = createTaskService();

  function complete() {
    taskService.completeTask(item.id);
    onChange();
  }

  function reopen() {
    taskService.reopenTask(item.id);
    onChange();
  }

  function archive() {
    taskService.archiveTask(item.id);
    onChange();
  }

  function restore() {
    taskService.restoreTask(item.id);
    onChange();
  }

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
          <h3 className="font-semibold text-zinc-950">{item.title}</h3>
          {item.description ? (
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              {item.description}
            </p>
          ) : null}
        </div>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">
          {item.priority}
        </span>
      </div>

      <dl className="mt-4 grid gap-2 text-xs text-zinc-500 sm:grid-cols-2">
        <div><dt className="inline font-medium text-zinc-700">Workspace：</dt><dd className="inline">{item.workspaceName}</dd></div>
        <div><dt className="inline font-medium text-zinc-700">Due：</dt><dd className="inline">{formatDate(item.dueDate)}</dd></div>
        <div><dt className="inline font-medium text-zinc-700">Type：</dt><dd className="inline">{item.type}</dd></div>
        <div><dt className="inline font-medium text-zinc-700">Status：</dt><dd className="inline">{item.status}</dd></div>
      </dl>

      <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">
        {item.sourceRef ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-zinc-800">
                SourceRef · {item.sourceRef.type}
              </span>
              {item.sourceMissing ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">
                  source missing
                </span>
              ) : null}
            </div>
            <p className="mt-1 font-medium text-zinc-700">
              {item.sourceRef.titleSnapshot}
            </p>
            {item.sourceRef.summarySnapshot ? (
              <p className="mt-1 leading-5">{item.sourceRef.summarySnapshot}</p>
            ) : null}
            {item.sourceRef.entityId ? (
              <p className="mt-1 break-all text-zinc-400">
                {item.sourceRef.entityId}
              </p>
            ) : null}
          </>
        ) : (
          <p>No SourceRef snapshot</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 border-t border-zinc-100 pt-4 text-sm font-medium">
        {item.status === "completed" ? (
          <button className="text-emerald-700 hover:text-emerald-900" onClick={reopen} type="button">Reopen</button>
        ) : item.status === "archived" ? (
          <button className="text-emerald-700 hover:text-emerald-900" onClick={restore} type="button">Restore</button>
        ) : (
          <button className="text-emerald-700 hover:text-emerald-900" onClick={complete} type="button">Complete</button>
        )}
        {item.status !== "archived" ? (
          <button className="text-zinc-600 hover:text-zinc-950" onClick={archive} type="button">Archive</button>
        ) : null}
        <button className="text-red-600 hover:text-red-800" onClick={remove} type="button">Delete</button>
      </div>
    </article>
  );
}

export function TaskManager() {
  const [data, setData] = useState<TaskViewData | null>(null);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [workspaceId, setWorkspaceId] = useState("inbox");
  const [type, setType] = useState<(typeof taskTypes)[number]>("todo");
  const [priority, setPriority] =
    useState<(typeof taskPriorities)[number]>("medium");
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

    try {
      createTaskService().createTask({
        title,
        dueDate,
        workspaceId,
        type,
        priority,
        sourceRef: {
          type: "manual",
          titleSnapshot: title.trim(),
        },
      });
      setTitle("");
      setDueDate("");
      setError(null);
      reload();
    } catch {
      setError("Task 标题不能为空，且浏览器必须允许本地保存。");
    }
  }

  if (!data) {
    return <p className="mt-8 text-sm text-zinc-500" role="status">正在读取 Tasks…</p>;
  }

  return (
    <div className="mt-8 space-y-10">
      <form className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5" onSubmit={createTask}>
        <label className="text-sm font-medium text-zinc-700 lg:col-span-2">
          快速创建手动 Task
          <input className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5 outline-none focus:border-zinc-500" onChange={(event) => setTitle(event.target.value)} placeholder="例如：整理本周学习笔记" value={title} />
        </label>
        <label className="text-sm font-medium text-zinc-700">
          Due Date
          <input className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5" onChange={(event) => setDueDate(event.target.value)} type="date" value={dueDate} />
        </label>
        <label className="text-sm font-medium text-zinc-700">
          Workspace
          <select className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5" onChange={(event) => setWorkspaceId(event.target.value)} value={workspaceId}>
            {data.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
        </label>
        <div className="flex items-end">
          <button className="w-full rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800" type="submit">Create Task</button>
        </div>
        <label className="text-sm font-medium text-zinc-700">
          Type
          <select className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5" onChange={(event) => setType(event.target.value as typeof type)} value={type}>
            {taskTypes.map((taskType) => <option key={taskType} value={taskType}>{taskType}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-zinc-700">
          Priority
          <select className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5" onChange={(event) => setPriority(event.target.value as typeof priority)} value={priority}>
            {taskPriorities.map((taskPriority) => <option key={taskPriority} value={taskPriority}>{taskPriority}</option>)}
          </select>
        </label>
        {error ? <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-3" role="alert">{error}</p> : null}
      </form>

      {data.sections.map((section) => (
        <section key={section.id}>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-zinc-950">{section.title}</h2>
              <p className="mt-1 text-sm text-zinc-500">{section.description}</p>
            </div>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-semibold text-zinc-600">{section.items.length}</span>
          </div>
          {section.items.length ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {section.items.map((item) => <TaskCard item={item} key={item.id} onChange={reload} />)}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500">这个分区暂无 Task。</p>
          )}
        </section>
      ))}
    </div>
  );
}
