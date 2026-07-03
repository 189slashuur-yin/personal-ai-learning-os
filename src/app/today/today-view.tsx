"use client";

import { type FormEvent, useEffect, useState } from "react";
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
import { BrowserTaskStorage } from "@/infrastructure/storage/browser-task-storage";
import { BrowserWorkspaceStorage } from "@/infrastructure/storage/browser-workspace-storage";

type TodaySection = {
  id: string;
  title: string;
  description: string;
  tasks: Task[];
};

type TodayData = {
  sections: TodaySection[];
  workspaces: Workspace[];
};

function createTaskService() {
  return new TaskService(
    new BrowserTaskStorage(),
    new BrowserWorkspaceStorage(),
  );
}

function loadTodayData(): TodayData {
  const taskStorage = new BrowserTaskStorage();
  const workspaceStorage = new BrowserWorkspaceStorage();
  const taskService = new TaskService(taskStorage, workspaceStorage);
  const workspaces = new WorkspaceService(
    workspaceStorage,
    new BrowserConversationStorage(),
    taskStorage,
  ).listWorkspaces();

  return {
    workspaces: workspaces.filter((workspace) => !workspace.archivedAt),
    sections: [
      {
        id: "overdue",
        title: "Overdue",
        description: "截止日期早于今天的未完成 Task。",
        tasks: taskService.listOverdue(),
      },
      {
        id: "today",
        title: "Today",
        description: "今天到期的 Task。",
        tasks: taskService.listDueToday(),
      },
      {
        id: "upcoming",
        title: "Upcoming",
        description: "今天之后到期的 Task。",
        tasks: taskService.listUpcoming(),
      },
      {
        id: "inbox",
        title: "Inbox",
        description: "尚未指定截止日期的 Task。",
        tasks: taskService.listByStatus("inbox"),
      },
      {
        id: "completed-today",
        title: "Completed Today",
        description: "今天完成的 Task。",
        tasks: taskService.listCompletedToday(),
      },
    ],
  };
}

function formatDueDate(value?: string) {
  if (!value) {
    return "No due date";
  }

  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(
    new Date(`${value.slice(0, 10)}T00:00:00`),
  );
}

