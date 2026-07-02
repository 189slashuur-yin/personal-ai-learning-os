import type {
  AnalyzerOutputSchema,
  AnalyzerRiskLevel,
  AnalyzerSuggestedAction,
} from "@/core/entities/analyzer-output-schema";

const suggestedActions: AnalyzerSuggestedAction[] = [
  "create",
  "update",
  "merge",
  "archive",
  "ignore",
];
const riskLevels: AnalyzerRiskLevel[] = ["low", "medium", "high"];

export class AnalyzerOutputValidationError extends Error {
  constructor(readonly validationErrors: string[]) {
    super(`Analyzer 输出校验失败：${validationErrors.join("；")}`);
    this.name = "AnalyzerOutputValidationError";
  }
}

export function validateAnalyzerOutput(value: unknown): AnalyzerOutputSchema {
  if (!value || typeof value !== "object") {
    throw new AnalyzerOutputValidationError(["输出必须是结构化对象"]);
  }

  const output = value as Partial<AnalyzerOutputSchema>;
  const errors: string[] = [];

  for (const field of ["title", "summary", "evidence"] as const) {
    if (typeof output[field] !== "string" || !output[field]?.trim()) {
      errors.push(`缺少有效字段 ${field}`);
    }
  }

  if (typeof output.confidence !== "number") {
    errors.push("缺少有效字段 confidence");
  } else if (
    !Number.isFinite(output.confidence) ||
    output.confidence < 0 ||
    output.confidence > 1
  ) {
    errors.push("confidence 必须在 0 到 1 之间");
  }

  if (
    !output.suggestedAction ||
    !suggestedActions.includes(output.suggestedAction)
  ) {
    errors.push(`suggestedAction 必须是 ${suggestedActions.join("、")} 之一`);
  }

  if (!output.riskLevel || !riskLevels.includes(output.riskLevel)) {
    errors.push(`riskLevel 必须是 ${riskLevels.join("、")} 之一`);
  }

  if (errors.length > 0) {
    throw new AnalyzerOutputValidationError(errors);
  }

  return output as AnalyzerOutputSchema;
}
