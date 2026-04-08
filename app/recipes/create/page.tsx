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
  deleteRecipe,
  exportRecipeShareCode,
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
  type PlannerDayState,
  type PlannerStateByDay,
} from "../../lib/plannerStorage";
import { loadGroceryList, saveGroceryList, type GroceryMode } from "../../lib/grocery";
import { getMyHousehold, type HouseholdRow } from "../../lib/households-db";
import { addIngredientsToGrocery } from "../../lib/mealplan";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import {
  createIngredient,
  deleteIngredient,
  listVisibleIngredients,
  updateIngredient as updateIngredientRecord,
  type IngredientRecord as IngredientLibraryItem,
} from "../../lib/supabase/ingredients-db";



type PlannerTab = "planner" | "recipes" | "create";

type ActiveSlot =
  | { type: "meal"; key: MealSlotKey }
  | { type: "snack"; key: string }
  | null;

const CATEGORY_OPTIONS: Ingredient["category"][] = [
  "produce",
  "dairy",
  "meat",
  "pantry",
  "frozen",
  "snacks",
  "other",
];



const CATEGORY_LABELS: Record<Ingredient["category"], string> = {
  produce: "Produce",
  dairy: "Dairy",
  meat: "Meat",
  pantry: "Pantry",
  frozen: "Frozen",
  snacks: "Snacks",
  other: "Other",
};

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

  const unit = (match[2] ?? "g").trim();

  if (unit in WEIGHT_UNIT_TO_GRAMS) {
    return roundMacroValue(amount * WEIGHT_UNIT_TO_GRAMS[unit]);
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

function formatMacroNumberInput(value: number) {
  return Number.isFinite(value) ? String(value) : "0";
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

function optionalPositiveNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : NaN;
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
  const [search, setSearch] = useState("");
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
  const [activeSlot, setActiveSlot] = useState<ActiveSlot>(null);

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
  const [customIngredientRow, setCustomIngredientRow] = useState<number | null>(null);
  const [customIngredientName, setCustomIngredientName] = useState("");
  const [customIngredientReferenceAmount, setCustomIngredientReferenceAmount] = useState("");
  const [customIngredientCalories, setCustomIngredientCalories] = useState("");
  const [customIngredientProtein, setCustomIngredientProtein] = useState("");
  const [customIngredientCarbs, setCustomIngredientCarbs] = useState("");
  const [customIngredientFat, setCustomIngredientFat] = useState("");
  const [customIngredientCupGrams, setCustomIngredientCupGrams] = useState("");
  const [customIngredientTablespoonGrams, setCustomIngredientTablespoonGrams] = useState("");
  const [customIngredientTeaspoonGrams, setCustomIngredientTeaspoonGrams] = useState("");
  const [customIngredientPieceGrams, setCustomIngredientPieceGrams] = useState("");
  const [customIngredientPieceLabel, setCustomIngredientPieceLabel] = useState("");
  const [customIngredientError, setCustomIngredientError] = useState<string | null>(null);
  const [customIngredientSaving, setCustomIngredientSaving] = useState(false);
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);
  const [editingIngredientName, setEditingIngredientName] = useState("");
  const [editingIngredientReferenceAmount, setEditingIngredientReferenceAmount] = useState("");
  const [editingIngredientCalories, setEditingIngredientCalories] = useState("");
  const [editingIngredientProtein, setEditingIngredientProtein] = useState("");
  const [editingIngredientCarbs, setEditingIngredientCarbs] = useState("");
  const [editingIngredientFat, setEditingIngredientFat] = useState("");
  const [editingIngredientCupGrams, setEditingIngredientCupGrams] = useState("");
  const [editingIngredientTablespoonGrams, setEditingIngredientTablespoonGrams] = useState("");
  const [editingIngredientTeaspoonGrams, setEditingIngredientTeaspoonGrams] = useState("");
  const [editingIngredientPieceGrams, setEditingIngredientPieceGrams] = useState("");
  const [editingIngredientPieceLabel, setEditingIngredientPieceLabel] = useState("");
  const [ingredientManagerError, setIngredientManagerError] = useState<string | null>(null);
  const [ingredientManagerMsg, setIngredientManagerMsg] = useState<string | null>(null);
  const [ingredientManagerSaving, setIngredientManagerSaving] = useState(false);
  const [ingredientManagerSearch, setIngredientManagerSearch] = useState("");
  const [ingredientManagerSort, setIngredientManagerSort] = useState<"az" | "newest" | "updated">("az");
  const [publicIngredientSearch, setPublicIngredientSearch] = useState("");

  const [recipeShareCode, setRecipeShareCode] = useState("");
  const [recipeShareMsg, setRecipeShareMsg] = useState<string | null>(null);
  const [recipeShareErr, setRecipeShareErr] = useState<string | null>(null);

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



  const allRecipes = useMemo(() => [...TEMPLATE_RECIPES, ...myRecipes], [myRecipes]);
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
  const filteredAndSortedPrivateIngredients = useMemo(() => {
    const items = [...filteredPrivateIngredients];

    if (ingredientManagerSort === "newest") {
      return items.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }

    if (ingredientManagerSort === "updated") {
      return items.sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    }

    return items.sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredPrivateIngredients, ingredientManagerSort]);

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
            : undefined) ?? ingredientLibraryByName.get(normalizeIngredientName(name));

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

  const filteredRecipes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRecipes;

    return allRecipes.filter((recipe) => {
      const nameMatch = recipe.name.toLowerCase().includes(q);
      const ingredientMatch = recipe.ingredients.some((ing) =>
        ing.name.toLowerCase().includes(q)
      );
      return nameMatch || ingredientMatch;
    });
  }, [allRecipes, search]);

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

