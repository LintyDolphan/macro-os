import type { Recipe } from "./recipes";

export type RecipeFilterValue =
  | "all"
  | "favorites"
  | "high-protein"
  | "low-fat"
  | "low-calories"
  | "keto"
  | "vegan"
  | "vegetarian"
  | "dairy-free"
  | "gluten-free";

export const RECIPE_FAVORITES_STORAGE_KEY = "macro-os-recipe-favorites";

const MEAT_KEYWORDS = [
  "beef",
  "chicken",
  "pork",
  "turkey",
  "bacon",
  "ham",
  "sausage",
  "salmon",
  "tuna",
  "shrimp",
  "fish",
  "steak",
  "burger",
];

const DAIRY_KEYWORDS = [
  "milk",
  "butter",
  "cheese",
  "yogurt",
  "cream",
  "whey",
  "casein",
];

const GLUTEN_KEYWORDS = [
  "bread",
  "pasta",
  "flour",
  "tortilla",
  "bagel",
  "muffin",
  "cracker",
  "breadcrumbs",
  "soy sauce",
];

function perServingMacros(recipe: Recipe) {
  const servings = Math.max(recipe.defaultServings || 1, 1);
  return {
    calories: recipe.totalMacros.calories / servings,
    protein: recipe.totalMacros.protein / servings,
    carbs: recipe.totalMacros.carbs / servings,
    fat: recipe.totalMacros.fat / servings,
  };
}

function recipeText(recipe: Recipe) {
  return recipe.ingredients.map((ingredient) => ingredient.name.toLowerCase()).join(" ");
}

export function inferRecipeDietaryTags(recipe: Recipe) {
  const text = recipeText(recipe);
  const perServing = perServingMacros(recipe);
  const hasMeat = MEAT_KEYWORDS.some((keyword) => text.includes(keyword));
  const hasDairy = DAIRY_KEYWORDS.some((keyword) => text.includes(keyword));
  const hasGluten = GLUTEN_KEYWORDS.some((keyword) => text.includes(keyword));
  const hasEgg = text.includes("egg");
  const hasHoney = text.includes("honey");

  return {
    "high-protein": perServing.protein >= 30,
    "low-fat": perServing.fat <= 12,
    "low-calories": perServing.calories <= 450,
    keto: perServing.carbs <= 15,
    vegan: !hasMeat && !hasDairy && !hasEgg && !hasHoney,
    vegetarian: !hasMeat,
    "dairy-free": !hasDairy,
    "gluten-free": !hasGluten,
  } satisfies Record<Exclude<RecipeFilterValue, "all" | "favorites">, boolean>;
}

export function recipeMatchesFilter(
  recipe: Recipe,
  filter: RecipeFilterValue,
  favoriteIds: Set<string>
) {
  if (filter === "all") return true;
  if (filter === "favorites") return favoriteIds.has(recipe.id);
  return inferRecipeDietaryTags(recipe)[filter];
}

export function readFavoriteRecipeIds() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const raw = window.localStorage.getItem(RECIPE_FAVORITES_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
}

export function writeFavoriteRecipeIds(ids: Iterable<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RECIPE_FAVORITES_STORAGE_KEY, JSON.stringify([...ids]));
}

export function filterLabel(filter: RecipeFilterValue) {
  switch (filter) {
    case "all":
      return "All Recipes";
    case "favorites":
      return "Favorites";
    case "high-protein":
      return "High Protein";
    case "low-fat":
      return "Low Fat";
    case "low-calories":
      return "Low Calories";
    case "keto":
      return "Keto";
    case "vegan":
      return "Vegan";
    case "vegetarian":
      return "Vegetarian";
    case "dairy-free":
      return "Dairy-Free";
    case "gluten-free":
      return "Gluten-Free";
  }
}
