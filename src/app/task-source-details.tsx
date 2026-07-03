import Link from "next/link";
import type { Task } from "@/core/entities/task";

const sourceLabels = {
  manual: "Manual",
  knowledge: "Knowledge",
  conversation: "Conversation",
  message: "Message",
  proposal: "Proposal",
  workspace: "Workspace",
} as const;

function sourceHref(task: Task, sourceMissing: boolean) {
  const sourceRef = task.sourceRef;

  if (sourceMissing || !sourceRef?.entityId) {
    return null;
  }

  if (sourceRef.type === "knowledge") {
    return `/knowledge/${sourceRef.entityId}`;
  }

  if (sourceRef.type === "conversation") {
    return `/conversation/${sourceRef.entityId}`;
  }

  return null;
}

export function TaskSourceDetails({
  task,
  sourceMissing,
  currentTitle,
  compact = false,
}: {
  task: Task;
  sourceMissing: boolean;
  currentTitle?: string;
  compact?: boolean;
}) {
  const sourceRef = task.sourceRef;
  const label = sourceRef ? sourceLabels[sourceRef.type] : "Manual";
  const href = sourceHref(task, sourceMissing);
  const title = currentTitle ?? sourceRef?.titleSnapshot;

  return (
    <div className={`${compact ? "mt-2" : "mt-4 rounded-lg bg-zinc-50 p-3"} text-xs text-zinc-600`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-zinc-800">Source: {label}</span>
        {sourceMissing ? (
          <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">
            Source deleted
          </span>
        ) : null}
      </div>
      {title ? (
        href ? (
          <Link className="mt-1 inline-block font-medium text-zinc-800 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-700" href={href}>
            {title}
          </Link>
        ) : (
          <p className="mt-1 font-medium text-zinc-700">{title}</p>
        )
      ) : null}
      {sourceRef?.titleSnapshot && sourceRef.titleSnapshot !== title ? (
        <p className="mt-1">Snapshot: {sourceRef.titleSnapshot}</p>
      ) : null}
      {sourceRef?.summarySnapshot ? (
        <p className="mt-1 leading-5">{sourceRef.summarySnapshot}</p>
      ) : null}
    </div>
  );
}
