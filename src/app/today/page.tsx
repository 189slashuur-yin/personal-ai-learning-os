import { TodayView } from "./today-view";

export default function TodayPage() {
  return (
    <main className="workspace-shell pb-24">
      <p className="eyebrow">Daily Focus</p>
      <h1 className="workspace-title">Today</h1>
      <p className="workspace-description">
        集中处理逾期、今日、即将到期和 Inbox Task，并快速完成或重新打开。
      </p>
      <TodayView />
    </main>
  );
}
