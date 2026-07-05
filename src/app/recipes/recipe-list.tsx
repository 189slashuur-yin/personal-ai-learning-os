"use client";
import { useEffect, useState } from "react";
import type { Recipe } from "@/core/entities/recipe";
import { RecipeService } from "@/core/services/recipe-service";
import { BrowserRecipeStorage } from "@/infrastructure/storage/browser-recipe-storage";
export function RecipeList() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const load = () => setRecipes(new RecipeService(new BrowserRecipeStorage()).list());
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, []);
  function add() { const name = window.prompt("Recipe 名称")?.trim(); if (!name) return; const description = window.prompt("说明") ?? ""; const steps = (window.prompt("步骤（每行一个）") ?? "").split("\n"); new RecipeService(new BrowserRecipeStorage()).create(name, description, steps); load(); }
  return <><button className="mt-6 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white" onClick={add} type="button">手动记录 Recipe</button><div className="mt-6 grid gap-4 md:grid-cols-2">{recipes.map((recipe) => <article className="rounded-xl border border-zinc-200 bg-white p-5" key={recipe.id}><p className="text-xs font-semibold text-zinc-500">Manual · 不自动执行</p><h2 className="mt-2 text-lg font-semibold">{recipe.name}</h2><p className="mt-2 text-sm text-zinc-600">{recipe.description}</p><ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-zinc-700">{recipe.steps.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}</ol></article>)}</div></>;
}
