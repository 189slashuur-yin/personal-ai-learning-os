import type { AnalyzerRunStorage } from "@/core/contracts/analyzer-run-storage";
import type { AnalyzerRun } from "@/core/entities/analyzer-run";

const ANALYZER_RUNS_KEY = "ai-learning-os.analyzer-runs";

function isAnalyzerRun(value: unknown): value is AnalyzerRun {
  if (!value || typeof value !== "object") {
    return false;
  }

  const run = value as Partial<AnalyzerRun>;
  return (
    typeof run.id === "string" &&
    typeof run.providerId === "string" &&
    typeof run.providerName === "string" &&
    ["idle", "running", "success", "failed"].includes(run.status ?? "") &&
    typeof run.startedAt === "string"
  );
}

export class BrowserAnalyzerRunStorage implements AnalyzerRunStorage {
  save(run: AnalyzerRun): void {
    const runs = this.getAll();
    const existingIndex = runs.findIndex((storedRun) => storedRun.id === run.id);

    if (existingIndex >= 0) {
      runs[existingIndex] = run;
    } else {
      runs.push(run);
    }

    window.localStorage.setItem(ANALYZER_RUNS_KEY, JSON.stringify(runs));
  }

  getAll(): AnalyzerRun[] {
    const storedRuns = window.localStorage.getItem(ANALYZER_RUNS_KEY);

    if (!storedRuns) {
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(storedRuns);
      return (Array.isArray(parsed) ? parsed.filter(isAnalyzerRun) : []).sort(
        (left, right) => right.startedAt.localeCompare(left.startedAt),
      );
    } catch {
      return [];
    }
  }

  getById(id: string): AnalyzerRun | null {
    return this.getAll().find((run) => run.id === id) ?? null;
  }

  getLatest(): AnalyzerRun | null {
    return this.getAll()[0] ?? null;
  }

  getLatestByConversationId(conversationId: string): AnalyzerRun | null {
    return (
      this.getAll().find((run) => run.conversationId === conversationId) ?? null
    );
  }

  removeByConversationId(conversationId: string): void {
    const runs = this.getAll().filter(
      (run) => run.conversationId !== conversationId,
    );
    window.localStorage.setItem(ANALYZER_RUNS_KEY, JSON.stringify(runs));
  }
}
