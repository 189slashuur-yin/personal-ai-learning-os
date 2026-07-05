import type { RecipeStorage } from "@/core/contracts/recipe-storage";
import type { Recipe } from "@/core/entities/recipe";
const examples: Array<Pick<Recipe, "id" | "name" | "description" | "steps">> = [
  { id: "recipe-conversation-to-knowledge", name: "对话沉淀为知识", description: "导入对话并按 Round 整理。", steps: ["导入对话", "生成 Round", "生成整理建议", "确认知识"] },
  { id: "recipe-work", name: "整理工作对话", description: "保留结论和待确认点。", steps: ["导入", "补充 Round Note", "总结", "确认知识"] },
  { id: "recipe-study", name: "整理学习对话", description: "按问题沉淀多个知识条目。", steps: ["导入", "检查 Rounds", "逐轮分析", "确认知识"] },
];
export class RecipeService {
  constructor(private readonly storage: RecipeStorage) {}
  list() { const existing = this.storage.getAll(); const timestamp = new Date().toISOString(); examples.filter((example) => !existing.some((item) => item.id === example.id)).forEach((example) => this.storage.save({ ...example, triggerType: "manual", createdAt: timestamp, updatedAt: timestamp })); return this.storage.getAll(); }
  create(name: string, description: string, steps: string[]) { const timestamp = new Date().toISOString(); const recipe: Recipe = { id: crypto.randomUUID(), name: name.trim(), description: description.trim(), triggerType: "manual", steps: steps.map((step) => step.trim()).filter(Boolean), createdAt: timestamp, updatedAt: timestamp }; if (!recipe.name) throw new Error("Recipe name is required."); this.storage.save(recipe); return recipe; }
}
