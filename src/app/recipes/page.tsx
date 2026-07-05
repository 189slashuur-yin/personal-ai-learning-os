import { RecipeList } from "./recipe-list";
export default function RecipesPage() { return <main className="workspace-shell"><p className="eyebrow">Local Recipe</p><h1 className="workspace-title">工作流模板</h1><p className="workspace-description">Recipe 是本地手动工作流模板，不是 Agent；本版本只记录步骤，不自动执行。</p><RecipeList /></main>; }
