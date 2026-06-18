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
  ingredientId?: string;
  quantityGrams?: number;
  isLinked?: boolean;
  isPrivate?: boolean;
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

type LinkedIngredientLookup = {
  id: string;
  name: string;
  calories_per_100g: number | string | null;
  protein_per_100g: number | string | null;
  carbs_per_100g: number | string | null;
  fat_per_100g: number | string | null;
  visibility?: "public" | "private";
  verification_status?: "verified" | "custom" | "pending";
};

type DbRecipeIngredientRow = {
  id: string;
  recipe_id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  notes: string | null;
  sort_order: number;
  ingredient_id: string | null;
  quantity_g: number | string | null;
  ingredient?: LinkedIngredientLookup | LinkedIngredientLookup[] | null;
};

type DbRecipeRow = {
  id: string;
  name: string;
  created_at: string;
  servings: number | null;
  calories: number | string | null;
  protein_g: number | string | null;
  carbs_g: number | string | null;
  fat_g: number | string | null;
  instructions?: string | null;
  recipe_ingredients?: DbRecipeIngredientRow[];
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

function formatQuantityGrams(quantityGrams: number | string | null | undefined) {
  if (quantityGrams == null || !Number.isFinite(Number(quantityGrams))) return undefined;
  const rounded = Math.round(Number(quantityGrams) * 100) / 100;
  return `${rounded}g`;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLinkedIngredient(
  ingredient: DbRecipeIngredientRow["ingredient"]
): LinkedIngredientLookup | null {
  if (!ingredient) return null;
  if (Array.isArray(ingredient)) return ingredient[0] ?? null;
  return ingredient;
}

function calculateRecipeTotalsFromLinkedIngredients(recipeIngredients: DbRecipeIngredientRow[]): Macros {
  return recipeIngredients.reduce(
    (totals, ingredient) => {
      const quantityGrams = toNumber(ingredient.quantity_g);
      const linked = normalizeLinkedIngredient(ingredient.ingredient);

      if (!linked || quantityGrams <= 0) {
        return totals;
      }

      totals.calories += (toNumber(linked.calories_per_100g) * quantityGrams) / 100;
      totals.protein += (toNumber(linked.protein_per_100g) * quantityGrams) / 100;
      totals.carbs += (toNumber(linked.carbs_per_100g) * quantityGrams) / 100;
      totals.fat += (toNumber(linked.fat_per_100g) * quantityGrams) / 100;
      return totals;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

function roundMacros(macros: Macros): Macros {
  return {
    calories: Math.round(macros.calories * 100) / 100,
    protein: Math.round(macros.protein * 100) / 100,
    carbs: Math.round(macros.carbs * 100) / 100,
    fat: Math.round(macros.fat * 100) / 100,
  };
}

function roundCalories(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function mapDbRecipeToRecipe(dbRecipe: DbRecipeRow): Recipe {
  const linkedTotals = roundMacros(
    calculateRecipeTotalsFromLinkedIngredients(dbRecipe.recipe_ingredients ?? [])
  );
  const hasLinkedTotals =
    linkedTotals.calories > 0 ||
    linkedTotals.protein > 0 ||
    linkedTotals.carbs > 0 ||
    linkedTotals.fat > 0;

  return {
    id: dbRecipe.id,
    name: dbRecipe.name,
    createdAt: dbRecipe.created_at,
    isTemplate: false,
    defaultServings: dbRecipe.servings ?? 1,
    totalMacros: hasLinkedTotals
      ? linkedTotals
      : {
          calories: Number(dbRecipe.calories ?? 0),
          protein: Number(dbRecipe.protein_g ?? 0),
          carbs: Number(dbRecipe.carbs_g ?? 0),
          fat: Number(dbRecipe.fat_g ?? 0),
        },
    steps: splitInstructionsToSteps(dbRecipe.instructions),
    ingredients: (dbRecipe.recipe_ingredients ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((ingredient) => {
        const linkedIngredient = normalizeLinkedIngredient(ingredient.ingredient);

        return {
          name: ingredient.name,
          qty:
            formatQuantityGrams(ingredient.quantity_g) ??
            formatIngredientQty(ingredient.amount, ingredient.unit),
          category: inferCategory(ingredient.notes || ingredient.name),
          ingredientId: ingredient.ingredient_id ?? undefined,
          quantityGrams: ingredient.quantity_g != null ? Number(ingredient.quantity_g) : undefined,
          isLinked: Boolean(ingredient.ingredient_id && ingredient.quantity_g != null),
          isPrivate: linkedIngredient?.visibility === "private",
        };
      }),
  };
}

function mapRecipeToDbInput(recipe: Omit<Recipe, "id" | "createdAt" | "isTemplate">) {
  return {
    name: recipe.name.trim(),
    description: null,
    instructions: joinStepsToInstructions(recipe.steps),
    servings: recipe.defaultServings,
    calories: roundCalories(recipe.totalMacros.calories),
    protein_g: recipe.totalMacros.protein,
    carbs_g: recipe.totalMacros.carbs,
    fat_g: recipe.totalMacros.fat,
    ingredients: recipe.ingredients.map((ingredient, index) => ({
      name: ingredient.name,
      amount: null,
      unit: ingredient.quantityGrams != null ? null : ingredient.qty ?? null,
      notes: ingredient.category,
      sort_order: index,
      ingredient_id: ingredient.ingredientId ?? null,
      quantity_g: ingredient.quantityGrams ?? null,
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