export function TodayView() {
  const [data, setData] = useState<TodayData | null>(null);
  const [workspaceId, setWorkspaceId] = useState("all");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("todo");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [captureWorkspaceId, setCaptureWorkspaceId] = useState("inbox");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    setData(loadTodayData());
  }

  useEffect(() => {
    const timer = window.setTimeout(reload, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function toggleTask(task: Task) {
    const taskService = createTaskService();
    if (task.status === "completed") {
      taskService.reopenTask(task.id);
    } else {
      taskService.completeTask(task.id);
    }
    reload();
  }

  function captureTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    if (!title.trim()) {
      setError("Task 标题不能为空。");
      return;
    }

    try {
      createTaskService().createTask({
        title,
        status: "inbox",
        type,
        priority,
        dueDate,
        workspaceId: captureWorkspaceId,
        sourceRef: {
          type: "manual",
          titleSnapshot: title.trim(),
        },
      });
      setTitle("");
      setType("todo");
      setPriority("medium");
      setDueDate("");
      setCaptureWorkspaceId("inbox");
      setError(null);
      setNotice("Task 已创建。");
      reload();
    } catch {
      setError("Task 创建失败，请确认浏览器允许本地保存。");
    }
  }

  if (!data) {
    return <p className="mt-8 text-sm text-zinc-500" role="status">正在读取 Today…</p>;
  }

  const workspaceNames = new Map(
    data.workspaces.map((workspace) => [workspace.id, workspace.name]),
  );
  const visibleSections = data.sections.map((section) => ({
    ...section,
    tasks: section.tasks.filter(
      (task) => workspaceId === "all" || task.workspaceId === workspaceId,
    ),
  }));
  const visibleTaskCount = visibleSections.reduce(
    (count, section) => count + section.tasks.length,
    0,
  );

  return (
    <div className="mt-8 space-y-10">
      <section>
        <div>
          <p className="eyebrow">Quick Capture</p>
          <h2 className="mt-2 text-xl font-semibold text-zinc-950">快速创建 Task</h2>
        </div>
        <form className="mt-4 grid gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5" onSubmit={captureTask}>
          <label className="text-sm font-medium text-zinc-700 sm:col-span-2 lg:col-span-2">
            Title
            <input className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5 outline-none focus:border-zinc-500" onChange={(event) => setTitle(event.target.value)} placeholder="例如：整理本周学习笔记" value={title} />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Type
            <select className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5" onChange={(event) => setType(event.target.value as TaskType)} value={type}>
              {taskTypes.map((taskType) => <option key={taskType} value={taskType}>{taskType}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Priority
            <select className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5" onChange={(event) => setPriority(event.target.value as TaskPriority)} value={priority}>
              {taskPriorities.map((taskPriority) => <option key={taskPriority} value={taskPriority}>{taskPriority}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Due Date
            <input className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5" onChange={(event) => setDueDate(event.target.value)} type="date" value={dueDate} />
          </label>
          <label className="text-sm font-medium text-zinc-700 sm:col-span-2">
            Workspace
            <select className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5" onChange={(event) => setCaptureWorkspaceId(event.target.value)} value={captureWorkspaceId}>
              {data.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
          </label>
          <div className="flex items-end lg:col-span-2">
            <button className="w-full rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300" disabled={!title.trim()} type="submit">Create Task</button>
          </div>
          {notice ? <p className="text-sm text-emerald-700 sm:col-span-2 lg:col-span-5" role="status">{notice}</p> : null}
          {error ? <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-5" role="alert">{error}</p> : null}
        </form>
      </section>

      <label className="block max-w-sm text-sm font-medium text-zinc-700">
        Workspace
        <select className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5" onChange={(event) => setWorkspaceId(event.target.value)} value={workspaceId}>
          <option value="all">All Workspaces</option>
          {data.workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
          ))}
        </select>
      </label>

      {visibleTaskCount === 0 ? (
        <section className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center">
          <h2 className="text-lg font-semibold text-zinc-950">Today 已清空</h2>
          <p className="mt-2 text-sm text-zinc-500">
            当前 Workspace 没有逾期、今日、即将到期、Inbox 或今天已完成的 Task。
          </p>
        </section>
      ) : null}

      {visibleSections.map((section) => {
        const taskList = section.tasks.length ? (
          <div className={`mt-4 overflow-hidden rounded-xl border bg-white ${section.id === "overdue" ? "border-red-300" : "border-zinc-200"}`}>
            {section.tasks.map((task, index) => (
              <article className={`flex flex-wrap items-center justify-between gap-4 px-5 py-4 ${index ? "border-t border-zinc-100" : ""} ${section.id === "overdue" ? "bg-red-50/60" : ""}`} key={task.id}>
                <div className="min-w-0">
                  <h3 className={`font-medium ${section.id === "overdue" ? "text-red-900" : "text-zinc-950"}`}>{task.title}</h3>
                  <p className={`mt-1 text-xs ${section.id === "overdue" ? "text-red-700" : "text-zinc-500"}`}>
                    {workspaceNames.get(task.workspaceId ?? "inbox") ?? "Inbox"} · {task.priority} · {formatDueDate(task.dueDate)}
                  </p>
                </div>
                <button className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50" onClick={() => toggleTask(task)} type="button">
                  {task.status === "completed" ? "Reopen" : "Complete"}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500">这个分区暂无 Task。</p>
        );

        return section.id === "completed-today" ? (
          <details className="rounded-xl border border-zinc-200 bg-white p-5" key={section.id}>
            <summary className="cursor-pointer list-none">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-zinc-950">{section.title}</h2>
                  <p className="mt-1 text-sm text-zinc-500">{section.description} 默认折叠。</p>
                </div>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-semibold text-zinc-600">{section.tasks.length}</span>
              </div>
            </summary>
            {taskList}
          </details>
        ) : (
          <section key={section.id}>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-zinc-950">{section.title}</h2>
                <p className="mt-1 text-sm text-zinc-500">{section.description}</p>
              </div>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-semibold text-zinc-600">{section.tasks.length}</span>
            </div>
            {taskList}
          </section>
        );
      })}
    </div>
  );
}
