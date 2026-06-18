"use client";


import {
  getPlannedMeals,
  upsertPlannedMeal,
  deletePlannedMealBySlot,
  setPlannedMealLogged,
} from "../../lib/planner-db";
import {
  getSnackSortOrder,
  mapPlannedMealsToPlannerState,
} from "../../lib/planner-mappers";
import { useEffect, useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import {
  TEMPLATE_RECIPES,
  addRecipe,
  importRecipeShareCode,
  loadRecipes,
  mergeImportedRecipe,
  type Ingredient,
  type Recipe,
} from "../../lib/recipes";
import { addLogEntry, deleteLogEntry, todayISO } from "../../lib/macroLog";
import {
  type MealSlot,
  type MealSlotKey,
  type SnackSlot,
  type PlannerDayKey,
  type PlannerStateByDay,
} from "../../lib/plannerStorage";
import { loadGroceryList, saveGroceryList, type GroceryMode } from "../../lib/grocery";
import { getMyHousehold, type HouseholdRow } from "../../lib/households-db";
import { addIngredientsToGrocery } from "../../lib/mealplan";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import {
  createIngredient,
  listVisibleIngredients,
  promoteIngredientToVerifiedForTesting,
  type IngredientRecord as IngredientLibraryItem,
} from "../../lib/supabase/ingredients-db";
import type { ImportedRecipeDraft } from "../../lib/recipe-url-import";



type PlannerTab = "planner" | "recipes" | "create";
type ImportMode = "website" | "code";
type BuilderSection = "import" | "basics" | "ingredients" | "steps" | "review";

const BUILDER_SECTIONS: { id: BuilderSection; label: string; helper: string }[] = [
  { id: "import", label: "Import", helper: "Optional start" },
  { id: "basics", label: "Basics", helper: "Name and macros" },
  { id: "ingredients", label: "Ingredients", helper: "Foods and amounts" },
  { id: "steps", label: "Steps", helper: "Cooking notes" },
  { id: "review", label: "Review", helper: "Save recipe" },
];

type FoodSuggestion = {
  sourceName: string;
  sourceId: string;
  name: string;
  foodCategory?: string | null;
  caloriesPer100g?: number | null;
  proteinPer100g?: number | null;
  carbsPer100g?: number | null;
  fatPer100g?: number | null;
  confidence?: number | null;
};

type AverageFoodCandidate = {
  name: string;
  foodCategory?: string | null;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  sourceIds: string[];
  matchCount: number;
  confidence: number;
};

type ActiveSlot =
  | { type: "meal"; key: MealSlotKey }
  | { type: "snack"; key: string }
  | null;

function createDefaultMealSlots(): Record<MealSlotKey, MealSlot> {
  return {
    breakfast: { recipe: null, servings: 1, logged: false },
    lunch: { recipe: null, servings: 1, logged: false },
    dinner: { recipe: null, servings: 1, logged: false },
  };
}

function createDefaultSnackSlots(): SnackSlot[] {
  return [
    { id: crypto.randomUUID(), recipe: null, servings: 1, logged: false },
  ];
}

function emptyIngredient(): Ingredient {
  return { name: "", qty: "", category: "produce" };
}

function normalizeIngredientName(value: string) {
  return value.trim().toLowerCase();
}

function formatCatalogFoodName(name: string) {
  return name
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\bUsda\b/g, "USDA");
}

function catalogFoodGroupKey(suggestion: FoodSuggestion) {
  return formatCatalogFoodName(suggestion.name)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function averageNumericField(
  suggestions: FoodSuggestion[],
  field: "caloriesPer100g" | "proteinPer100g" | "carbsPer100g" | "fatPer100g" | "confidence"
) {
  const values = suggestions
    .map((suggestion) => Number(suggestion[field]))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function clampSourceConfidence(value: number) {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(1, Math.max(0, roundMacroValue(value)));
}

function describeUnknownError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  if (error && typeof error === "object") {
    const errorLike = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
      error_description?: unknown;
    };
    const parts = [
      errorLike.message,
      errorLike.details,
      errorLike.hint,
      errorLike.error_description,
      errorLike.code ? `Code: ${errorLike.code}` : null,
    ]
      .filter((part): part is string | number => typeof part === "string" || typeof part === "number")
      .map(String);

    if (parts.length > 0) return parts.join(" ");

    try {
      return JSON.stringify(error);
    } catch {
      return "";
    }
  }

  return "";
}

function buildAverageFoodCandidate(query: string, suggestions: FoodSuggestion[]) {
  const groups = new Map<string, FoodSuggestion[]>();
  const normalizedQuery = normalizeIngredientName(query);

  for (const suggestion of suggestions) {
    const key = catalogFoodGroupKey(suggestion);
    const group = groups.get(key) ?? [];
    group.push(suggestion);
    groups.set(key, group);
  }

  const summarized = Array.from(groups.entries()).map(([key, group]) => {
    const first = group[0];

    return {
      key,
      candidate: {
        name: formatCatalogFoodName(first.name),
        foodCategory: first.foodCategory ?? group.find((item) => item.foodCategory)?.foodCategory,
        caloriesPer100g: roundMacroValue(averageNumericField(group, "caloriesPer100g")),
        proteinPer100g: roundMacroValue(averageNumericField(group, "proteinPer100g")),
        carbsPer100g: roundMacroValue(averageNumericField(group, "carbsPer100g")),
        fatPer100g: roundMacroValue(averageNumericField(group, "fatPer100g")),
        sourceIds: group.map((item) => item.sourceId).filter(Boolean),
        matchCount: group.length,
        confidence: clampSourceConfidence(averageNumericField(group, "confidence")) ?? 0.82,
      } satisfies AverageFoodCandidate,
    };
  });

  return summarized
    .filter(({ candidate }) => candidate.caloriesPer100g > 0 || candidate.proteinPer100g > 0)
    .sort((a, b) => {
      const aExact = a.key === normalizedQuery ? 1 : 0;
      const bExact = b.key === normalizedQuery ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;

      const aIncludes = a.key.includes(normalizedQuery) || normalizedQuery.includes(a.key) ? 1 : 0;
      const bIncludes = b.key.includes(normalizedQuery) || normalizedQuery.includes(b.key) ? 1 : 0;
      if (aIncludes !== bIncludes) return bIncludes - aIncludes;

      return b.candidate.matchCount - a.candidate.matchCount;
    })[0]?.candidate ?? null;
}

