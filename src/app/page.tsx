import { DashboardOverview } from "./dashboard-overview";
import { DashboardSearch } from "./dashboard-search";
import { ConversationExplorer } from "./conversation/conversation-explorer";

export default function Home() {
  return (
    <main className="workspace-shell pb-24">
      <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-8 shadow-sm sm:px-8">
        <p className="eyebrow">Dashboard</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
          你的学习工作区
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-600">
          从原始 Conversation 出发，整理 Proposal，并沉淀为可持续使用的 Knowledge。
        </p>
        <DashboardSearch />
      </div>
      <ConversationExplorer compact />
      <DashboardOverview />
    </main>
  );
}
