"use client";

import { useState } from "react";
import {
  formatBulkDiagnostics,
  getBulkDiagnosticEntries,
  isBulkDiagnosticsEnabled,
} from "@/infrastructure/diagnostics/bulk-data-diagnostics";

export function BulkDiagnosticsCopyButton() {
  const [status, setStatus] = useState<string | null>(null);
  const diagnosticsEnabled = isBulkDiagnosticsEnabled();

  async function copyDiagnostics() {
    const count = getBulkDiagnosticEntries().length;
    if (count === 0) {
      setStatus("暂无批量诊断记录。");
      return;
    }
    try {
      await navigator.clipboard.writeText(formatBulkDiagnostics());
      setStatus(`已复制 ${count} 条诊断记录。`);
    } catch {
      setStatus("复制失败，请重试或使用浏览器开发工具检查诊断记录。");
    }
  }

  if (!diagnosticsEnabled) return null;

  return (
    <span className="inline-flex items-center gap-2">
      <button
        className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100"
        onClick={copyDiagnostics}
        type="button"
      >
        Copy Diagnostics
      </button>
      {status ? (
        <span className="text-xs text-violet-700" role="status">
          {status}
        </span>
      ) : null}
    </span>
  );
}
