import { ProviderSettings } from "./provider-settings";

export default function SettingsPage() {
  return (
    <main className="page-shell">
      <p className="eyebrow">Settings</p>
      <h1 className="page-title">AI Provider 设置</h1>
      <p className="page-description">
        查看 Analyzer 与 Provider Configuration。当前版本仅运行本地 Demo。
      </p>
      <ProviderSettings />
    </main>
  );
}