function sanitizeImportedIngredientName(value: string) {
  return value
    .replace(/\(\s*\$[^)]*\)/gi, "")
    .replace(/\(\s*about[^)]*\)/gi, "")
    .replace(/\(\s*approx[^)]*\)/gi, "")
    .replace(/\(\s*approximately[^)]*\)/gi, "")
    .replace(/\(\s*\d+(?:\.\d+)?\s*(?:oz|ounce|ounces|lb|lbs|pound|pounds|g|gram|grams|kg|kilogram|kilograms)[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findBestIngredientMatch(
  ingredientName: string,
  ingredientLibrary: IngredientLibraryItem[],
  ingredientLibraryByName: Map<string, IngredientLibraryItem>
) {
  const normalizedName = normalizeIngredientName(sanitizeImportedIngredientName(ingredientName));
  if (!normalizedName) return null;

  const exact = ingredientLibraryByName.get(normalizedName);
  if (exact) return exact;

  const candidates = ingredientLibrary
    .filter((ingredient) => {
      const candidateName = normalizeIngredientName(ingredient.name);
      return (
        normalizedName.includes(candidateName) ||
        candidateName.includes(normalizedName)
      );
    })
    .sort((a, b) => b.name.length - a.name.length);

  return candidates[0] ?? null;
}

function parseImportedIngredientLine(line: string): Ingredient {
  const cleaned = line.replace(/\s+/g, " ").trim();
  if (!cleaned) return emptyIngredient();

  const match = cleaned.match(
    /^((?:\d+(?:\.\d+)?|\d+\/\d+|\d+\s+\d+\/\d+)(?:\s*[-–]\s*(?:\d+(?:\.\d+)?|\d+\/\d+|\d+\s+\d+\/\d+))?(?:\s+(?:cups?|cup|tablespoons?|tbsp|teaspoons?|tsp|ounces?|oz|pounds?|lbs?|grams?|g|kilograms?|kg|cloves?|slices?|cans?|packages?|pkg|fillets?|breasts?|thighs?|eggs?|pinch|dash))?)\s+(?:of\s+)?(.+)$/i
  );

  if (!match) {
    return { name: sanitizeImportedIngredientName(cleaned), qty: "", category: "other" };
  }

  return {
    name: sanitizeImportedIngredientName(match[2]),
    qty: match[1].trim(),
    category: "other",
  };
}

const WEIGHT_UNIT_TO_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
};

type IngredientVolumeConversion = {
  ingredientKeywords: string[];
  cup: number;
  tbsp: number;
  tsp: number;
};

type IngredientConversionProfile = {
  cup_g: number | null;
  tbsp_g: number | null;
  tsp_g: number | null;
  piece_g: number | null;
  piece_label: string | null;
};

const MILLILITERS_PER_CUP = 236.588;
const MILLILITERS_PER_TABLESPOON = 14.7868;
const MILLILITERS_PER_TEASPOON = 4.92892;

const VOLUME_CONVERSIONS: IngredientVolumeConversion[] = [
  { ingredientKeywords: ["water"], cup: 236.59, tbsp: 14.79, tsp: 4.93 },
  { ingredientKeywords: ["milk"], cup: 245, tbsp: 15.31, tsp: 5.1 },
  { ingredientKeywords: ["greek yogurt", "yogurt"], cup: 245, tbsp: 15.31, tsp: 5.1 },
  { ingredientKeywords: ["cottage cheese"], cup: 226, tbsp: 14.13, tsp: 4.71 },
  { ingredientKeywords: ["rice", "cooked rice"], cup: 158, tbsp: 9.88, tsp: 3.29 },
  { ingredientKeywords: ["oats", "rolled oats"], cup: 80, tbsp: 5, tsp: 1.67 },
  { ingredientKeywords: ["quinoa", "cooked quinoa"], cup: 185, tbsp: 11.56, tsp: 3.85 },
  { ingredientKeywords: ["pasta", "cooked pasta"], cup: 140, tbsp: 8.75, tsp: 2.92 },
  { ingredientKeywords: ["berries", "blueberries", "strawberries"], cup: 148, tbsp: 9.25, tsp: 3.08 },
  { ingredientKeywords: ["broth", "stock"], cup: 240, tbsp: 15, tsp: 5 },
  { ingredientKeywords: ["olive oil", "oil"], cup: 216, tbsp: 13.5, tsp: 4.5 },
  { ingredientKeywords: ["butter"], cup: 227, tbsp: 14.19, tsp: 4.73 },
  { ingredientKeywords: ["honey"], cup: 340, tbsp: 21.25, tsp: 7.08 },
  { ingredientKeywords: ["maple syrup"], cup: 315, tbsp: 19.69, tsp: 6.56 },
  { ingredientKeywords: ["peanut butter", "almond butter"], cup: 258, tbsp: 16.13, tsp: 5.38 },
  { ingredientKeywords: ["protein powder"], cup: 120, tbsp: 7.5, tsp: 2.5 },
  { ingredientKeywords: ["flour"], cup: 120, tbsp: 7.5, tsp: 2.5 },
  { ingredientKeywords: ["sugar"], cup: 200, tbsp: 12.5, tsp: 4.17 },
];

type PieceConversion = {
  ingredientKeywords: string[];
  unitAliases: string[];
  gramsPerUnit: number;
};

const PIECE_CONVERSIONS: PieceConversion[] = [
  { ingredientKeywords: ["chicken breast"], unitAliases: ["breast", "breasts"], gramsPerUnit: 174 },
  { ingredientKeywords: ["chicken thigh"], unitAliases: ["thigh", "thighs"], gramsPerUnit: 112 },
  { ingredientKeywords: ["salmon fillet", "salmon"], unitAliases: ["fillet", "fillets"], gramsPerUnit: 154 },
  { ingredientKeywords: ["tilapia fillet", "tilapia"], unitAliases: ["fillet", "fillets"], gramsPerUnit: 87 },
  { ingredientKeywords: ["pork chop", "pork loin chop"], unitAliases: ["chop", "chops"], gramsPerUnit: 170 },
  { ingredientKeywords: ["steak", "sirloin steak", "ribeye"], unitAliases: ["steak", "steaks"], gramsPerUnit: 227 },
  { ingredientKeywords: ["turkey burger", "burger patty", "beef patty"], unitAliases: ["patty", "patties"], gramsPerUnit: 113 },
  { ingredientKeywords: ["egg white"], unitAliases: ["egg white", "egg whites"], gramsPerUnit: 33 },
  { ingredientKeywords: ["egg"], unitAliases: ["egg", "eggs"], gramsPerUnit: 50 },
  { ingredientKeywords: ["banana"], unitAliases: ["banana", "bananas"], gramsPerUnit: 118 },
  { ingredientKeywords: ["avocado"], unitAliases: ["avocado", "avocados"], gramsPerUnit: 150 },
  { ingredientKeywords: ["apple"], unitAliases: ["apple", "apples"], gramsPerUnit: 182 },
  { ingredientKeywords: ["orange"], unitAliases: ["orange", "oranges"], gramsPerUnit: 131 },
  { ingredientKeywords: ["potato", "russet potato", "sweet potato"], unitAliases: ["potato", "potatoes"], gramsPerUnit: 173 },
  { ingredientKeywords: ["onion"], unitAliases: ["onion", "onions"], gramsPerUnit: 110 },
  { ingredientKeywords: ["bell pepper", "pepper"], unitAliases: ["pepper", "peppers"], gramsPerUnit: 119 },
  { ingredientKeywords: ["garlic clove", "garlic"], unitAliases: ["clove", "cloves"], gramsPerUnit: 5 },
  { ingredientKeywords: ["bread"], unitAliases: ["slice", "slices"], gramsPerUnit: 30 },
  { ingredientKeywords: ["tortilla"], unitAliases: ["tortilla", "tortillas"], gramsPerUnit: 49 },
  { ingredientKeywords: ["bagel"], unitAliases: ["bagel", "bagels"], gramsPerUnit: 95 },
  { ingredientKeywords: ["muffin"], unitAliases: ["muffin", "muffins"], gramsPerUnit: 57 },
];

function parseFractionalAmount(value: string) {
  const raw = value.trim();
  if (!raw) return null;

  if (/^\d+\s+\d+\/\d+$/.test(raw)) {
    const [whole, fraction] = raw.split(/\s+/);
    const [num, den] = fraction.split("/").map(Number);
    if (!den) return null;
    return Number(whole) + num / den;
  }

  if (/^\d+\/\d+$/.test(raw)) {
    const [num, den] = raw.split("/").map(Number);
    if (!den) return null;
    return num / den;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function findVolumeConversion(ingredientName: string) {
  const normalized = normalizeIngredientName(ingredientName);
  return VOLUME_CONVERSIONS.find((conversion) =>
    conversion.ingredientKeywords.some((keyword) => normalized.includes(keyword))
  );
}

function findPieceConversion(ingredientName: string, unit: string) {
  const normalizedName = normalizeIngredientName(ingredientName);
  const normalizedUnit = unit.trim().toLowerCase();

  return PIECE_CONVERSIONS.find(
    (conversion) =>
      conversion.unitAliases.includes(normalizedUnit) &&
      conversion.ingredientKeywords.some((keyword) => normalizedName.includes(keyword))
  );
}

function matchesPieceLabel(unit: string, pieceLabel?: string | null) {
  if (!pieceLabel?.trim()) return false;
  const normalizedUnit = unit.trim().toLowerCase();
  const normalizedLabel = pieceLabel.trim().toLowerCase();

  if (normalizedUnit === normalizedLabel) return true;
  if (`${normalizedLabel}s` === normalizedUnit) return true;
  return false;
}

function getMilliliterDensity(
  ingredientName: string,
  conversionProfile?: IngredientConversionProfile | null
) {
  if (conversionProfile?.cup_g != null) {
    return Number(conversionProfile.cup_g) / MILLILITERS_PER_CUP;
  }
  if (conversionProfile?.tbsp_g != null) {
    return Number(conversionProfile.tbsp_g) / MILLILITERS_PER_TABLESPOON;
  }
  if (conversionProfile?.tsp_g != null) {
    return Number(conversionProfile.tsp_g) / MILLILITERS_PER_TEASPOON;
  }

  const conversion = findVolumeConversion(ingredientName);
  if (conversion) {
    return conversion.cup / MILLILITERS_PER_CUP;
  }

  return null;
}

function parseQuantityToGrams(
  qty?: string,
  ingredientName = "",
  conversionProfile?: IngredientConversionProfile | null
) {
  const raw = qty?.trim().toLowerCase();
  if (!raw) return null;

  const match = raw.match(/^(\d+(?:\s+\d+\/\d+)?|\d+\/\d+|[0-9]*\.?[0-9]+)\s*([a-z ]+)?$/);
  if (!match) return null;

  const amount = parseFractionalAmount(match[1]);
  if (amount == null || amount <= 0) return null;

  const parsedUnit = match[2]?.trim().toLowerCase() ?? "";
  const inferredPieceLabel =
    conversionProfile?.piece_label && normalizeIngredientName(ingredientName).includes(
      normalizeIngredientName(conversionProfile.piece_label)
    )
      ? conversionProfile.piece_label
      : null;

  if (!parsedUnit) {
    if (conversionProfile?.piece_g != null && inferredPieceLabel) {
      return roundMacroValue(amount * Number(conversionProfile.piece_g));
    }

    const singularPieceConversion = PIECE_CONVERSIONS.find((conversion) =>
      conversion.ingredientKeywords.some((keyword) =>
        normalizeIngredientName(ingredientName).includes(keyword)
      )
    );

    if (singularPieceConversion) {
      return roundMacroValue(amount * singularPieceConversion.gramsPerUnit);
    }
  }

  const unit = parsedUnit || "g";

  if (unit in WEIGHT_UNIT_TO_GRAMS) {
    return roundMacroValue(amount * WEIGHT_UNIT_TO_GRAMS[unit]);
  }

  if (
    [
      "ml",
      "milliliter",
      "milliliters",
      "millilitre",
      "millilitres",
      "l",
      "liter",
      "liters",
      "litre",
      "litres",
    ].includes(unit)
  ) {
    const density = getMilliliterDensity(ingredientName, conversionProfile);
    if (density == null) return null;

    const milliliters =
      unit === "l" ||
      unit === "liter" ||
      unit === "liters" ||
      unit === "litre" ||
      unit === "litres"
        ? amount * 1000
        : amount;

    return roundMacroValue(milliliters * density);
  }

  if (["cup", "cups", "tbsp", "tablespoon", "tablespoons", "tsp", "teaspoon", "teaspoons"].includes(unit)) {
    if (
      conversionProfile &&
      ((unit === "cup" || unit === "cups") && conversionProfile.cup_g != null ||
        (unit === "tbsp" || unit === "tablespoon" || unit === "tablespoons") && conversionProfile.tbsp_g != null ||
        (unit === "tsp" || unit === "teaspoon" || unit === "teaspoons") && conversionProfile.tsp_g != null)
    ) {
      if (unit === "cup" || unit === "cups") {
        return roundMacroValue(amount * Number(conversionProfile.cup_g));
      }
      if (unit === "tbsp" || unit === "tablespoon" || unit === "tablespoons") {
        return roundMacroValue(amount * Number(conversionProfile.tbsp_g));
      }
      return roundMacroValue(amount * Number(conversionProfile.tsp_g));
    }

    const conversion = findVolumeConversion(ingredientName);
    if (!conversion) return null;

    if (unit === "cup" || unit === "cups") return roundMacroValue(amount * conversion.cup);
    if (unit === "tbsp" || unit === "tablespoon" || unit === "tablespoons") {
      return roundMacroValue(amount * conversion.tbsp);
    }
    return roundMacroValue(amount * conversion.tsp);
  }

  if (conversionProfile?.piece_g != null && matchesPieceLabel(unit, conversionProfile.piece_label)) {
    return roundMacroValue(amount * Number(conversionProfile.piece_g));
  }

  const pieceConversion = findPieceConversion(ingredientName, unit);
  if (pieceConversion) {
    return roundMacroValue(amount * pieceConversion.gramsPerUnit);
  }

  return null;
}

function formatIngredientLibraryOption(ingredient: IngredientLibraryItem) {
  const label = ingredient.visibility === "public" ? "Verified" : "Your ingredient";
  return `${ingredient.name} (${label})`;
}

function roundMacroValue(value: number) {
  return Math.round(value * 100) / 100;
}

function formatMacroLine(recipe: Recipe, servings: number) {
  const scaled = macrosForRecipe(recipe, servings);
  return `${scaled.calories} kcal Ã¢â‚¬Â¢ P ${scaled.protein} Ã¢â‚¬Â¢ C ${scaled.carbs} Ã¢â‚¬Â¢ F ${scaled.fat}`;
}

function macrosForRecipe(recipe: Recipe, servings: number) {
  const base = Math.max(recipe.defaultServings || 1, 1);
  const factor = servings / base;

  return {
    calories: Math.round((recipe.totalMacros.calories || 0) * factor),
    protein: Math.round((recipe.totalMacros.protein || 0) * factor),
    carbs: Math.round((recipe.totalMacros.carbs || 0) * factor),
    fat: Math.round((recipe.totalMacros.fat || 0) * factor),
  };
}

function scaleQty(qty: string | undefined, factor: number) {
  if (!qty) return "";
  const raw = qty.trim();
  if (!raw) return "";

  const match = raw.match(
    /^\s*([0-9]*\.?[0-9]+)\s*([\-Ã¢â‚¬â€œ]\s*([0-9]*\.?[0-9]+))?\s*(.*)$/
  );

  if (!match) return factor === 1 ? raw : `${raw} x${factor}`;

  const n1 = Number(match[1]);
  const n2 = match[3] ? Number(match[3]) : null;
  const rest = (match[4] ?? "").trim();

  const fmt = (n: number) => {
    const rounded = Math.round(n * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  };

  const scaled1 = n1 * factor;
  const scaled2 = n2 !== null ? n2 * factor : null;

  if (scaled2 !== null) {
    const dash = raw.includes("Ã¢â‚¬â€œ") ? "Ã¢â‚¬â€œ" : "-";
    return `${fmt(scaled1)}${dash}${fmt(scaled2)}${rest ? " " + rest : ""}`.trim();
  }

  return `${fmt(scaled1)}${rest ? " " + rest : ""}`.trim();
}

function ingredientFromLibrary(ingredient: IngredientLibraryItem): Ingredient {
  return {
    name: ingredient.name,
    qty: "100g",
    category: "other",
    ingredientId: ingredient.id,
    quantityGrams: 100,
    isLinked: true,
    isPrivate: ingredient.visibility === "private",
  };
}

function formatParsedQuantityHint(
  ingredient: Ingredient,
  conversionProfile?: IngredientConversionProfile | null
) {
  const grams = parseQuantityToGrams(ingredient.qty, ingredient.name, conversionProfile);
  if (grams == null) return null;
  return `Parsed as ~${grams}g for macro calculations.`;
}

function buildInventoryIngredientCreateHref(name: string) {
  const params = new URLSearchParams({
    returnTo: "/recipes/create",
  });

  if (name.trim()) {
    params.set("prefillName", name.trim());
  }

  return `/inventory/add?${params.toString()}`;
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
        active
          ? "bg-blue-600 text-white shadow-[0_10px_30px_rgba(37,99,235,0.28)]"
          : "bg-gray-800 text-gray-300 hover:bg-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function MealActionButton({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl bg-gray-700 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function formatMacroPreview(recipe: Recipe, servings: number) {
  const macros = macrosForRecipe(recipe, servings);
  return `+${macros.calories} kcal Ã¢â‚¬Â¢ +${macros.protein}P Ã¢â‚¬Â¢ +${macros.carbs}C Ã¢â‚¬Â¢ +${macros.fat}F`;
}


export default function MealsPage() {
  const [tab, setTab] = useState<PlannerTab>("create");

  const [myRecipes, setMyRecipes] = useState<Recipe[]>([]);
const [authChecked, setAuthChecked] = useState(false);
const [redirecting, setRedirecting] = useState(false);
const router = useRouter();
const [currentUserId, setCurrentUserId] = useState<string | null>(null);
const [groceryMode, setGroceryMode] = useState<GroceryMode>("personal");
const [household, setHousehold] = useState<HouseholdRow | null>(null);

const [selectedDay, setSelectedDay] = useState<PlannerDayKey>("today");

const [plannerByDay, setPlannerByDay] = useState<PlannerStateByDay>({
  today: {
    mealSlots: createDefaultMealSlots(),
    snackSlots: createDefaultSnackSlots(),
  },
  tomorrow: {
    mealSlots: createDefaultMealSlots(),
    snackSlots: createDefaultSnackSlots(),
  },
  day3: {
    mealSlots: createDefaultMealSlots(),
    snackSlots: createDefaultSnackSlots(),
  },
});

const mealSlots = plannerByDay[selectedDay].mealSlots;
const snackSlots = plannerByDay[selectedDay].snackSlots;

const [plannerMsg, setPlannerMsg] = useState<string | null>(null);
const [plannerErr, setPlannerErr] = useState<string | null>(null);
  const [, setActiveSlot] = useState<ActiveSlot>(null);

  const [viewerRecipe, setViewerRecipe] = useState<Recipe | null>(null);
  const [viewerServings, setViewerServings] = useState(1);

  const [recipeName, setRecipeName] = useState("");
  const [defaultServings, setDefaultServings] = useState(2);
  const [totalCalories, setTotalCalories] = useState("");
  const [totalProtein, setTotalProtein] = useState("");
  const [totalCarbs, setTotalCarbs] = useState("");
  const [totalFat, setTotalFat] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([emptyIngredient()]);
  const [steps, setSteps] = useState<string[]>([""]);
  const [ingredientLibrary, setIngredientLibrary] = useState<IngredientLibraryItem[]>([]);
  const [recipeCreateError, setRecipeCreateError] = useState<string | null>(null);
  const [recipeCreateMsg, setRecipeCreateMsg] = useState<string | null>(null);
  const [ingredientManagerSaving, setIngredientManagerSaving] = useState(false);
  const [ingredientManagerSearch, setIngredientManagerSearch] = useState("");
  const [publicIngredientSearch, setPublicIngredientSearch] = useState("");
  const [averageNutritionLookupIndex, setAverageNutritionLookupIndex] = useState<number | null>(null);
  const [averageNutritionError, setAverageNutritionError] = useState<string | null>(null);
  const [averageNutritionRowErrors, setAverageNutritionRowErrors] = useState<Record<number, string>>({});

  const [recipeShareCode, setRecipeShareCode] = useState("");
  const [recipeShareMsg, setRecipeShareMsg] = useState<string | null>(null);
  const [recipeShareErr, setRecipeShareErr] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("website");
  const [recipeUrl, setRecipeUrl] = useState("");
  const [recipeUrlImporting, setRecipeUrlImporting] = useState(false);
  const [recipeUrlErr, setRecipeUrlErr] = useState<string | null>(null);
  const [recipeUrlMsg, setRecipeUrlMsg] = useState<string | null>(null);
  const [lastImportedWebsiteRecipe, setLastImportedWebsiteRecipe] =
    useState<ImportedRecipeDraft | null>(null);
  const [importPreviewRecipe, setImportPreviewRecipe] =
    useState<ImportedRecipeDraft | null>(null);
  const [importPreviewWarning, setImportPreviewWarning] = useState<string | null>(null);
  const [builderSection, setBuilderSection] = useState<BuilderSection>("import");

const [lastLogUndo, setLastLogUndo] = useState<
  | {
      entryId: string;
      date: string;
      type: "meal" | "snack";
      day: PlannerDayKey;
      slotKey?: MealSlotKey;
      snackId?: string;
      label: string;
    }
  | null
>(null);


useEffect(() => {
  async function init() {
    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) {
        setRedirecting(true);
        router.replace("/auth");
        return;
      }

      const user = sessionData.session?.user ?? null;

      if (!user) {
        setRedirecting(true);
        router.replace("/auth");
        return;
      }

      setCurrentUserId(user.id);
      setRedirecting(false);

      try {
        const currentHousehold = await getMyHousehold();
        setHousehold(currentHousehold);
      } catch (error) {
        console.warn("Household lookup failed during meals init.", error);
      }

      setGroceryMode("personal");

      try {
        const visibleIngredients = await listVisibleIngredients(user.id);
        setIngredientLibrary(visibleIngredients);
      } catch (error) {
        console.warn("Ingredient library failed during meals init.", error);
      }

      let recipes: Recipe[] = [];

      try {
        recipes = await loadRecipes();
        setMyRecipes(recipes);
      } catch (error) {
        console.error("Recipe loading failed during meals init.", error);
        setPlannerErr("Recipes could not be loaded right now. The rest of Meals is still available.");
      }

      try {
        const plannedMeals = await getPlannedMeals();
        const mappedPlanner = mapPlannedMealsToPlannerState(
          plannedMeals,
          [...TEMPLATE_RECIPES, ...recipes]
        );
        setPlannerByDay(mappedPlanner);
      } catch (error) {
        console.error("Planner loading failed during meals init.", error);
        setPlannerErr("Meal planner data could not be loaded right now.");
      }

      setAuthChecked(true);
    } catch (error) {
      console.error("Failed to initialize meals page:", error);
      setPlannerErr("Meals could not be initialized.");
      setRedirecting(false);
      setAuthChecked(true);
    }
  }

  init();
}, [router]);



  const ingredientLibraryByName = useMemo(() => {
    const map = new Map<string, IngredientLibraryItem>();

    ingredientLibrary.forEach((ingredient) => {
      map.set(normalizeIngredientName(ingredient.name), ingredient);
    });

    return map;
  }, [ingredientLibrary]);

  const privateIngredients = useMemo(
    () => ingredientLibrary.filter((ingredient) => ingredient.visibility === "private"),
    [ingredientLibrary]
  );
  const publicIngredients = useMemo(
    () =>
      ingredientLibrary.filter(
        (ingredient) =>
          ingredient.visibility === "public" &&
          ingredient.verification_status === "verified"
      ),
    [ingredientLibrary]
  );
  const filteredPrivateIngredients = useMemo(() => {
    const query = ingredientManagerSearch.trim().toLowerCase();
    if (!query) return privateIngredients;

    return privateIngredients.filter((ingredient) =>
      ingredient.name.toLowerCase().includes(query)
    );
  }, [ingredientManagerSearch, privateIngredients]);
  const filteredAndSortedPrivateIngredients = useMemo(
    () => [...filteredPrivateIngredients].sort((a, b) => a.name.localeCompare(b.name)),
    [filteredPrivateIngredients]
  );

  const filteredPublicIngredients = useMemo(() => {
    const query = publicIngredientSearch.trim().toLowerCase();
    const items = [...publicIngredients].sort((a, b) => a.name.localeCompare(b.name));

    if (!query) return items;

    return items.filter((ingredient) =>
      ingredient.name.toLowerCase().includes(query)
    );
  }, [publicIngredientSearch, publicIngredients]);

  const recipeBuilderAnalysis = useMemo(() => {
    const rows = ingredients
      .map((ingredient, index) => {
        const name = ingredient.name.trim();
        if (!name) return null;

        const matchedIngredient =
          (ingredient.ingredientId
            ? ingredientLibrary.find((item) => item.id === ingredient.ingredientId)
            : undefined) ??
          findBestIngredientMatch(name, ingredientLibrary, ingredientLibraryByName);

        const quantityGrams =
          ingredient.quantityGrams ??
          parseQuantityToGrams(ingredient.qty, ingredient.name, matchedIngredient);

        return {
          id: `builder-${index}`,
          name,
          category: ingredient.category,
          qty: ingredient.qty?.trim() || undefined,
          ingredientId: matchedIngredient?.id,
          quantityGrams: quantityGrams ?? undefined,
          matchedIngredient,
          isLinked: Boolean(matchedIngredient && quantityGrams),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const unresolved = rows.filter((row) => !row.ingredientId);
    const invalidLinked = rows.filter((row) => row.ingredientId && row.quantityGrams == null);
    const linkedRows = rows.filter(
      (row) => row.matchedIngredient && row.quantityGrams != null
    );

    const linkedTotals = linkedRows.reduce(
      (totals, row) => {
        const quantityGrams = row.quantityGrams ?? 0;
        const ingredient = row.matchedIngredient;
        if (!ingredient) return totals;

        totals.calories += (Number(ingredient.calories_per_100g ?? 0) * quantityGrams) / 100;
        totals.protein += (Number(ingredient.protein_per_100g ?? 0) * quantityGrams) / 100;
        totals.carbs += (Number(ingredient.carbs_per_100g ?? 0) * quantityGrams) / 100;
        totals.fat += (Number(ingredient.fat_per_100g ?? 0) * quantityGrams) / 100;
        return totals;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    const roundedTotals = {
      calories: roundMacroValue(linkedTotals.calories),
      protein: roundMacroValue(linkedTotals.protein),
      carbs: roundMacroValue(linkedTotals.carbs),
      fat: roundMacroValue(linkedTotals.fat),
    };

    const hasCalculatedLinkedMacros =
      roundedTotals.calories > 0 ||
      roundedTotals.protein > 0 ||
      roundedTotals.carbs > 0 ||
      roundedTotals.fat > 0;

    return {
      rows,
      unresolved,
      invalidLinked,
      linkedRows,
      linkedTotals: roundedTotals,
      hasCalculatedLinkedMacros,
    };
  }, [ingredients, ingredientLibrary, ingredientLibraryByName]);

  const livePerServingMacros = useMemo(() => {
    const servings = Math.max(1, Number(defaultServings) || 1);
    return {
      calories: roundMacroValue(recipeBuilderAnalysis.linkedTotals.calories / servings),
      protein: roundMacroValue(recipeBuilderAnalysis.linkedTotals.protein / servings),
      carbs: roundMacroValue(recipeBuilderAnalysis.linkedTotals.carbs / servings),
      fat: roundMacroValue(recipeBuilderAnalysis.linkedTotals.fat / servings),
    };
  }, [defaultServings, recipeBuilderAnalysis]);

  const builderSectionIndex = BUILDER_SECTIONS.findIndex(
    (section) => section.id === builderSection
  );
  const previousBuilderSection = BUILDER_SECTIONS[builderSectionIndex - 1]?.id ?? null;
  const nextBuilderSection = BUILDER_SECTIONS[builderSectionIndex + 1]?.id ?? null;

async function undoLastLog() {
  const undo = lastLogUndo;
  if (!undo) return;

  await deleteLogEntry(undo.date, undo.entryId);

  setPlannerByDay((prev) => {
    const next = { ...prev };

    if (undo.type === "meal" && undo.slotKey) {
      next[undo.day] = {
        ...next[undo.day],
        mealSlots: {
          ...next[undo.day].mealSlots,
          [undo.slotKey]: {
            ...next[undo.day].mealSlots[undo.slotKey],
            logged: false,
          },
        },
      };
    }

    if (undo.type === "snack" && undo.snackId) {
      next[undo.day] = {
        ...next[undo.day],
        snackSlots: next[undo.day].snackSlots.map((snack) =>
          snack.id === undo.snackId
            ? { ...snack, logged: false }
            : snack
        ),
      };
    }

    return next;
  });

  try {
    if (undo.type === "meal" && undo.slotKey) {
      const meal = plannerByDay[undo.day].mealSlots[undo.slotKey];

      if (meal.recipe) {
                const result = await setPlannedMealLogged(undo.day, "meal", undo.slotKey, false);

        if (result.error) {
          setPlannerErr(result.error);
          return;
        }
      }
    }

    if (undo.type === "snack" && undo.snackId) {
      const snack = plannerByDay[undo.day].snackSlots.find(
        (s) => s.id === undo.snackId
      );

      if (snack?.recipe) {
                const result = await setPlannedMealLogged(
          undo.day,
          "snack",
          undo.snackId,
          false
        );

        if (result.error) {
          setPlannerErr(result.error);
          return;
        }
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to undo logged state";
    setPlannerErr(message);
    return;
  }

  setPlannerErr(null);
  setPlannerMsg(`Undid log for ${undo.label} Ã¢â€ Â©`);
  setLastLogUndo(null);

  window.setTimeout(() => setPlannerMsg(null), 1800);
}

function collectPlannerIngredients() {
  const collected: Ingredient[] = [];

  (["breakfast", "lunch", "dinner"] as MealSlotKey[]).forEach((slotKey) => {
    const slot = mealSlots[slotKey];
    if (!slot.recipe) return;

    const factor = slot.servings / Math.max(slot.recipe.defaultServings || 1, 1);

    slot.recipe.ingredients.forEach((ing) => {
      collected.push({
        ...ing,
        qty: scaleQty(ing.qty, factor),
      });
    });
  });

  snackSlots.forEach((snack) => {
    if (!snack.recipe) return;

    const factor = snack.servings / Math.max(snack.recipe.defaultServings || 1, 1);

    snack.recipe.ingredients.forEach((ing) => {
      collected.push({
        ...ing,
        qty: scaleQty(ing.qty, factor),
      });
    });
  });

  return collected;
}

async function generateGroceryFromPlanner() {
  try {
    const ingredients = collectPlannerIngredients();

    if (ingredients.length === 0) {
      setPlannerErr("No meals selected to generate groceries.");
      setPlannerMsg(null);
      return;
    }

const currentList = await loadGroceryList(groceryMode);
const next = await addIngredientsToGrocery(currentList, ingredients, groceryMode);

await saveGroceryList(next, groceryMode);

setPlannerErr(null);
setPlannerMsg(
  `Added ${ingredients.length} ingredient lines to ${
    groceryMode === "household" ? "household" : "personal"
  } grocery Ã¢Å“â€¦`
);

    window.setTimeout(() => setPlannerMsg(null), 1800);
  } catch {
    setPlannerMsg(null);
    setPlannerErr("CouldnÃ¢â‚¬â„¢t generate grocery list.");
  }
}

async function clearMealSlot(slot: MealSlotKey) {
  setPlannerByDay((prev) => ({
    ...prev,
    [selectedDay]: {
      ...prev[selectedDay],
      mealSlots: {
        ...prev[selectedDay].mealSlots,
        [slot]: { recipe: null, servings: 1, logged: false },
      },
    },
  }));

  try {
    await deletePlannedMealBySlot(selectedDay, "meal", slot);
  } catch (error) {
    console.error("Failed to clear meal slot:", error);
  }
}


async function markMealSlotLogged(slot: MealSlotKey) {
  const day = selectedDay;
  const meal = plannerByDay[day].mealSlots[slot];
  if (!meal.recipe || meal.logged) return;

  const macros = macrosForRecipe(meal.recipe, meal.servings);
  const name =
    meal.servings > 1 ? `${meal.recipe.name} x${meal.servings}` : meal.recipe.name;

  const entry = await addLogEntry(name, macros);

  setLastLogUndo({
    entryId: entry.id,
    date: todayISO(),
    type: "meal",
    day,
    slotKey: slot,
    label: name,
  });

  setPlannerByDay((prev) => ({
    ...prev,
    [day]: {
      ...prev[day],
      mealSlots: {
        ...prev[day].mealSlots,
        [slot]: {
          ...prev[day].mealSlots[slot],
          logged: true,
        },
      },
    },
  }));

    const result = await setPlannedMealLogged(day, "meal", slot, true);

  if (result.error) {
    setPlannerMsg(null);
    setPlannerErr(result.error);
    return;
  }
}

async function clearSnack(id: string) {
  setPlannerByDay((prev) => ({
    ...prev,
    [selectedDay]: {
      ...prev[selectedDay],
      snackSlots: prev[selectedDay].snackSlots.map((snack) =>
        snack.id === id
          ? { ...snack, recipe: null, servings: 1, logged: false }
          : snack
      ),
    },
  }));

  try {
    await deletePlannedMealBySlot(selectedDay, "snack", id);
  } catch (error) {
    console.error("Failed to clear snack slot:", error);
  }
}

async function markSnackLogged(id: string) {
  const day = selectedDay;
  const snack = plannerByDay[day].snackSlots.find((s) => s.id === id);
  if (!snack?.recipe || snack.logged) return;

  const macros = macrosForRecipe(snack.recipe, snack.servings);
  const name =
    snack.servings > 1 ? `${snack.recipe.name} x${snack.servings}` : snack.recipe.name;

  const entry = await addLogEntry(name, macros);

  setLastLogUndo({
    entryId: entry.id,
    date: todayISO(),
    type: "snack",
    day,
    snackId: id,
    label: name,
  });

  setPlannerByDay((prev) => ({
    ...prev,
    [day]: {
      ...prev[day],
      snackSlots: prev[day].snackSlots.map((item) =>
        item.id === id ? { ...item, logged: true } : item
      ),
    },
  }));

  const result = await setPlannedMealLogged(day, "snack", id, true);

  if (result.error) {
    setPlannerMsg(null);
    setPlannerErr(result.error);
    return;
  }
}

async function updateSnackServings(id: string, delta: number) {
  const currentSnack = plannerByDay[selectedDay].snackSlots.find(
    (snack) => snack.id === id
  );

  if (!currentSnack) return;

  const nextServings = Math.max(1, currentSnack.servings + delta);

  setPlannerByDay((prev) => ({
    ...prev,
    [selectedDay]: {
      ...prev[selectedDay],
      snackSlots: prev[selectedDay].snackSlots.map((snack) =>
        snack.id === id
          ? { ...snack, servings: nextServings }
          : snack
      ),
    },
  }));

  if (!currentSnack.recipe) return;

  const result = await upsertPlannedMeal({
    day_key: selectedDay,
    slot_type: "snack",
    slot_key: id,
    recipe_id: currentSnack.recipe.isTemplate ? null : currentSnack.recipe.id,
    template_id: currentSnack.recipe.isTemplate ? currentSnack.recipe.id : null,
    servings: nextServings,
    logged: currentSnack.logged,
    sort_order: getSnackSortOrder(plannerByDay[selectedDay].snackSlots, id),
  });

  if (result.error) {
    setPlannerMsg(null);
    setPlannerErr(result.error);
    return;
  }
}

 function addSnackSlot() {
  setPlannerByDay((prev) => ({
    ...prev,
    [selectedDay]: {
      ...prev[selectedDay],
      snackSlots: [
        ...prev[selectedDay].snackSlots,
        { id: crypto.randomUUID(), recipe: null, servings: 1, logged: false },
      ],
    },
  }));
}

function collectAllPlannedIngredients() {
  const collected: Ingredient[] = [];

  (Object.keys(plannerByDay) as PlannerDayKey[]).forEach((dayKey) => {
    const day = plannerByDay[dayKey];

    (["breakfast", "lunch", "dinner"] as MealSlotKey[]).forEach((slotKey) => {
      const slot = day.mealSlots[slotKey];
      if (!slot.recipe) return;

      const factor = slot.servings / Math.max(slot.recipe.defaultServings || 1, 1);

      slot.recipe.ingredients.forEach((ing) => {
        collected.push({
          ...ing,
          qty: scaleQty(ing.qty, factor),
        });
      });
    });

    day.snackSlots.forEach((snack) => {
      if (!snack.recipe) return;

      const factor = snack.servings / Math.max(snack.recipe.defaultServings || 1, 1);

      snack.recipe.ingredients.forEach((ing) => {
        collected.push({
          ...ing,
          qty: scaleQty(ing.qty, factor),
        });
      });
    });
  });

  return collected;
}
async function updateMealSlotServings(slot: MealSlotKey, delta: number) {
  const currentSlot = plannerByDay[selectedDay].mealSlots[slot];
  const nextServings = Math.max(1, currentSlot.servings + delta);

  setPlannerByDay((prev) => ({
    ...prev,
    [selectedDay]: {
      ...prev[selectedDay],
      mealSlots: {
        ...prev[selectedDay].mealSlots,
        [slot]: {
          ...prev[selectedDay].mealSlots[slot],
          servings: nextServings,
        },
      },
    },
  }));

  if (!currentSlot.recipe) return;

  const result = await upsertPlannedMeal({
    day_key: selectedDay,
    slot_type: "meal",
    slot_key: slot,
    recipe_id: currentSlot.recipe.isTemplate ? null : currentSlot.recipe.id,
    template_id: currentSlot.recipe.isTemplate ? currentSlot.recipe.id : null,
    servings: nextServings,
    logged: currentSlot.logged,
    sort_order: 0,
  });

  if (result.error) {
    setPlannerMsg(null);
    setPlannerErr(result.error);
    return;
  }
}

async function generateGroceryFromAllDays() {
  try {
    const ingredients = collectAllPlannedIngredients();

    if (ingredients.length === 0) {
      setPlannerErr("No planned meals found across days.");
      setPlannerMsg(null);
      return;
    }

const currentList = await loadGroceryList(groceryMode);
const next = await addIngredientsToGrocery(currentList, ingredients, groceryMode);

await saveGroceryList(next, groceryMode);

setPlannerErr(null);
setPlannerMsg(
  `Added groceries from all planned days to ${
    groceryMode === "household" ? "household" : "personal"
  } grocery Ã¢Å“â€¦`
);

    window.setTimeout(() => setPlannerMsg(null), 1800);
  } catch {
    setPlannerMsg(null);
    setPlannerErr("CouldnÃ¢â‚¬â„¢t generate grocery list.");
  }
}

  function chooseMealForSlot(slot: MealSlotKey) {
    setActiveSlot({ type: "meal", key: slot });
    setTab("recipes");
  }

  function chooseMealForSnack(id: string) {
    setActiveSlot({ type: "snack", key: id });
    setTab("recipes");
  }

  function openViewer(recipe: Recipe, servings?: number) {
    setViewerRecipe(recipe);
    setViewerServings(servings ?? recipe.defaultServings ?? 1);
  }

  function closeViewer() {
    setViewerRecipe(null);
    setViewerServings(1);
  }

  function addIngredientToRecipeBuilder(ingredient: IngredientLibraryItem) {
    setTab("create");
    setIngredients((prev) => {
      const emptyIndex = prev.findIndex((item) => !item.name.trim());
      const nextIngredient = ingredientFromLibrary(ingredient);

      if (emptyIndex >= 0) {
        return prev.map((item, index) => (index === emptyIndex ? nextIngredient : item));
      }

      return [...prev, nextIngredient];
    });

    setRecipeCreateMsg(`Added "${ingredient.name}" to the recipe builder.`);
    setRecipeCreateError(null);
  }

  function updateIngredient(i: number, patch: Partial<Ingredient>) {
    if (patch.name !== undefined || patch.qty !== undefined) {
      setAverageNutritionRowErrors((prev) => {
        if (!prev[i]) return prev;
        const next = { ...prev };
        delete next[i];
        return next;
      });
      setAverageNutritionError(null);
    }

    setIngredients((prev) =>
      prev.map((ing, idx) => {
        if (idx !== i) return ing;

        const next = { ...ing, ...patch };
        const normalizedName = normalizeIngredientName(next.name);
        const matchedIngredient =
          ingredientLibraryByName.get(normalizedName) ??
          findBestIngredientMatch(next.name, ingredientLibrary, ingredientLibraryByName);

        if (patch.name !== undefined) {
          if (matchedIngredient) {
            next.ingredientId = matchedIngredient.id;
            next.isLinked = true;
            next.isPrivate = matchedIngredient.visibility === "private";
          } else {
            next.ingredientId = undefined;
            next.isLinked = false;
            next.isPrivate = false;
          }
        }

        if (patch.qty !== undefined) {
          const matchedForQty =
            next.ingredientId != null
              ? ingredientLibrary.find((item) => item.id === next.ingredientId) ?? matchedIngredient
              : matchedIngredient;
          const grams = parseQuantityToGrams(next.qty, next.name, matchedForQty);
          next.quantityGrams = grams ?? undefined;
        }

        return next;
      })
    );
  }

  async function createAverageNutritionIngredient(index: number) {
    if (!currentUserId) {
      setAverageNutritionError("Sign in before creating averaged nutrition ingredients.");
      setAverageNutritionRowErrors((prev) => ({
        ...prev,
        [index]: "Sign in before creating averaged nutrition ingredients.",
      }));
      return;
    }

    const ingredient = ingredients[index];
    const query = ingredient?.name.trim();

    if (!query) {
      setAverageNutritionError("Type an ingredient name before searching average nutrition.");
      setAverageNutritionRowErrors((prev) => ({
        ...prev,
        [index]: "Type an ingredient name before searching average nutrition.",
      }));
      return;
    }

    setAverageNutritionLookupIndex(index);
    setAverageNutritionError(null);
    setAverageNutritionRowErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setRecipeCreateMsg(null);

    try {
      const response = await fetch(
        `/api/catalog/foods/search?q=${encodeURIComponent(query)}&limit=20`
      );

      const payload = (await response.json()) as { foods?: FoodSuggestion[]; error?: string };

      if (!response.ok) {
        const message =
          payload.error ??
          `Average nutrition lookup is unavailable right now.`;

        setAverageNutritionError(message);
        setAverageNutritionRowErrors((prev) => ({
          ...prev,
          [index]: message,
        }));
        return;
      }

      const averageFood = buildAverageFoodCandidate(query, payload.foods ?? []);

      if (!averageFood) {
        const message = `No usable USDA nutrition average was found for "${query}".`;
        setAverageNutritionError(message);
        setAverageNutritionRowErrors((prev) => ({
          ...prev,
          [index]: message,
        }));
        return;
      }

      let createdIngredient =
        ingredientLibraryByName.get(normalizeIngredientName(averageFood.name)) ??
        findBestIngredientMatch(averageFood.name, ingredientLibrary, ingredientLibraryByName);

      if (!createdIngredient) {
        createdIngredient = await createIngredient(currentUserId, {
          name: averageFood.name,
          reference_amount_g: 100,
          reference_calories: averageFood.caloriesPer100g,
          reference_protein_g: averageFood.proteinPer100g,
          reference_carbs_g: averageFood.carbsPer100g,
          reference_fat_g: averageFood.fatPer100g,
          visibility: "private",
          verification_status: "custom",
          ingredient_type: "raw",
          food_category: averageFood.foodCategory ?? null,
          data_source: "usda_fdc_average",
          external_source_id: averageFood.sourceIds[0] ?? null,
          source_confidence: clampSourceConfidence(averageFood.confidence),
          source_note: `USDA average of ${averageFood.matchCount} matched food record${
            averageFood.matchCount === 1 ? "" : "s"
          } for "${query}".`,
        });
      }

      setIngredientLibrary((prev) =>
        [...prev.filter((item) => item.id !== createdIngredient.id), createdIngredient].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );

      setIngredients((prev) =>
        prev.map((item, itemIndex) => {
          if (itemIndex !== index) return item;

          const nextQuantityGrams =
            parseQuantityToGrams(item.qty, createdIngredient.name, createdIngredient) ??
            item.quantityGrams;

          return {
            ...item,
            name: createdIngredient.name,
            ingredientId: createdIngredient.id,
            quantityGrams: nextQuantityGrams,
            isLinked: true,
            isPrivate: true,
          };
        })
      );

      setRecipeCreateMsg(
        createdIngredient.data_source === "usda_fdc_average"
          ? `Linked "${createdIngredient.name}" using an average of ${averageFood.matchCount} USDA nutrition match${
              averageFood.matchCount === 1 ? "" : "es"
            }.`
          : `Linked "${createdIngredient.name}" from your ingredient library.`
      );
    } catch (error) {
      if (error instanceof Error) {
        console.warn("Average nutrition ingredient could not be created:", error.message);
      }
      const message = error instanceof Error ? error.message : "Average nutrition could not be created.";
      setAverageNutritionError(message);
      setAverageNutritionRowErrors((prev) => ({
        ...prev,
        [index]: message,
      }));
    } finally {
      setAverageNutritionLookupIndex(null);
    }
  }

  async function promotePrivateIngredientForTesting(ingredient: IngredientLibraryItem) {
    if (!currentUserId) return;

    const confirmed = window.confirm(
      `Temporarily promote "${ingredient.name}" into the verified ingredient library for testing?`
    );

    if (!confirmed) return;

    setIngredientManagerSaving(true);

    try {
      const promotedIngredient = await promoteIngredientToVerifiedForTesting(
        ingredient.id,
        currentUserId
      );

      const refreshedIngredients = await listVisibleIngredients(currentUserId);
      setIngredientLibrary(refreshedIngredients);

      setIngredients((prev) =>
        prev.map((item) =>
          item.ingredientId === ingredient.id
            ? {
                ...item,
                name: promotedIngredient.name,
                isLinked: true,
                isPrivate: false,
              }
            : item
        )
      );

    } catch (error) {
      console.error("Private ingredient could not be promoted.", error);
    } finally {
      setIngredientManagerSaving(false);
    }
  }

  function addIngredientRow() {
    setIngredients((prev) => [...prev, emptyIngredient()]);
  }

  function removeIngredientRow(i: number) {
    setIngredients((prev) => prev.filter((_, idx) => idx !== i));
  }

  function openInventoryIngredientCreate(index: number) {
    const ingredient = ingredients[index];
    const href = buildInventoryIngredientCreateHref(ingredient?.name ?? "");
    router.push(href);
  }

  function updateStep(i: number, value: string) {
    setSteps((prev) => prev.map((step, idx) => (idx === i ? value : step)));
  }

  function addStepRow() {
    setSteps((prev) => [...prev, ""]);
  }

  function removeStepRow(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

 async function onCreateRecipe(e: React.FormEvent) {
    e.preventDefault();
    setRecipeCreateError(null);
    setRecipeCreateMsg(null);

    const cleanedName = recipeName.trim();

    const cleanedIngredients = recipeBuilderAnalysis.rows.map((row) => ({
      name: row.name,
      qty: row.qty,
      category: row.category,
      ingredientId: row.ingredientId,
      quantityGrams: row.quantityGrams,
      isLinked: row.isLinked,
    }));

    const cleanedSteps = steps
      .map((step) => step.trim())
      .filter((step) => step.length > 0);

    const servingsNum = Math.max(1, Number(defaultServings) || 1);

    if (!cleanedName) {
      setRecipeCreateError("Give the recipe a name before saving.");
      setBuilderSection("basics");
      return;
    }

    if (cleanedIngredients.length === 0) {
      setRecipeCreateError("Add at least one ingredient before saving.");
      setBuilderSection("ingredients");
      return;
    }

    const invalidLinkedIngredients = recipeBuilderAnalysis.invalidLinked;

    if (invalidLinkedIngredients.length > 0) {
      setRecipeCreateError(
        "Linked ingredients need gram-based quantities like 120g or 0.5kg so Macro OS can calculate macros accurately."
      );
      setBuilderSection("ingredients");
      return;
    }

    const unresolvedIngredients = recipeBuilderAnalysis.unresolved;

    const recipeIngredientsForSave = recipeBuilderAnalysis.rows.map((row) => ({
      name: row.name,
      qty: row.qty,
      category: row.category,
      ingredientId: row.ingredientId,
      quantityGrams: row.quantityGrams,
      isLinked: row.isLinked,
      isPrivate: row.matchedIngredient?.visibility === "private",
    }));

    if (unresolvedIngredients.length > 0) {
      setRecipeCreateMsg(
        `${unresolvedIngredients.length} ingredient${
          unresolvedIngredients.length === 1 ? "" : "s"
        } saved as manual entries. Add nutrition later before counting on macro totals.`
      );
    }

try {
  const nextRecipes = await addRecipe(myRecipes, {
    name: cleanedName,
    ingredients: recipeIngredientsForSave,
      defaultServings: servingsNum,
      totalMacros: {
      calories: recipeBuilderAnalysis.hasCalculatedLinkedMacros
        ? recipeBuilderAnalysis.linkedTotals.calories
        : Number(totalCalories) || 0,
      protein: recipeBuilderAnalysis.hasCalculatedLinkedMacros
        ? recipeBuilderAnalysis.linkedTotals.protein
        : Number(totalProtein) || 0,
      carbs: recipeBuilderAnalysis.hasCalculatedLinkedMacros
        ? recipeBuilderAnalysis.linkedTotals.carbs
        : Number(totalCarbs) || 0,
      fat: recipeBuilderAnalysis.hasCalculatedLinkedMacros
        ? recipeBuilderAnalysis.linkedTotals.fat
        : Number(totalFat) || 0,
    },
    steps: cleanedSteps,
  });

  setMyRecipes(nextRecipes);
} catch (error) {
  const message = describeUnknownError(error) || "Recipe could not be saved.";
  console.warn("Failed to create recipe:", message);
  setRecipeCreateError(message);
  return;
}

    setRecipeName("");
    setDefaultServings(2);
    setTotalCalories("");
    setTotalProtein("");
    setTotalCarbs("");
    setTotalFat("");
    setIngredients([emptyIngredient()]);
    setSteps([""]);
    setBuilderSection("import");
    setTab("recipes");
  }
async function onImportRecipe() {
  try {
    const imported = importRecipeShareCode(recipeShareCode);
    const nextRecipes = await mergeImportedRecipe(myRecipes, imported);
    setMyRecipes(nextRecipes);
    setRecipeShareCode("");
    setRecipeShareErr(null);
    setRecipeShareMsg("Recipe imported Ã¢Å“â€¦");
    window.setTimeout(() => setRecipeShareMsg(null), 1600);
  } catch {
    setRecipeShareMsg(null);
    setRecipeShareErr("Invalid recipe code.");
  }
}

function applyImportedRecipeDraft(recipe: ImportedRecipeDraft) {
  setRecipeName(recipe.title);
  setDefaultServings(Math.max(1, recipe.servings ?? 2));
  setIngredients(
    recipe.ingredients.length > 0
      ? recipe.ingredients.map((line) => parseImportedIngredientLine(line))
      : [emptyIngredient()]
  );
  setSteps(recipe.steps.length > 0 ? recipe.steps : [""]);
  setTotalCalories("");
  setTotalProtein("");
  setTotalCarbs("");
  setTotalFat("");
  setRecipeCreateError(null);
  setRecipeCreateMsg(
    `Imported ${recipe.ingredients.length} ingredient${
      recipe.ingredients.length === 1 ? "" : "s"
    } and ${recipe.steps.length} step${recipe.steps.length === 1 ? "" : "s"} from the website.`
  );
  setBuilderSection("basics");
  window.setTimeout(() => setRecipeCreateMsg(null), 2200);
}

function updateImportPreviewField(
  field: "title" | "description" | "servings",
  value: string
) {
  setImportPreviewRecipe((prev) => {
    if (!prev) return prev;

    if (field === "servings") {
      const parsed = Number(value);
      return {
        ...prev,
        servings: Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null,
      };
    }

    return {
      ...prev,
      [field]: value,
    };
  });
}

function updateImportPreviewList(
  field: "ingredients" | "steps",
  index: number,
  value: string
) {
  setImportPreviewRecipe((prev) => {
    if (!prev) return prev;
    const next = [...prev[field]];
    next[index] = value;
    return {
      ...prev,
      [field]: next,
    };
  });
}

function removeImportPreviewListItem(field: "ingredients" | "steps", index: number) {
  setImportPreviewRecipe((prev) => {
    if (!prev) return prev;
    const next = prev[field].filter((_, itemIndex) => itemIndex !== index);
    return {
      ...prev,
      [field]: next.length > 0 ? next : [""],
    };
  });
}

function addImportPreviewListItem(field: "ingredients" | "steps") {
  setImportPreviewRecipe((prev) => {
    if (!prev) return prev;
    return {
      ...prev,
      [field]: [...prev[field], ""],
    };
  });
}

function autoResizeTextarea(event: React.FormEvent<HTMLTextAreaElement>) {
  const textarea = event.currentTarget;
  textarea.style.height = "0px";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function applyImportPreviewToBuilder() {
  if (!importPreviewRecipe) return;

  const cleanedPreview: ImportedRecipeDraft = {
    ...importPreviewRecipe,
    title: importPreviewRecipe.title.trim(),
    description: importPreviewRecipe.description?.trim() || null,
    ingredients: importPreviewRecipe.ingredients
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
    steps: importPreviewRecipe.steps
      .map((step) => step.trim())
      .filter((step) => step.length > 0),
  };

  applyImportedRecipeDraft(cleanedPreview);
  setLastImportedWebsiteRecipe(cleanedPreview);
  setImportPreviewRecipe(null);
  setImportPreviewWarning(null);
  setRecipeUrl("");
  setRecipeUrlErr(null);
  setRecipeUrlMsg("Import preview applied to the builder.");
  window.setTimeout(() => setRecipeUrlMsg(null), 2200);
}

async function onImportRecipeUrl() {
  const trimmedUrl = recipeUrl.trim();
  if (!trimmedUrl) return;

  setRecipeUrlImporting(true);
  setRecipeUrlErr(null);
  setRecipeUrlMsg(null);

  try {
    const response = await fetch("/api/recipe-import", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: trimmedUrl }),
    });

    const payload = (await response.json()) as {
      error?: string;
      recipe?: ImportedRecipeDraft;
      warning?: string | null;
    };

    if (!response.ok || !payload.recipe) {
      throw new Error(payload.error || "Recipe URL could not be imported.");
    }

    setImportPreviewRecipe({
      ...payload.recipe,
      ingredients:
        payload.recipe.ingredients.length > 0 ? payload.recipe.ingredients : [""],
      steps: payload.recipe.steps.length > 0 ? payload.recipe.steps : [""],
    });
    setImportPreviewWarning(payload.warning ?? null);
    setRecipeUrlMsg("Recipe website imported. Review the cleanup preview below.");
    window.setTimeout(() => setRecipeUrlMsg(null), 2200);
  } catch (error) {
    setRecipeUrlErr(
      error instanceof Error
        ? error.message
        : "Recipe website could not be imported."
    );
  } finally {
    setRecipeUrlImporting(false);
  }
}

if (redirecting || !authChecked) {
  return (
    <AppShell title="Create Recipe" subtitle="Build manually or import a recipe" backHref="/recipes" backLabel="Recipe Book">
      <div className="text-sm text-gray-400">Loading...</div>
    </AppShell>
  );
}
function BuilderSectionButton({
  active,
  label,
  helper,
  onClick,
}: {
  active: boolean;
  label: string;
  helper: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-[116px] rounded-2xl border px-3 py-2 text-left transition ${
        active
          ? "border-blue-400/50 bg-blue-600 text-white shadow-[0_10px_30px_rgba(37,99,235,0.22)]"
          : "border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800"
      }`}
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className={`mt-0.5 text-[11px] ${active ? "text-blue-100" : "text-gray-500"}`}>
        {helper}
      </div>
    </button>
  );
}
  return (
    <AppShell title="Create Recipe" subtitle="Build manually or import a recipe" backHref="/recipes" backLabel="Recipe Book">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2">
          <TabButton active={tab === "create"} onClick={() => setTab("create")}>
            Builder
          </TabButton>
          <TabButton active={tab === "recipes"} onClick={() => setTab("recipes")}>
            Ingredient Library
          </TabButton>
        </div>

        {viewerRecipe && (
          <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-white">{viewerRecipe.name}</h2>
                <div className="mt-1 text-sm text-gray-400">
                  {formatMacroLine(viewerRecipe, viewerServings)}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Default servings: {viewerRecipe.defaultServings}
                </div>
              </div>

              <button
                type="button"
                onClick={closeViewer}
                className="rounded-xl bg-gray-700 px-3 py-2 text-sm font-semibold hover:bg-gray-600"
              >
                Close
              </button>
            </div>

            <div className="mt-4 rounded-xl bg-gray-900 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-200">Servings</div>
                <div className="flex items-center gap-2">
                  <MealActionButton onClick={() => setViewerServings((s) => Math.max(1, s - 1))}>
                    Ã¢â‚¬â€œ
                  </MealActionButton>
                  <div className="min-w-[48px] text-center text-sm font-semibold text-white">
                    {viewerServings}
                  </div>
                  <MealActionButton onClick={() => setViewerServings((s) => s + 1)}>
                    +
                  </MealActionButton>
                </div>
              </div>

              <div className="text-sm font-semibold text-gray-200">Ingredients</div>
              <ul className="mt-2 space-y-2 text-sm text-gray-300">
                {viewerRecipe.ingredients.map((ing, idx) => {
                  const factor = viewerServings / Math.max(viewerRecipe.defaultServings || 1, 1);
                  return (
                    <li key={idx} className="flex items-start justify-between gap-3">
                      <span>{ing.name}</span>
                      <span className="text-gray-500">
                        {scaleQty(ing.qty, factor)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-4 rounded-xl bg-gray-900 p-3">
              <div className="text-sm font-semibold text-gray-200">Steps</div>
              {viewerRecipe.steps && viewerRecipe.steps.length > 0 ? (
                <ol className="mt-2 space-y-2 text-sm text-gray-300">
                  {viewerRecipe.steps.map((step, idx) => (
                    <li key={idx} className="flex gap-2">
                      <span className="font-semibold text-gray-500">{idx + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-sm text-gray-500">No steps saved.</p>
              )}
            </div>
          </div>
        )}

        {false && tab === "planner" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
  <TabButton active={selectedDay === "today"} onClick={() => setSelectedDay("today")}>
    Today
  </TabButton>
  <TabButton
    active={selectedDay === "tomorrow"}
    onClick={() => setSelectedDay("tomorrow")}
  >
    Tomorrow
  </TabButton>
  <TabButton active={selectedDay === "day3"} onClick={() => setSelectedDay("day3")}>
    Day 3
  </TabButton>
</div>
            <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-white">
  {selectedDay === "today"
    ? "TodayÃ¢â‚¬â„¢s Meals"
    : selectedDay === "tomorrow"
    ? "TomorrowÃ¢â‚¬â„¢s Meals"
    : "Day 3 Meals"}
</h2>
              <p className="mt-1 text-sm text-gray-400">
                Choose meals for each slot, view steps, and log them as you go.
              </p>
            </div>
<div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
  <div className="flex items-center justify-between gap-3">
    <div>
      <h2 className="text-lg font-semibold text-white">Planner Actions</h2>
      <p className="mt-1 text-sm text-gray-400">
        Generate your grocery list from the meals currently planned.
      </p>
    </div>
  </div>

  {plannerMsg && (
    <div className="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
      {plannerMsg}
    </div>
  )}

  {plannerErr && (
    <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
      {plannerErr}
    </div>
  )}

<div className="mt-3 rounded-xl bg-gray-900 p-3">
  <div className="text-sm font-semibold text-white">Grocery Destination</div>
  <p className="mt-1 text-xs text-gray-400">
    Choose whether generated groceries go to your personal list or shared household list.
  </p>

  <div className="mt-3 flex gap-2">
    <button
      type="button"
      onClick={() => setGroceryMode("personal")}
      className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${
        groceryMode === "personal"
          ? "bg-emerald-600 text-white"
          : "bg-gray-800 text-gray-300 hover:bg-gray-700"
      }`}
    >
      Personal
    </button>

    {household && (
      <button
        type="button"
        onClick={() => setGroceryMode("household")}
        className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${
          groceryMode === "household"
            ? "bg-emerald-600 text-white"
            : "bg-gray-800 text-gray-300 hover:bg-gray-700"
        }`}
      >
        Household
      </button>
    )}
  </div>
</div>

 <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
  <button
    type="button"
    onClick={generateGroceryFromPlanner}
    className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
  >
    Generate This Day to {groceryMode === "household" ? "Household" : "Personal"}
  </button>

  <button
    type="button"
    onClick={generateGroceryFromAllDays}
    className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
  >
    Generate All Days to {groceryMode === "household" ? "Household" : "Personal"}
  </button>

</div>

{lastLogUndo && (
  <div className="mt-3">
    <button
      type="button"
      onClick={undoLastLog}
      className="w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-700"
    >
      Undo Last Log
    </button>
  </div>
)}

</div>
       {(["breakfast", "lunch", "dinner"] as MealSlotKey[]).map((slotKey) => {
              const slot = mealSlots[slotKey];
              const recipe = slot.recipe;
              const logged = slot.logged;

              return (
                <div
                  key={slotKey}
                  className={`rounded-2xl border p-4 shadow-sm ${
                    logged
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : "border-gray-700 bg-gray-800"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold capitalize text-white">{slotKey}</h3>
                    {logged && (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-300">
                      Logged
                      </span>
                    )}
                  </div>

                  {recipe ? (
                    <div className="mt-3 space-y-3">
                      <div className="rounded-xl bg-gray-900 p-3">
  <div className="text-sm font-semibold text-white leading-snug">
    {recipe.name}
  </div>
  <div className="mt-1 text-xs text-gray-400">
    {formatMacroLine(recipe, slot.servings)}
  </div>
  <div className="mt-2 rounded-lg bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
    {formatMacroPreview(recipe, slot.servings)}
  </div>
</div>

                      <div className="flex items-center justify-between rounded-xl bg-gray-900 px-3 py-2">
  <span className="text-xs uppercase tracking-wide text-gray-400">Servings</span>
  <div className="flex items-center gap-2">
    <MealActionButton
      onClick={() => updateMealSlotServings(slotKey, -1)}
      disabled={slot.servings <= 1}
    >
      Ã¢â‚¬â€œ
    </MealActionButton>
    <div className="min-w-[48px] text-center text-sm font-semibold text-white">
      {slot.servings}x
    </div>
    <MealActionButton onClick={() => updateMealSlotServings(slotKey, 1)}>
      +
    </MealActionButton>
  </div>
</div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <MealActionButton onClick={() => chooseMealForSlot(slotKey)}>
                          Choose Meal
                        </MealActionButton>
                        <MealActionButton onClick={() => openViewer(recipe, slot.servings)}>
                          View Steps
                        </MealActionButton>
                        <MealActionButton
                          onClick={() => markMealSlotLogged(slotKey)}
                          disabled={slot.logged}
                        >
                          Log Meal
                        </MealActionButton>
                        <MealActionButton onClick={() => clearMealSlot(slotKey)}>
                          Clear
                        </MealActionButton>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div className="rounded-xl bg-gray-900 p-3 text-sm text-gray-500">
                        No meal selected yet.
                      </div>
                      <MealActionButton onClick={() => chooseMealForSlot(slotKey)}>
                        Choose Meal
                      </MealActionButton>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Additional Snacks</h3>
                <MealActionButton onClick={addSnackSlot}>+ Add Snack</MealActionButton>
              </div>

              <div className="mt-4 space-y-3">
                {snackSlots.map((snack, idx) => (
                  <div
                    key={snack.id}
                    className={`rounded-xl border p-3 ${
                      snack.logged
                        ? "border-emerald-500/30 bg-emerald-500/10"
                        : "border-gray-700 bg-gray-900"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-white">Snack {idx + 1}</div>
                      {snack.logged && (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-300">
  Logged
</span>
                      )}
                    </div>

                    {snack.recipe ? (
                      <>
                        <div className="mt-2 text-sm font-medium text-white">
                          {snack.recipe.name}
                        </div>
                        <div className="mt-1 text-xs text-gray-400">
                          {formatMacroLine(snack.recipe, snack.servings)}
                        </div>
                        <div className="mt-2 text-xs font-medium text-emerald-300">
                          {formatMacroPreview(snack.recipe, snack.servings)}
                        </div>

                        <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-800 px-3 py-2">
  <span className="text-xs uppercase tracking-wide text-gray-400">Servings</span>
  <div className="flex items-center gap-2">
    <MealActionButton
      onClick={() => updateSnackServings(snack.id, -1)}
      disabled={snack.servings <= 1}
    >
      Ã¢â‚¬â€œ
    </MealActionButton>
    <div className="min-w-[48px] text-center text-sm font-semibold text-white">
      {snack.servings}x
    </div>
    <MealActionButton onClick={() => updateSnackServings(snack.id, 1)}>
      +
    </MealActionButton>
  </div>
</div>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <MealActionButton onClick={() => chooseMealForSnack(snack.id)}>
                            Choose Snack
                          </MealActionButton>
                          <MealActionButton
                            onClick={() => openViewer(snack.recipe!, snack.servings)}
                          >
                            View Steps
                          </MealActionButton>
                          <MealActionButton
                            onClick={() => markSnackLogged(snack.id)}
                            disabled={snack.logged}
                          >
                            Log Snack
                          </MealActionButton>
                          <MealActionButton onClick={() => clearSnack(snack.id)}>
                            Clear
                          </MealActionButton>
                        </div>
                      </>
                    ) : (
                      <div className="mt-3">
                        <MealActionButton onClick={() => chooseMealForSnack(snack.id)}>
                          Choose Snack
                        </MealActionButton>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "recipes" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-white">Ingredient Libraries</h2>
              <p className="mt-1 text-sm text-gray-400">
                Browse verified ingredients and reference your private library while building.
              </p>
            </div>

            <div className="rounded-3xl border border-gray-700 bg-gray-900/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-200">Verified Ingredient Library</h3>
                  <p className="mt-1 text-xs text-gray-400">
                    Search your verified ingredient database and send items back into the builder.
                  </p>
                </div>
                <div className="text-xs text-gray-500">{publicIngredients.length} verified</div>
              </div>

              <input
                value={publicIngredientSearch}
                onChange={(e) => setPublicIngredientSearch(e.target.value)}
                placeholder="Search verified ingredients..."
                className="mt-3 w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
              />

              {publicIngredients.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-gray-700 p-3 text-sm text-gray-400">
                  No verified public ingredients are available yet.
                </div>
              ) : filteredPublicIngredients.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-gray-700 p-3 text-sm text-gray-400">
                  No verified ingredients match &quot;{publicIngredientSearch.trim()}&quot;.
                </div>
              ) : (
                <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {filteredPublicIngredients.map((ingredient) => (
                    <div
                      key={ingredient.id}
                      className="rounded-xl border border-gray-700 bg-gray-950/60 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-white">{ingredient.name}</div>
                          <div className="mt-1 text-xs text-gray-400">
                            Ref {ingredient.reference_amount_g}g • {ingredient.reference_calories} kcal • P{" "}
                            {ingredient.reference_protein_g} • C {ingredient.reference_carbs_g} • F{" "}
                            {ingredient.reference_fat_g}
                          </div>
                        </div>
                        <div className="mt-3">
                          <MealActionButton onClick={() => addIngredientToRecipeBuilder(ingredient)}>
                            Use In Recipe
                          </MealActionButton>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-200">My Private Ingredients</h3>
                  <p className="mt-1 text-xs text-gray-400">
                    Your full edit and delete tools are also available in the Create tab below the builder.
                  </p>
                </div>
                <div className="text-xs text-gray-500">{privateIngredients.length} saved</div>
              </div>

              <input
                value={ingredientManagerSearch}
                onChange={(e) => setIngredientManagerSearch(e.target.value)}
                placeholder="Search private ingredients..."
                className="mt-3 w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
              />

              {privateIngredients.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-gray-700 p-3 text-sm text-gray-400">
                  No private ingredients yet. Create one from an unknown recipe ingredient to start your personal library.
                </div>
              ) : filteredAndSortedPrivateIngredients.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-gray-700 p-3 text-sm text-gray-400">
                  No private ingredients match &quot;{ingredientManagerSearch.trim()}&quot;.
                </div>
              ) : (
                <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {filteredAndSortedPrivateIngredients.map((ingredient) => (
                    <div
                      key={ingredient.id}
                      className="rounded-xl border border-gray-700 bg-gray-950/60 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-white">{ingredient.name}</div>
                          <div className="mt-1 text-xs text-gray-400">
                            Ref {ingredient.reference_amount_g}g • {ingredient.reference_calories} kcal • P{" "}
                            {ingredient.reference_protein_g} • C {ingredient.reference_carbs_g} • F{" "}
                            {ingredient.reference_fat_g}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => promotePrivateIngredientForTesting(ingredient)}
                          disabled={ingredientManagerSaving}
                          className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Test Promote
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {tab === "create" && (
          <form
            onSubmit={onCreateRecipe}
            className="space-y-4 rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-white">Create Recipe</h2>

            <div className="rounded-3xl border border-gray-700 bg-gray-950/40 p-3">
              <div className="overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex min-w-max gap-2">
                  {BUILDER_SECTIONS.map((section) => (
                    <BuilderSectionButton
                      key={section.id}
                      active={builderSection === section.id}
                      label={section.label}
                      helper={section.helper}
                      onClick={() => setBuilderSection(section.id)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {recipeCreateMsg && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                {recipeCreateMsg}
              </div>
            )}

            {recipeCreateError && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                {recipeCreateError}
              </div>
            )}

            {builderSection === "import" && (
            <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Import Recipe</h3>
                  <p className="mt-1 text-sm text-gray-400">
                    Pull a recipe from a website or use a share code, then keep editing it here before saving.
                  </p>
                </div>
                <div className="grid min-w-[170px] grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setImportMode("website")}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                      importMode === "website"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    Website
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode("code")}
                    className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                      importMode === "code"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    Share Code
                  </button>
                </div>
              </div>

              {importMode === "website" ? (
                <div className="mt-3">
                  {recipeUrlMsg ? (
                    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                      {recipeUrlMsg}
                    </div>
                  ) : null}

                  {recipeUrlErr ? (
                    <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                      {recipeUrlErr}
                    </div>
                  ) : null}

                  <input
                    value={recipeUrl}
                    onChange={(e) => setRecipeUrl(e.target.value)}
                    placeholder="Paste a recipe website URL..."
                    className="mt-3 w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder:text-gray-500"
                  />

                  <button
                    type="button"
                    onClick={onImportRecipeUrl}
                    disabled={!recipeUrl.trim() || recipeUrlImporting}
                    className="mt-3 w-full rounded-2xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {recipeUrlImporting ? "Importing Website..." : "Import From Website"}
                  </button>

                  <p className="mt-3 text-xs text-gray-500">
                    Best results come from recipe sites that publish structured recipe data.
                  </p>

                  {lastImportedWebsiteRecipe ? (
                    <div className="mt-3 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-3">
                      <div className="text-sm font-semibold text-blue-100">
                        Last website import: {lastImportedWebsiteRecipe.title}
                      </div>
                      <div className="mt-1 text-xs text-blue-100/80">
                        {lastImportedWebsiteRecipe.ingredients.length} ingredients
                        {lastImportedWebsiteRecipe.steps.length
                          ? ` • ${lastImportedWebsiteRecipe.steps.length} steps`
                          : ""}
                        {lastImportedWebsiteRecipe.servings
                          ? ` • ${lastImportedWebsiteRecipe.servings} servings`
                          : ""}
                          </div>
                    </div>
                  ) : null}

                  {importPreviewRecipe ? (
                    <div className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-white">Import Cleanup Preview</h4>
                          <p className="mt-1 text-xs text-gray-400">
                            Review the parsed recipe before it fills the builder.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setImportPreviewRecipe(null)}
                          className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800"
                        >
                          Dismiss
                        </button>
                      </div>

                      {importPreviewWarning ? (
                        <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                          {importPreviewWarning}
                        </div>
                      ) : null}

                      <div className="mt-4 space-y-4">
                        <div>
                          <label className="mb-1 block text-sm text-gray-300">Recipe name</label>
                          <input
                            value={importPreviewRecipe.title}
                            onChange={(e) => updateImportPreviewField("title", e.target.value)}
                            className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                          />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-sm text-gray-300">Servings</label>
                            <input
                              type="number"
                              min={1}
                              value={importPreviewRecipe.servings ?? ""}
                              onChange={(e) => updateImportPreviewField("servings", e.target.value)}
                              className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-sm text-gray-300">Source</label>
                            <div className="rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-xs text-gray-400">
                              {importPreviewRecipe.sourceUrl}
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="mb-1 block text-sm text-gray-300">Description</label>
                          <textarea
                            ref={(node) => {
                              if (!node) return;
                              node.style.height = "0px";
                              node.style.height = `${node.scrollHeight}px`;
                            }}
                            value={importPreviewRecipe.description ?? ""}
                            onChange={(e) => updateImportPreviewField("description", e.target.value)}
                            onInput={autoResizeTextarea}
                            rows={3}
                            className="w-full resize-none overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                          />
                        </div>

                        <div>
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <label className="text-sm font-semibold text-gray-200">Ingredients</label>
                            <button
                              type="button"
                              onClick={() => addImportPreviewListItem("ingredients")}
                              className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800"
                            >
                              + Add Ingredient
                            </button>
                          </div>
                          <div className="space-y-2">
                            {importPreviewRecipe.ingredients.map((line, index) => (
                              <div key={`preview-ingredient-${index}`} className="flex gap-2">
                                <input
                                  value={line}
                                  onChange={(e) =>
                                    updateImportPreviewList("ingredients", index, e.target.value)
                                  }
                                  className="flex-1 rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeImportPreviewListItem("ingredients", index)}
                                  className="rounded-2xl bg-gray-900 px-3 py-3 text-xs font-semibold text-white hover:bg-gray-800"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <label className="text-sm font-semibold text-gray-200">Steps</label>
                            <button
                              type="button"
                              onClick={() => addImportPreviewListItem("steps")}
                              className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800"
                            >
                              + Add Step
                            </button>
                          </div>
                          <div className="space-y-2">
                            {importPreviewRecipe.steps.map((step, index) => (
                              <div key={`preview-step-${index}`} className="flex gap-2">
                                <textarea
                                  ref={(node) => {
                                    if (!node) return;
                                    node.style.height = "0px";
                                    node.style.height = `${node.scrollHeight}px`;
                                  }}
                                  value={step}
                                  onChange={(e) =>
                                    updateImportPreviewList("steps", index, e.target.value)
                                  }
                                  onInput={autoResizeTextarea}
                                  rows={4}
                                  className="flex-1 resize-none overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm leading-6 text-white [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeImportPreviewListItem("steps", index)}
                                  className="self-start rounded-2xl bg-gray-900 px-3 py-3 text-xs font-semibold text-white hover:bg-gray-800"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={applyImportPreviewToBuilder}
                            className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                          >
                            Apply To Builder
                          </button>
                          <button
                            type="button"
                            onClick={() => setImportPreviewRecipe(null)}
                            className="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3">
                  {recipeShareMsg && (
                    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                      {recipeShareMsg}
                    </div>
                  )}

                  {recipeShareErr && (
                    <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                      {recipeShareErr}
                    </div>
                  )}

                  <textarea
                    value={recipeShareCode}
                    onChange={(e) => setRecipeShareCode(e.target.value)}
                    placeholder="Paste recipe code here..."
                    rows={3}
                    className="mt-3 w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder:text-gray-500"
                  />

                  <button
                    type="button"
                    onClick={onImportRecipe}
                    disabled={!recipeShareCode.trim()}
                    className="mt-3 w-full rounded-2xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Import Recipe
                  </button>
                </div>
              )}
            </div>
            )}

            {builderSection === "basics" && (
            <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-gray-300">Recipe name</label>
              <input
                value={recipeName}
                onChange={(e) => setRecipeName(e.target.value)}
                placeholder="e.g. Turkey Chili"
                className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder:text-gray-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="mb-1 block text-sm text-gray-300">Default servings</label>
                <input
                  type="number"
                  min={1}
                  value={defaultServings}
                  onChange={(e) => setDefaultServings(Number(e.target.value))}
                  className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                />
              </div>

              <div className="col-span-2 rounded-3xl border border-blue-500/30 bg-blue-500/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-blue-100">Live Macro Preview</div>
                    <div className="mt-1 text-xs text-blue-100/80">
                      Calculated from linked ingredients with gram-based quantities.
                    </div>
                  </div>
                  <div className="text-right text-xs text-blue-100/80">
                    {recipeBuilderAnalysis.linkedRows.length} linked
                    {recipeBuilderAnalysis.linkedRows.length === 1 ? " ingredient" : " ingredients"}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-2xl bg-gray-950/40 px-3 py-3">
                    <div className="text-xs uppercase tracking-wide text-blue-100/70">Calories</div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {recipeBuilderAnalysis.linkedTotals.calories}
                    </div>
                    <div className="text-xs text-blue-100/70">
                      {livePerServingMacros.calories} per serving
                    </div>
                  </div>

                  <div className="rounded-2xl bg-gray-950/40 px-3 py-3">
                    <div className="text-xs uppercase tracking-wide text-blue-100/70">Protein</div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {recipeBuilderAnalysis.linkedTotals.protein}g
                    </div>
                    <div className="text-xs text-blue-100/70">
                      {livePerServingMacros.protein}g per serving
                    </div>
                  </div>

                  <div className="rounded-2xl bg-gray-950/40 px-3 py-3">
                    <div className="text-xs uppercase tracking-wide text-blue-100/70">Carbs</div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {recipeBuilderAnalysis.linkedTotals.carbs}g
                    </div>
                    <div className="text-xs text-blue-100/70">
                      {livePerServingMacros.carbs}g per serving
                    </div>
                  </div>

                  <div className="rounded-2xl bg-gray-950/40 px-3 py-3">
                    <div className="text-xs uppercase tracking-wide text-blue-100/70">Fat</div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {recipeBuilderAnalysis.linkedTotals.fat}g
                    </div>
                    <div className="text-xs text-blue-100/70">
                      {livePerServingMacros.fat}g per serving
                    </div>
                  </div>
                </div>

                {recipeBuilderAnalysis.invalidLinked.length > 0 && (
                  <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                    {recipeBuilderAnalysis.invalidLinked.length} linked ingredient
                    {recipeBuilderAnalysis.invalidLinked.length === 1 ? " is" : "s are"} missing a gram-based quantity.
                  </div>
                )}

                {recipeBuilderAnalysis.unresolved.length > 0 && (
                  <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                    {recipeBuilderAnalysis.unresolved.length} ingredient
                    {recipeBuilderAnalysis.unresolved.length === 1 ? " is" : "s are"} still manual, so totals may be incomplete.
                  </div>
                )}

                {!recipeBuilderAnalysis.hasCalculatedLinkedMacros && (
                  <div className="mt-3 rounded-xl border border-gray-600 bg-gray-900/60 p-3 text-sm text-gray-300">
                    No live macro totals yet. Link ingredients from the library and use grams or kilograms to enable calculation.
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm text-gray-300">Total calories</label>
                <input
                  type="number"
                  value={totalCalories}
                  onChange={(e) => setTotalCalories(e.target.value)}
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Manual fallback only. Linked ingredients with gram quantities will override this.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm text-gray-300">Total protein (g)</label>
                <input
                  type="number"
                  value={totalProtein}
                  onChange={(e) => setTotalProtein(e.target.value)}
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-gray-300">Total carbs (g)</label>
                <input
                  type="number"
                  value={totalCarbs}
                  onChange={(e) => setTotalCarbs(e.target.value)}
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-gray-300">Total fat (g)</label>
                <input
                  type="number"
                  value={totalFat}
                  onChange={(e) => setTotalFat(e.target.value)}
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                />
              </div>
            </div>
            </div>
            )}

            {builderSection === "ingredients" && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-300">Ingredients</h3>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 p-3">
                <div className="text-xs text-blue-100/85">
                  Link ingredients from your library, or create a private average from USDA nutrition when you only need a clean generic macro estimate.
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/inventory/add?returnTo=/recipes/create")}
                  className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Open Inventory Intake
                </button>
              </div>
              {averageNutritionError ? (
                <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                  {averageNutritionError}
                </div>
              ) : null}
              <div className="mb-3 rounded-xl border border-gray-700 bg-gray-950/50 p-3 text-xs text-gray-400">
                Quantity helpers: `g`, `kg`, `oz`, and `lb` always work. `ml` and `L` now work
                for supported liquids and ingredients with saved volume conversions. `cup`, `tbsp`,
                and `tsp` cover more common items like yogurt, cottage cheese, rice, oats, quinoa,
                pasta, berries, broth, oil, butter, honey, maple syrup, nut butters, protein
                powder, flour, and sugar. Piece helpers also cover common foods like chicken
                cuts, eggs, bananas, avocados, apples, oranges, potatoes, onions, peppers,
                garlic cloves, bread slices, tortillas, bagels, and muffins when the ingredient matches.
              </div>
              <div className="space-y-3">
                {ingredients.map((ing, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-gray-700 bg-gray-900 p-3"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2">
                        <label className="mb-1 block text-sm text-gray-300">Ingredient</label>
                        <input
                          value={ing.name}
                          onChange={(e) =>
                            updateIngredient(idx, { name: e.target.value })
                          }
                          placeholder="e.g. Ground turkey"
                          list="ingredient-library-options"
                          className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                        />
                        <div className="mt-1 text-xs text-gray-500">
                          {ing.isLinked
                            ? `Linked to ${ing.isPrivate ? "your private" : "verified"} ingredient library entry`
                            : "Type to search verified and private ingredients, or keep it as a manual ingredient"}
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <label className="mb-1 block text-sm text-gray-300">Qty</label>
                        <input
                          value={ing.qty ?? ""}
                          onChange={(e) =>
                            updateIngredient(idx, { qty: e.target.value })
                          }
                          placeholder="e.g. 500g"
                          className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                        />
                        <div className="mt-1 text-xs text-gray-500">
                          Supports `g`, `kg`, `oz`, `lb`, `ml`, `L`, and helpers like `1 cup`, `1 tbsp`, `1 egg`, or `1 breast`.
                        </div>
                        {formatParsedQuantityHint(
                          ing,
                          ing.ingredientId
                            ? ingredientLibrary.find((item) => item.id === ing.ingredientId) ?? null
                            : findBestIngredientMatch(
                                ing.name,
                                ingredientLibrary,
                                ingredientLibraryByName
                              )
                        ) && (
                          <div className="mt-1 text-xs text-emerald-300">
                            {formatParsedQuantityHint(
                              ing,
                              ing.ingredientId
                                ? ingredientLibrary.find((item) => item.id === ing.ingredientId) ?? null
                                : findBestIngredientMatch(
                                    ing.name,
                                    ingredientLibrary,
                                    ingredientLibraryByName
                                  )
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {!ing.isLinked && ing.name.trim() && (
                      <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                        <div className="text-sm font-semibold text-amber-100">
                          Ingredient not in your library yet
                        </div>
                        <div className="mt-1 text-xs text-amber-200/80">
                          Create an averaged USDA ingredient for recipe macro math, or create it in Inventory later if you need barcode and label details.
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void createAverageNutritionIngredient(idx)}
                            disabled={averageNutritionLookupIndex !== null}
                            className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-gray-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {averageNutritionLookupIndex === idx
                              ? "Averaging..."
                              : "Use Average Nutrition"}
                          </button>
                          <button
                            type="button"
                            onClick={() => openInventoryIngredientCreate(idx)}
                            className="rounded-xl bg-amber-400 px-3 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-300"
                          >
                            Create In Inventory
                          </button>
                          <div className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-100/80">
                            You can still keep this as a manual ingredient for now.
                          </div>
                        </div>
                        {averageNutritionRowErrors[idx] ? (
                          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                            {averageNutritionRowErrors[idx]}
                          </div>
                        ) : null}
                      </div>
                    )}

                    {ingredients.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeIngredientRow(idx)}
                        className="mt-2 text-sm text-gray-400 hover:text-white"
                      >
                        Remove ingredient
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addIngredientRow}
                className="mt-3 w-full rounded-xl bg-gray-700 py-2 text-sm font-semibold text-white hover:bg-gray-600"
              >
                + Add Ingredient
              </button>
              <datalist id="ingredient-library-options">
                {ingredientLibrary.map((ingredient) => (
                  <option key={ingredient.id} value={ingredient.name}>
                    {formatIngredientLibraryOption(ingredient)}
                  </option>
                ))}
              </datalist>
            </div>
            )}

            {builderSection === "steps" && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-300">
                Recipe Steps (optional)
              </h3>

              <div className="space-y-3">
                {steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-gray-700 bg-gray-900 p-3"
                  >
                    <label className="mb-1 block text-sm text-gray-300">
                      Step {idx + 1}
                    </label>
                    <textarea
                      value={step}
                      onChange={(e) => updateStep(idx, e.target.value)}
                      placeholder="e.g. Brown the turkey in a pan..."
                      rows={2}
                      className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                    />

                    {steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStepRow(idx)}
                        className="mt-2 text-sm text-gray-400 hover:text-white"
                      >
                        Remove step
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addStepRow}
                className="mt-3 w-full rounded-xl bg-gray-700 py-2 text-sm font-semibold text-white hover:bg-gray-600"
              >
                + Add Step
              </button>
            </div>
            )}

            {builderSection === "review" && (
              <div className="space-y-4">
                <div className="rounded-3xl border border-gray-700 bg-gray-900/60 p-4">
                  <h3 className="text-sm font-semibold text-white">Review Recipe</h3>
                  <p className="mt-1 text-sm text-gray-400">
                    Check the shape of the recipe before it joins your book.
                  </p>

                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl bg-gray-950/60 p-3">
                      <div className="text-xs uppercase tracking-wide text-gray-500">Name</div>
                      <div className="mt-1 text-sm font-semibold text-white">
                        {recipeName.trim() || "Missing recipe name"}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-2xl bg-gray-950/60 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-500">Servings</div>
                        <div className="mt-1 text-sm font-semibold text-white">
                          {Math.max(1, Number(defaultServings) || 1)}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-gray-950/60 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-500">Ingredients</div>
                        <div className="mt-1 text-sm font-semibold text-white">
                          {recipeBuilderAnalysis.rows.length}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-gray-950/60 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-500">Steps</div>
                        <div className="mt-1 text-sm font-semibold text-white">
                          {steps.filter((step) => step.trim()).length}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-gray-950/60 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-500">Macro Source</div>
                        <div className="mt-1 text-sm font-semibold text-white">
                          {recipeBuilderAnalysis.hasCalculatedLinkedMacros ? "Linked ingredients" : "Manual totals"}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-blue-500/30 bg-blue-500/10 p-4">
                      <div className="text-sm font-semibold text-blue-100">Per Serving Preview</div>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-2xl bg-gray-950/40 px-3 py-3">
                          <div className="text-xs uppercase tracking-wide text-blue-100/70">Calories</div>
                          <div className="mt-1 text-lg font-semibold text-white">{livePerServingMacros.calories}</div>
                        </div>
                        <div className="rounded-2xl bg-gray-950/40 px-3 py-3">
                          <div className="text-xs uppercase tracking-wide text-blue-100/70">Protein</div>
                          <div className="mt-1 text-lg font-semibold text-white">{livePerServingMacros.protein}g</div>
                        </div>
                        <div className="rounded-2xl bg-gray-950/40 px-3 py-3">
                          <div className="text-xs uppercase tracking-wide text-blue-100/70">Carbs</div>
                          <div className="mt-1 text-lg font-semibold text-white">{livePerServingMacros.carbs}g</div>
                        </div>
                        <div className="rounded-2xl bg-gray-950/40 px-3 py-3">
                          <div className="text-xs uppercase tracking-wide text-blue-100/70">Fat</div>
                          <div className="mt-1 text-lg font-semibold text-white">{livePerServingMacros.fat}g</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(37,99,235,0.28)] hover:bg-blue-700"
                >
                  Save Recipe
                </button>
              </div>
            )}

            <div className="flex gap-2">
              {previousBuilderSection ? (
                <button
                  type="button"
                  onClick={() => setBuilderSection(previousBuilderSection)}
                  className="flex-1 rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700"
                >
                  Back
                </button>
              ) : null}
              {nextBuilderSection ? (
                <button
                  type="button"
                  onClick={() => setBuilderSection(nextBuilderSection)}
                  className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Continue
                </button>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </AppShell>
  );
}
