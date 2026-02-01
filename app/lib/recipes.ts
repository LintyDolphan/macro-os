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
};

const KEY = "recipes";

export const TEMPLATE_RECIPES: Recipe[] = [
  {
    id: "tmpl-yogurt-parfait",
    name: "Greek Yogurt Parfait",
    createdAt: new Date(0).toISOString(),
    isTemplate: true,
    ingredients: [
      { name: "Greek yogurt", qty: "500g", category: "dairy" },
      { name: "Frozen berries", qty: "300g", category: "frozen" },
      { name: "Granola", qty: "1 bag", category: "pantry" },
      { name: "Honey (optional)", qty: "1 bottle", category: "pantry" },
    ],
  },
  {
    id: "tmpl-chicken-rice",
    name: "Chicken + Rice Bowl",
    createdAt: new Date(0).toISOString(),
    isTemplate: true,
    ingredients: [
      { name: "Chicken breast", qty: "1–2 kg", category: "meat" },
      { name: "Rice", qty: "1 bag", category: "pantry" },
      { name: "Broccoli", qty: "2 heads", category: "produce" },
      { name: "Soy sauce", qty: "1 bottle", category: "pantry" },
    ],
  },
  {
    id: "tmpl-overnight-oats",
    name: "Overnight Oats",
    createdAt: new Date(0).toISOString(),
    isTemplate: true,
    ingredients: [
      { name: "Oats", qty: "1 container", category: "pantry" },
      { name: "Milk", qty: "2 L", category: "dairy" },
      { name: "Chia seeds", qty: "1 bag", category: "pantry" },
      { name: "Bananas", qty: "6", category: "produce" },
    ],
  },
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

export function addRecipe(recipes: Recipe[], recipe: Omit<Recipe, "id" | "createdAt">) {
  const newRecipe: Recipe = {
    id: crypto.randomUUID(),
    name: recipe.name.trim(),
    ingredients: recipe.ingredients,
    createdAt: new Date().toISOString(),
    isTemplate: false,
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
