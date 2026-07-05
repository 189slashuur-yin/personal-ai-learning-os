import type { Recipe } from "@/core/entities/recipe";
export interface RecipeStorage { save(recipe: Recipe): void; getAll(): Recipe[]; }
