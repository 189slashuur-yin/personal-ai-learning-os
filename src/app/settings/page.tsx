import { ProviderSettings } from "./provider-settings";

export default function SettingsPage() {
  return (
    <main className="page-shell">
      <p className="eyebrow">Settings</p>
      <h1 className="page-title">AI Provider 设置</h1>
      <p className="page-description">
        选择 Proposal 分析所使用的 Provider。当前版本仅启用本地 Demo。
      </p>
      <ProviderSettings />
    </main>
  );
}
