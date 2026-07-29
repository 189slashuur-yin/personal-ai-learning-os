import type {
  AnalyzerRunDependencyIds,
  AnalyzerRunStorage,
} from "@/core/contracts/analyzer-run-storage";
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
    ["idle", "queued", "running", "completed", "success", "failed", "timeout"].includes(run.status ?? "") &&
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
      return (Array.isArray(parsed) ? parsed.filter(isAnalyzerRun) : [])
        .map((run) => ({ ...run, status: run.status === ("success" as AnalyzerRun["status"]) ? "completed" as const : run.status }))
        .sort(
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

  removeByDependencies(dependencyIds: AnalyzerRunDependencyIds): void {
    const conversationIds = new Set(dependencyIds.conversationIds);
    const sourceIds = new Set(dependencyIds.sourceIds);
    const roundIds = new Set(dependencyIds.roundIds);
    const messageIds = new Set(dependencyIds.messageIds);
    const runs = this.getAll().filter(
      (run) =>
        !(
          (run.conversationId && conversationIds.has(run.conversationId)) ||
          (run.sourceId && sourceIds.has(run.sourceId)) ||
          (run.roundId && roundIds.has(run.roundId)) ||
          run.messageIds?.some((messageId) => messageIds.has(messageId))
        ),
    );
    window.localStorage.setItem(ANALYZER_RUNS_KEY, JSON.stringify(runs));
  }
}
