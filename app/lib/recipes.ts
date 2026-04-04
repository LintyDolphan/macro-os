import type { GroceryCategory } from "./grocery";
import {
  getRecipes as getRecipesFromDb,
  createRecipe as createRecipeInDb,
  deleteRecipe as deleteRecipeInDb,
} from "./recipes-db";

export type Ingredient = {
  name: string;
  qty?: string;
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
  steps?: string[];
};

export type Macros = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

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
    steps: [],
  },
];

function inferCategory(name: string): GroceryCategory {
  const lower = name.toLowerCase();

  if (
    lower.includes("chicken") ||
    lower.includes("beef") ||
    lower.includes("pork") ||
    lower.includes("turkey") ||
    lower.includes("fish")
  ) {
    return "meat";
  }

  if (
    lower.includes("milk") ||
    lower.includes("yogurt") ||
    lower.includes("cheese") ||
    lower.includes("butter")
  ) {
    return "dairy";
  }

  if (
    lower.includes("berry") ||
    lower.includes("broccoli") ||
    lower.includes("apple") ||
    lower.includes("banana") ||
    lower.includes("spinach") ||
    lower.includes("lettuce") ||
    lower.includes("pepper") ||
    lower.includes("onion")
  ) {
    return "produce";
  }

  if (lower.includes("frozen")) {
    return "frozen";
  }

  if (
    lower.includes("bread") ||
    lower.includes("rice") ||
    lower.includes("pasta") ||
    lower.includes("oats") ||
    lower.includes("granola") ||
    lower.includes("oil") ||
    lower.includes("sauce") ||
    lower.includes("honey")
  ) {
    return "pantry";
  }

  return "other";
}

function joinStepsToInstructions(steps?: string[]) {
  return (steps ?? []).filter(Boolean).join("\n");
}

function splitInstructionsToSteps(instructions?: string | null) {
  if (!instructions) return [];
  return instructions
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatIngredientQty(amount: number | null, unit: string | null) {
  if (amount != null && unit) return `${amount}${unit}`;
  if (amount != null) return String(amount);
  if (unit) return unit;
  return undefined;
}

function mapDbRecipeToRecipe(dbRecipe: any): Recipe {
  return {
    id: dbRecipe.id,
    name: dbRecipe.name,
    createdAt: dbRecipe.created_at,
    isTemplate: false,
    defaultServings: dbRecipe.servings ?? 1,
    totalMacros: {
      calories: Number(dbRecipe.calories ?? 0),
      protein: Number(dbRecipe.protein_g ?? 0),
      carbs: Number(dbRecipe.carbs_g ?? 0),
      fat: Number(dbRecipe.fat_g ?? 0),
    },
    steps: splitInstructionsToSteps(dbRecipe.instructions),
    ingredients: (dbRecipe.recipe_ingredients ?? [])
      .slice()
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((ingredient: any) => ({
        name: ingredient.name,
        qty: formatIngredientQty(ingredient.amount, ingredient.unit),
        category: inferCategory(ingredient.name),
      })),
  };
}

function mapRecipeToDbInput(recipe: Omit<Recipe, "id" | "createdAt" | "isTemplate">) {
  return {
    name: recipe.name.trim(),
    description: null,
    instructions: joinStepsToInstructions(recipe.steps),
    servings: recipe.defaultServings,
    calories: recipe.totalMacros.calories,
    protein_g: recipe.totalMacros.protein,
    carbs_g: recipe.totalMacros.carbs,
    fat_g: recipe.totalMacros.fat,
    ingredients: recipe.ingredients.map((ingredient, index) => ({
      name: ingredient.name,
      amount: null,
      unit: ingredient.qty ?? null,
      notes: ingredient.category,
      sort_order: index,
    })),
  };
}

export async function loadRecipes(): Promise<Recipe[]> {
  const dbRecipes = await getRecipesFromDb();
  return (dbRecipes ?? []).map(mapDbRecipeToRecipe);
}

export async function addRecipe(
  recipes: Recipe[],
  recipe: Omit<Recipe, "id" | "createdAt" | "isTemplate">
): Promise<Recipe[]> {
  await createRecipeInDb(mapRecipeToDbInput(recipe));
  return await loadRecipes();
}

export async function deleteRecipe(recipes: Recipe[], id: string): Promise<Recipe[]> {
  await deleteRecipeInDb(id);
  return await loadRecipes();
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

export async function mergeImportedRecipe(recipes: Recipe[], recipe: Recipe): Promise<Recipe[]> {
  const existing = await loadRecipes();

  const exists = existing.some(
    (r) => r.name.trim().toLowerCase() === recipe.name.trim().toLowerCase()
  );

  if (exists) return existing;

  await createRecipeInDb(
    mapRecipeToDbInput({
      name: recipe.name,
      ingredients: recipe.ingredients,
      defaultServings: recipe.defaultServings,
      totalMacros: recipe.totalMacros,
      steps: recipe.steps ?? [],
    })
  );

  return await loadRecipes();
}