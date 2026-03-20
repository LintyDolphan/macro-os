import type { GroceryCategory } from "./grocery";

export type Ingredient = {
  name: string;
  qty?: string; // "200g", "1 cup", "2"
  category: GroceryCategory;
};

export type Recipe = {
  id: string;
  name: string;
  ingredients: Ingredient[];
  createdAt: string;
  isTemplate?: boolean;
  defaultServings: number;
  totalMacros: Macros;
  steps?: string[]; // optional cooking/instruction steps
};
export type Macros = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};
const KEY = "recipes";

export const TEMPLATE_RECIPES: Recipe[] = [
  {
    id: "tmpl-yogurt-parfait",
    name: "Greek Yogurt Parfait",
    createdAt: new Date(0).toISOString(),
    isTemplate: true,
    defaultServings: 2,
    totalMacros: { calories: 520, protein: 45, carbs: 70, fat: 10 },
    ingredients: [
      { name: "Greek yogurt", qty: "500g", category: "dairy" },
      { name: "Frozen berries", qty: "300g", category: "frozen" },
      { name: "Granola", qty: "1 bag", category: "pantry" },
      { name: "Honey (optional)", qty: "1 bottle", category: "pantry" },
    ],
  },
  // ...repeat for other templates
];

export function loadRecipes(): Recipe[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecipes(recipes: Recipe[]) {
  localStorage.setItem(KEY, JSON.stringify(recipes));
}

export function addRecipe(
  recipes: Recipe[],
  recipe: Omit<Recipe, "id" | "createdAt" | "isTemplate">
) {
  const newRecipe: Recipe = {
    id: crypto.randomUUID(),
    name: recipe.name.trim(),
    ingredients: recipe.ingredients,
    createdAt: new Date().toISOString(),
    isTemplate: false,
    defaultServings: recipe.defaultServings,
    totalMacros: recipe.totalMacros,
    steps: recipe.steps ?? [],
  };

  const next = [newRecipe, ...recipes];
  saveRecipes(next);
  return next;
}
export function deleteRecipe(recipes: Recipe[], id: string) {
  const next = recipes.filter((r) => r.id !== id);
  saveRecipes(next);
  return next;
}
export function exportRecipeShareCode(recipe: Recipe) {
  const payload = { v: 1, recipe };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

export function importRecipeShareCode(code: string): Recipe {
  const json = decodeURIComponent(escape(atob(code.trim())));
  const payload = JSON.parse(json);

  if (payload?.recipe) {
    return payload.recipe as Recipe;
  }

  throw new Error("Invalid recipe share code");
}

export function mergeImportedRecipe(recipes: Recipe[], recipe: Recipe) {
  const exists = recipes.some(
    (r) => r.name.trim().toLowerCase() === recipe.name.trim().toLowerCase()
  );

  const importedRecipe: Recipe = {
    ...recipe,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    isTemplate: false,
  };

  const next = exists ? recipes : [importedRecipe, ...recipes];
  saveRecipes(next);
  return next;
}