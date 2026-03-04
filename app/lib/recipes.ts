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

  // ✅ new:
  defaultServings: number; // e.g., 2, 4, 6
  totalMacros: Macros;     // totals for the entire recipe batch
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
