import type { PromptTemplateStorage } from "@/core/contracts/prompt-template-storage";
import type {
  AnalyzerPromptMode,
  AnalyzerPromptTemplate,
} from "@/core/entities/analyzer-prompt-template";

const DEFAULT_CREATED_AT = "2026-07-02T00:00:00.000Z";

const DEFAULT_TEMPLATES: AnalyzerPromptTemplate[] = [
  {
    id: "default-source-analysis",
    name: "Source Analysis Template",
    mode: "source",
    template:
      "Analyze the provided source. Return one concise proposal with a title, summary, evidence, confidence, suggested action, and risk level. Preserve traceability to the source and do not create a knowledge card.",
    version: 1,
    createdAt: DEFAULT_CREATED_AT,
    updatedAt: DEFAULT_CREATED_AT,
  },
  {
    id: "default-messages-analysis",
    name: "Messages Analysis Template",
    mode: "messages",
    template:
      "Analyze only the selected messages in their original order. Return one concise proposal with a title, summary, evidence, confidence, suggested action, and risk level. Preserve message references and do not create a knowledge card.",
    version: 1,
    createdAt: DEFAULT_CREATED_AT,
    updatedAt: DEFAULT_CREATED_AT,
  },
];

function copyTemplates(templates: AnalyzerPromptTemplate[]) {
  return templates.map((template) => ({ ...template }));
}

export function getDefaultPromptTemplates(): AnalyzerPromptTemplate[] {
  return copyTemplates(DEFAULT_TEMPLATES);
}

export class PromptTemplateService {
  constructor(private readonly storage: PromptTemplateStorage) {}

  getDefaultTemplates(): AnalyzerPromptTemplate[] {
    return getDefaultPromptTemplates();
  }

  listTemplates(): AnalyzerPromptTemplate[] {
    const storedTemplates = this.storage.getAll();

    if (storedTemplates.length > 0) {
      return storedTemplates;
    }

    const defaults = this.getDefaultTemplates();
    this.storage.replaceAll(defaults);
    return defaults;
  }

  getCurrentTemplate(mode: AnalyzerPromptMode): AnalyzerPromptTemplate | null {
    const storedTemplate = this.storage.getByMode(mode);

    if (storedTemplate) {
      return storedTemplate;
    }

    if (this.storage.getAll().length > 0) {
      return null;
    }

    return this.listTemplates().find((template) => template.mode === mode) ?? null;
  }

  resetDefaults(): AnalyzerPromptTemplate[] {
    const defaults = this.getDefaultTemplates();
    this.storage.replaceAll(defaults);
    return defaults;
  }
}
