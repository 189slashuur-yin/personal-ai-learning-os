import type { RecipeStorage } from "@/core/contracts/recipe-storage";
import type { Recipe } from "@/core/entities/recipe";
const KEY = "ai-learning-os.recipes";
export class BrowserRecipeStorage implements RecipeStorage {
  save(recipe: Recipe) { const items = this.getAll(); const index = items.findIndex((item) => item.id === recipe.id); if (index >= 0) items[index] = recipe; else items.push(recipe); window.localStorage.setItem(KEY, JSON.stringify(items)); }
  getAll(): Recipe[] { const raw = window.localStorage.getItem(KEY); if (!raw) return []; try { const value = JSON.parse(raw) as Recipe[]; return Array.isArray(value) ? value.filter((item) => item?.triggerType === "manual" && Array.isArray(item.steps)) : []; } catch { return []; } }
}