async function setMealSlotRecipe(slot: MealSlotKey, recipe: Recipe) {
  const servings =
    plannerByDay[selectedDay].mealSlots[slot].servings ||
    recipe.defaultServings ||
    1;

  setPlannerByDay((prev) => ({
    ...prev,
    [selectedDay]: {
      ...prev[selectedDay],
      mealSlots: {
        ...prev[selectedDay].mealSlots,
        [slot]: {
          recipe,
          servings,
          logged: false,
        },
      },
    },
  }));

  const result = await upsertPlannedMeal({
    day_key: selectedDay,
    slot_type: "meal",
    slot_key: slot,
    recipe_id: recipe.isTemplate ? null : recipe.id,
    template_id: recipe.isTemplate ? recipe.id : null,
    servings,
    logged: false,
    sort_order: 0,
  });

  if (result.error) {
    setPlannerMsg(null);
    setPlannerErr(result.error);
    return;
  }
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
async function setSnackRecipe(id: string, recipe: Recipe) {
  const currentSnack = plannerByDay[selectedDay].snackSlots.find((snack) => snack.id === id);
  const servings = currentSnack?.servings || recipe.defaultServings || 1;
  const sortOrder = getSnackSortOrder(plannerByDay[selectedDay].snackSlots, id);

  setPlannerByDay((prev) => ({
    ...prev,
    [selectedDay]: {
      ...prev[selectedDay],
      snackSlots: prev[selectedDay].snackSlots.map((snack) =>
        snack.id === id
          ? {
              ...snack,
              recipe,
              servings,
              logged: false,
            }
          : snack
      ),
    },
  }));

  const result = await upsertPlannedMeal({
    day_key: selectedDay,
    slot_type: "snack",
    slot_key: id,
    recipe_id: recipe.isTemplate ? null : recipe.id,
    template_id: recipe.isTemplate ? recipe.id : null,
    servings,
    logged: false,
    sort_order: sortOrder,
  });

  if (result.error) {
    setPlannerMsg(null);
    setPlannerErr(result.error);
    return;
  }
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

  async function assignRecipeToActiveSlot(recipe: Recipe) {
  if (!activeSlot) return;

  if (activeSlot.type === "meal") {
    await setMealSlotRecipe(activeSlot.key, recipe);
  } else {
    await setSnackRecipe(activeSlot.key, recipe);
  }

  setActiveSlot(null);
  setTab("planner");
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
    setIngredients((prev) =>
      prev.map((ing, idx) => {
        if (idx !== i) return ing;

        const next = { ...ing, ...patch };
        const normalizedName = normalizeIngredientName(next.name);
        const matchedIngredient = ingredientLibraryByName.get(normalizedName);

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

  function openCustomIngredientForm(index: number) {
    const ingredient = ingredients[index];
    if (!ingredient) return;

    setCustomIngredientRow(index);
    setCustomIngredientError(null);
    setCustomIngredientName(ingredient.name.trim());
    setCustomIngredientReferenceAmount(
      ingredient.quantityGrams != null ? formatMacroNumberInput(ingredient.quantityGrams) : ""
    );
    setCustomIngredientCalories("");
    setCustomIngredientProtein("");
    setCustomIngredientCarbs("");
    setCustomIngredientFat("");
    setCustomIngredientCupGrams("");
    setCustomIngredientTablespoonGrams("");
    setCustomIngredientTeaspoonGrams("");
    setCustomIngredientPieceGrams("");
    setCustomIngredientPieceLabel("");
  }

  function closeCustomIngredientForm() {
    setCustomIngredientRow(null);
    setCustomIngredientError(null);
    setCustomIngredientSaving(false);
  }

  function startEditingIngredient(ingredient: IngredientLibraryItem) {
    setEditingIngredientId(ingredient.id);
    setIngredientManagerError(null);
    setIngredientManagerMsg(null);
    setEditingIngredientName(ingredient.name);
    setEditingIngredientReferenceAmount(formatMacroNumberInput(Number(ingredient.reference_amount_g)));
    setEditingIngredientCalories(formatMacroNumberInput(Number(ingredient.reference_calories)));
    setEditingIngredientProtein(formatMacroNumberInput(Number(ingredient.reference_protein_g)));
    setEditingIngredientCarbs(formatMacroNumberInput(Number(ingredient.reference_carbs_g)));
    setEditingIngredientFat(formatMacroNumberInput(Number(ingredient.reference_fat_g)));
    setEditingIngredientCupGrams(ingredient.cup_g != null ? formatMacroNumberInput(Number(ingredient.cup_g)) : "");
    setEditingIngredientTablespoonGrams(ingredient.tbsp_g != null ? formatMacroNumberInput(Number(ingredient.tbsp_g)) : "");
    setEditingIngredientTeaspoonGrams(ingredient.tsp_g != null ? formatMacroNumberInput(Number(ingredient.tsp_g)) : "");
    setEditingIngredientPieceGrams(ingredient.piece_g != null ? formatMacroNumberInput(Number(ingredient.piece_g)) : "");
    setEditingIngredientPieceLabel(ingredient.piece_label ?? "");
  }

  function stopEditingIngredient() {
    setEditingIngredientId(null);
    setIngredientManagerError(null);
    setIngredientManagerSaving(false);
  }

  async function saveEditedIngredient(ingredientId: string) {
    if (!currentUserId) {
      setIngredientManagerError("You need to be signed in to edit a private ingredient.");
      return;
    }

    const trimmedName = editingIngredientName.trim();
    const referenceAmount = Number(editingIngredientReferenceAmount);
    const calories = Number(editingIngredientCalories);
    const protein = Number(editingIngredientProtein);
    const carbs = Number(editingIngredientCarbs);
    const fat = Number(editingIngredientFat);
    const cupGrams = optionalPositiveNumber(editingIngredientCupGrams);
    const tablespoonGrams = optionalPositiveNumber(editingIngredientTablespoonGrams);
    const teaspoonGrams = optionalPositiveNumber(editingIngredientTeaspoonGrams);
    const pieceGrams = optionalPositiveNumber(editingIngredientPieceGrams);
    const pieceLabel = editingIngredientPieceLabel.trim();

    if (!trimmedName) {
      setIngredientManagerError("Ingredient name is required.");
      return;
    }

    if (!Number.isFinite(referenceAmount) || referenceAmount <= 0) {
      setIngredientManagerError("Reference amount must be greater than 0 grams.");
      return;
    }

    if ([calories, protein, carbs, fat].some((value) => !Number.isFinite(value) || value < 0)) {
      setIngredientManagerError("Macro values must be 0 or greater.");
      return;
    }

    if ([cupGrams, tablespoonGrams, teaspoonGrams, pieceGrams].some((value) => Number.isNaN(value))) {
      setIngredientManagerError("Conversion values must be blank or greater than 0.");
      return;
    }

    if ((pieceGrams != null && !pieceLabel) || (pieceLabel && pieceGrams == null)) {
      setIngredientManagerError("Piece conversions need both a label and a gram value.");
      return;
    }

    setIngredientManagerSaving(true);
    setIngredientManagerError(null);

    try {
      const updatedIngredient = await updateIngredientRecord(ingredientId, currentUserId, {
        name: trimmedName,
        reference_amount_g: referenceAmount,
        reference_calories: calories,
        reference_protein_g: protein,
        reference_carbs_g: carbs,
        reference_fat_g: fat,
        cup_g: cupGrams,
        tbsp_g: tablespoonGrams,
        tsp_g: teaspoonGrams,
        piece_g: pieceGrams,
        piece_label: pieceLabel || null,
        visibility: "private",
        verification_status: "custom",
      });

      setIngredientLibrary((prev) =>
        prev
          .map((ingredient) =>
            ingredient.id === ingredientId ? updatedIngredient : ingredient
          )
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      setIngredients((prev) =>
        prev.map((ingredient) =>
          ingredient.ingredientId === ingredientId
            ? {
                ...ingredient,
                name: updatedIngredient.name,
                isLinked: true,
                isPrivate: true,
              }
            : ingredient
        )
      );

      setIngredientManagerMsg(`Updated "${updatedIngredient.name}".`);
      stopEditingIngredient();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Private ingredient could not be updated.";
      setIngredientManagerError(message);
      setIngredientManagerSaving(false);
    }
  }

  async function removePrivateIngredient(ingredient: IngredientLibraryItem) {
    if (!currentUserId) {
      setIngredientManagerError("You need to be signed in to delete a private ingredient.");
      return;
    }

    const confirmed = window.confirm(
      `Delete "${ingredient.name}" from your private ingredient library? Linked recipe rows will become manual ingredients.`
    );

    if (!confirmed) return;

    setIngredientManagerSaving(true);
    setIngredientManagerError(null);
    setIngredientManagerMsg(null);

    try {
      await deleteIngredient(ingredient.id, currentUserId);

      setIngredientLibrary((prev) => prev.filter((item) => item.id !== ingredient.id));
      setIngredients((prev) =>
        prev.map((item) =>
          item.ingredientId === ingredient.id
            ? {
                ...item,
                ingredientId: undefined,
                isLinked: false,
                isPrivate: false,
              }
            : item
        )
      );

      if (editingIngredientId === ingredient.id) {
        stopEditingIngredient();
      } else {
        setIngredientManagerSaving(false);
      }

      setIngredientManagerMsg(`Deleted "${ingredient.name}".`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Private ingredient could not be deleted.";
      setIngredientManagerError(message);
      setIngredientManagerSaving(false);
    }
  }

  async function saveCustomIngredient(index: number) {
    const ingredient = ingredients[index];

    if (!ingredient || !currentUserId) {
      setCustomIngredientError("You need to be signed in to save a private ingredient.");
      return;
    }

    const trimmedName = customIngredientName.trim();
    const referenceAmount = Number(customIngredientReferenceAmount);

    if (!trimmedName) {
      setCustomIngredientError("Ingredient name is required.");
      return;
    }

    if (!Number.isFinite(referenceAmount) || referenceAmount <= 0) {
      setCustomIngredientError("Reference amount must be greater than 0 grams.");
      return;
    }

    const calories = Number(customIngredientCalories);
    const protein = Number(customIngredientProtein);
    const carbs = Number(customIngredientCarbs);
    const fat = Number(customIngredientFat);
    const cupGrams = optionalPositiveNumber(customIngredientCupGrams);
    const tablespoonGrams = optionalPositiveNumber(customIngredientTablespoonGrams);
    const teaspoonGrams = optionalPositiveNumber(customIngredientTeaspoonGrams);
    const pieceGrams = optionalPositiveNumber(customIngredientPieceGrams);
    const pieceLabel = customIngredientPieceLabel.trim();

    if ([calories, protein, carbs, fat].some((value) => !Number.isFinite(value) || value < 0)) {
      setCustomIngredientError("Macro values must be 0 or greater.");
      return;
    }

    if ([cupGrams, tablespoonGrams, teaspoonGrams, pieceGrams].some((value) => Number.isNaN(value))) {
      setCustomIngredientError("Conversion values must be blank or greater than 0.");
      return;
    }

    if ((pieceGrams != null && !pieceLabel) || (pieceLabel && pieceGrams == null)) {
      setCustomIngredientError("Piece conversions need both a label and a gram value.");
      return;
    }

    setCustomIngredientSaving(true);
    setCustomIngredientError(null);

    try {
      const createdIngredient = await createIngredient(currentUserId, {
        name: trimmedName,
        reference_amount_g: referenceAmount,
        reference_calories: calories,
        reference_protein_g: protein,
        reference_carbs_g: carbs,
        reference_fat_g: fat,
        cup_g: cupGrams,
        tbsp_g: tablespoonGrams,
        tsp_g: teaspoonGrams,
        piece_g: pieceGrams,
        piece_label: pieceLabel || null,
        visibility: "private",
        verification_status: "custom",
        source_note: "Created in recipe builder",
      });

      setIngredientLibrary((prev) =>
        [...prev, createdIngredient].sort((a, b) => a.name.localeCompare(b.name))
      );

      setIngredients((prev) =>
        prev.map((item, itemIndex) => {
          if (itemIndex !== index) return item;

          const nextQuantityGrams =
            item.quantityGrams != null ? item.quantityGrams : referenceAmount;

          return {
            ...item,
            name: createdIngredient.name,
            ingredientId: createdIngredient.id,
            isLinked: true,
            isPrivate: true,
            quantityGrams: nextQuantityGrams,
            qty: item.qty?.trim() ? item.qty : `${nextQuantityGrams}g`,
          };
        })
      );

      setRecipeCreateMsg(`Saved "${createdIngredient.name}" to your private ingredient library.`);
      closeCustomIngredientForm();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Private ingredient could not be created.";
      setCustomIngredientError(message);
      setCustomIngredientSaving(false);
    }
  }

  function addIngredientRow() {
    setIngredients((prev) => [...prev, emptyIngredient()]);
  }

  function removeIngredientRow(i: number) {
    setIngredients((prev) => prev.filter((_, idx) => idx !== i));
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

    if (!cleanedName || cleanedIngredients.length === 0) return;

    const invalidLinkedIngredients = recipeBuilderAnalysis.invalidLinked;

    if (invalidLinkedIngredients.length > 0) {
      setRecipeCreateError(
        "Linked ingredients need gram-based quantities like 120g or 0.5kg so Macro OS can calculate macros accurately."
      );
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
  console.error("Failed to create recipe:", error);
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
    setTab("recipes");
  }

async function onDeleteRecipe(id: string) {
  try {
  const nextRecipes = await deleteRecipe(myRecipes, id);
  setMyRecipes(nextRecipes);
} catch (error) {
  console.error("Failed to delete recipe:", error);
  return;
}

  setPlannerByDay((prev) => {
    const next = { ...prev };

    (Object.keys(next) as PlannerDayKey[]).forEach((dayKey) => {
      next[dayKey] = {
        mealSlots: {
          breakfast:
            next[dayKey].mealSlots.breakfast.recipe?.id === id
              ? { recipe: null, servings: 1, logged: false }
              : next[dayKey].mealSlots.breakfast,
          lunch:
            next[dayKey].mealSlots.lunch.recipe?.id === id
              ? { recipe: null, servings: 1, logged: false }
              : next[dayKey].mealSlots.lunch,
          dinner:
            next[dayKey].mealSlots.dinner.recipe?.id === id
              ? { recipe: null, servings: 1, logged: false }
              : next[dayKey].mealSlots.dinner,
        },
        snackSlots: next[dayKey].snackSlots.map((snack) =>
          snack.recipe?.id === id
            ? { ...snack, recipe: null, servings: 1, logged: false }
            : snack
        ),
      };
    });

    return next;
  });

  if (viewerRecipe?.id === id) {
    closeViewer();
  }
}
  async function onShareRecipe(recipe: Recipe) {
    try {
      const code = exportRecipeShareCode(recipe);
      await navigator.clipboard.writeText(code);
      setRecipeShareErr(null);
      setRecipeShareMsg("Recipe code copied Ã¢Å“â€¦");
      window.setTimeout(() => setRecipeShareMsg(null), 1600);
    } catch {
      setRecipeShareMsg(null);
      setRecipeShareErr("CouldnÃ¢â‚¬â„¢t copy recipe code.");
    }
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

if (redirecting || !authChecked) {
  return (
    <AppShell title="Create" subtitle="Build a new recipe" backHref="/recipes" backLabel="Create">
      <div className="text-sm text-gray-400">Loading...</div>
    </AppShell>
  );
}

const activeSlotLabel = (() => {
  if (!activeSlot) return null;
  if (activeSlot.type === "meal") {
    return activeSlot.key.charAt(0).toUpperCase() + activeSlot.key.slice(1);
  }

  const snackIndex = snackSlots.findIndex((snack) => snack.id === activeSlot.key);
  return snackIndex >= 0 ? `Snack ${snackIndex + 1}` : "Snack";
})();

  return (
    <AppShell title="Create" subtitle="Build a new recipe" backHref="/recipes" backLabel="Create">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2">
          <TabButton active={tab === "create"} onClick={() => setTab("create")}>
            Create
          </TabButton>
          <TabButton active={tab === "recipes"} onClick={() => setTab("recipes")}>
            Libraries
          </TabButton>
        </div>

        <div className="rounded-3xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Recipe Builder</h2>
              <p className="mt-1 text-sm text-gray-400">
                Create a recipe, import a code, and save ingredients as you go.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/recipes")}
              className="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700"
            >
              Back to Book
            </button>
          </div>
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
                <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
                  {filteredPublicIngredients.map((ingredient) => (
                    <div
                      key={ingredient.id}
                      className="rounded-xl border border-gray-700 bg-gray-950/60 p-3"
                    >
                      <div className="text-sm font-semibold text-white">{ingredient.name}</div>
                      <div className="mt-1 text-xs text-gray-400">
                        Ref {ingredient.reference_amount_g}g • {ingredient.reference_calories} kcal • P{" "}
                        {ingredient.reference_protein_g} • C {ingredient.reference_carbs_g} • F{" "}
                        {ingredient.reference_fat_g}
                      </div>
                      <div className="mt-3">
                        <MealActionButton onClick={() => addIngredientToRecipeBuilder(ingredient)}>
                          Use In Recipe
                        </MealActionButton>
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
                <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
                  {filteredAndSortedPrivateIngredients.map((ingredient) => (
                    <div
                      key={ingredient.id}
                      className="rounded-xl border border-gray-700 bg-gray-950/60 p-3"
                    >
                      <div className="text-sm font-semibold text-white">{ingredient.name}</div>
                      <div className="mt-1 text-xs text-gray-400">
                        Ref {ingredient.reference_amount_g}g • {ingredient.reference_calories} kcal • P{" "}
                        {ingredient.reference_protein_g} • C {ingredient.reference_carbs_g} • F{" "}
                        {ingredient.reference_fat_g}
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

            <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-4">
              <h3 className="text-sm font-semibold text-white">Import Recipe Code</h3>
              <p className="mt-1 text-sm text-gray-400">
                Paste a compact recipe code here to pull it into your recipe book, then keep building.
              </p>

              {recipeShareMsg && (
                <div className="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
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

            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-300">Ingredients</h3>
              <div className="mb-3 rounded-xl border border-gray-700 bg-gray-950/50 p-3 text-xs text-gray-400">
                Quantity helpers: `g`, `kg`, `oz`, and `lb` always work. `cup`, `tbsp`, and `tsp`
                now cover more common items like yogurt, cottage cheese, rice, oats, quinoa,
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

                      <div>
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
                          Supports `g`, `kg`, `oz`, `lb`, and some helpers like `1 cup`, `1 tbsp`, `1 egg`, or `1 breast`.
                        </div>
                        {formatParsedQuantityHint(
                          ing,
                          ing.ingredientId
                            ? ingredientLibrary.find((item) => item.id === ing.ingredientId) ?? null
                            : ingredientLibraryByName.get(normalizeIngredientName(ing.name)) ?? null
                        ) && (
                          <div className="mt-1 text-xs text-emerald-300">
                            {formatParsedQuantityHint(
                              ing,
                              ing.ingredientId
                                ? ingredientLibrary.find((item) => item.id === ing.ingredientId) ?? null
                                : ingredientLibraryByName.get(normalizeIngredientName(ing.name)) ?? null
                            )}
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="mb-1 block text-sm text-gray-300">Category</label>
                        <select
                          value={ing.category}
                          onChange={(e) =>
                            updateIngredient(idx, {
                              category: e.target.value as Ingredient["category"],
                            })
                          }
                          className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                        >
                          {CATEGORY_OPTIONS.map((cat) => (
                            <option key={cat} value={cat}>
                              {CATEGORY_LABELS[cat]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {!ing.isLinked && ing.name.trim() && (
                      <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                        <div className="text-sm font-semibold text-amber-100">
                          Ingredient not in your library yet
                        </div>
                        <div className="mt-1 text-xs text-amber-200/80">
                          Save it as a private ingredient to reuse it later and include it in macro calculations.
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            customIngredientRow === idx
                              ? closeCustomIngredientForm()
                              : openCustomIngredientForm(idx)
                          }
                          className="mt-3 rounded-xl bg-amber-400 px-3 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-300"
                        >
                          {customIngredientRow === idx ? "Close Private Ingredient Form" : "Create Private Ingredient"}
                        </button>
                      </div>
                    )}

                    {customIngredientRow === idx && (
                      <div className="mt-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3">
                        <div className="text-sm font-semibold text-blue-100">
                          Save Private Ingredient
                        </div>
                        <div className="mt-1 text-xs text-blue-100/80">
                          Enter nutrition for a reference amount in grams. Macro OS will convert it to per-100g automatically.
                        </div>

                        {customIngredientError && (
                          <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                            {customIngredientError}
                          </div>
                        )}

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="col-span-2">
                            <label className="mb-1 block text-sm text-gray-200">Ingredient name</label>
                            <input
                              value={customIngredientName}
                              onChange={(e) => setCustomIngredientName(e.target.value)}
                              className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                            />
                          </div>

                          <div className="col-span-2">
                            <label className="mb-1 block text-sm text-gray-200">Reference amount (g)</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={customIngredientReferenceAmount}
                              onChange={(e) => setCustomIngredientReferenceAmount(e.target.value)}
                              className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-sm text-gray-200">Calories</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={customIngredientCalories}
                              onChange={(e) => setCustomIngredientCalories(e.target.value)}
                              className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-sm text-gray-200">Protein (g)</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={customIngredientProtein}
                              onChange={(e) => setCustomIngredientProtein(e.target.value)}
                              className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-sm text-gray-200">Carbs (g)</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={customIngredientCarbs}
                              onChange={(e) => setCustomIngredientCarbs(e.target.value)}
                              className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-sm text-gray-200">Fat (g)</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={customIngredientFat}
                              onChange={(e) => setCustomIngredientFat(e.target.value)}
                              className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                            />
                          </div>

                          <div className="col-span-2 rounded-xl border border-gray-700 bg-gray-950/50 p-3">
                            <div className="text-sm font-semibold text-gray-200">Optional conversions</div>
                            <div className="mt-1 text-xs text-gray-400">
                              Store ingredient-specific conversion helpers for cups, spoons, or a named piece like `egg` or `slice`.
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <div>
                                <label className="mb-1 block text-sm text-gray-200">Cup (g)</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={customIngredientCupGrams}
                                  onChange={(e) => setCustomIngredientCupGrams(e.target.value)}
                                  className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                                />
                              </div>

                              <div>
                                <label className="mb-1 block text-sm text-gray-200">Tbsp (g)</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={customIngredientTablespoonGrams}
                                  onChange={(e) => setCustomIngredientTablespoonGrams(e.target.value)}
                                  className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                                />
                              </div>

                              <div>
                                <label className="mb-1 block text-sm text-gray-200">Tsp (g)</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={customIngredientTeaspoonGrams}
                                  onChange={(e) => setCustomIngredientTeaspoonGrams(e.target.value)}
                                  className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                                />
                              </div>

                              <div>
                                <label className="mb-1 block text-sm text-gray-200">Piece grams</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={customIngredientPieceGrams}
                                  onChange={(e) => setCustomIngredientPieceGrams(e.target.value)}
                                  className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                                />
                              </div>

                              <div className="col-span-2">
                                <label className="mb-1 block text-sm text-gray-200">Piece label</label>
                                <input
                                  value={customIngredientPieceLabel}
                                  onChange={(e) => setCustomIngredientPieceLabel(e.target.value)}
                                  placeholder="e.g. egg, slice, scoop"
                                  className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => saveCustomIngredient(idx)}
                            disabled={customIngredientSaving}
                            className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {customIngredientSaving ? "Saving..." : "Save Private Ingredient"}
                          </button>
                          <button
                            type="button"
                            onClick={closeCustomIngredientForm}
                            disabled={customIngredientSaving}
                            className="rounded-xl bg-gray-700 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
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

            <button
              type="submit"
              className="w-full rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(37,99,235,0.28)] hover:bg-blue-700"
            >
              Save Recipe
            </button>
          </form>
        )}
      </div>
    </AppShell>
  );
}
