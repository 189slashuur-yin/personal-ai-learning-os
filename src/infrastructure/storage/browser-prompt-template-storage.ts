import type { PromptTemplateStorage } from "@/core/contracts/prompt-template-storage";
import type {
  AnalyzerPromptMode,
  AnalyzerPromptTemplate,
} from "@/core/entities/analyzer-prompt-template";

const PROMPT_TEMPLATES_KEY = "ai-learning-os.analyzer-prompt-templates";

function isPromptTemplate(value: unknown): value is AnalyzerPromptTemplate {
  if (!value || typeof value !== "object") {
    return false;
  }

  const template = value as Partial<AnalyzerPromptTemplate>;
  return (
    typeof template.id === "string" &&
    typeof template.name === "string" &&
    (template.mode === "source" || template.mode === "messages") &&
    typeof template.template === "string" &&
    typeof template.version === "number" &&
    typeof template.createdAt === "string" &&
    typeof template.updatedAt === "string"
  );
}

export class BrowserPromptTemplateStorage implements PromptTemplateStorage {
  getAll(): AnalyzerPromptTemplate[] {
    const storedTemplates = window.localStorage.getItem(PROMPT_TEMPLATES_KEY);

    if (!storedTemplates) {
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(storedTemplates);
      return Array.isArray(parsed) ? parsed.filter(isPromptTemplate) : [];
    } catch {
      return [];
    }
  }

  getByMode(mode: AnalyzerPromptMode): AnalyzerPromptTemplate | null {
    return this.getAll().find((template) => template.mode === mode) ?? null;
  }

  replaceAll(templates: AnalyzerPromptTemplate[]): void {
    window.localStorage.setItem(PROMPT_TEMPLATES_KEY, JSON.stringify(templates));
  }
}
