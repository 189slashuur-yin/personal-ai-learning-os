import { ProviderSettings } from "./provider-settings";
import { DataManagement } from "./data-management";

export default function SettingsPage() {
  return (
    <main className="page-shell">
      <p className="eyebrow">Settings</p>
      <h1 className="page-title">Settings</h1>
      <p className="page-description">
        查看 Analyzer 与 Provider Configuration。Demo 与启用后的本地 Ollama 可运行。
      </p>
      <ProviderSettings />
      <DataManagement />
    </main>
  );
}
