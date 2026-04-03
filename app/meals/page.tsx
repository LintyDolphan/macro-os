"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
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
} from "../lib/recipes";
import { addLogEntry, deleteLogEntry, todayISO } from "../lib/macroLog";
import {
  loadMealPlannerState,
  saveMealPlannerState,
  type MealSlot,
  type MealSlotKey,
  type SnackSlot,
  type PlannerDayKey,
  type PlannerDayState,
  type PlannerStateByDay,
} from "../lib/plannerStorage";
import { loadGroceryList, saveGroceryList, type GroceryItem } from "../lib/grocery";
import { addIngredientsToGrocery } from "../lib/mealplan";


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

function formatMacroLine(recipe: Recipe, servings: number) {
  const scaled = macrosForRecipe(recipe, servings);
  return `${scaled.calories} kcal • P ${scaled.protein} • C ${scaled.carbs} • F ${scaled.fat}`;
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
    /^\s*([0-9]*\.?[0-9]+)\s*([\-–]\s*([0-9]*\.?[0-9]+))?\s*(.*)$/
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
    const dash = raw.includes("–") ? "–" : "-";
    return `${fmt(scaled1)}${dash}${fmt(scaled2)}${rest ? " " + rest : ""}`.trim();
  }

  return `${fmt(scaled1)}${rest ? " " + rest : ""}`.trim();
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
      className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
        active
          ? "bg-blue-600 text-white"
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
  return `+${macros.calories} kcal • +${macros.protein}P • +${macros.carbs}C • +${macros.fat}F`;
}


export default function MealsPage() {
  const [tab, setTab] = useState<PlannerTab>("planner");

  const [myRecipes, setMyRecipes] = useState<Recipe[]>([]);
  const [search, setSearch] = useState("");


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
    setMyRecipes(loadRecipes());
  }, []);
useEffect(() => {
  setMyRecipes(loadRecipes());

  const saved = loadMealPlannerState();
  if (saved) {
    setPlannerByDay(saved);
  }
}, []);

useEffect(() => {
  saveMealPlannerState(plannerByDay);
}, [plannerByDay]);

  const allRecipes = useMemo(() => [...TEMPLATE_RECIPES, ...myRecipes], [myRecipes]);

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

  function undoLastLog() {
  if (!lastLogUndo) return;

  deleteLogEntry(lastLogUndo.date, lastLogUndo.entryId);

  setPlannerByDay((prev) => {
    const next = { ...prev };

    if (lastLogUndo.type === "meal" && lastLogUndo.slotKey) {
      next[lastLogUndo.day] = {
        ...next[lastLogUndo.day],
        mealSlots: {
          ...next[lastLogUndo.day].mealSlots,
          [lastLogUndo.slotKey]: {
            ...next[lastLogUndo.day].mealSlots[lastLogUndo.slotKey],
            logged: false,
          },
        },
      };
    }

    if (lastLogUndo.type === "snack" && lastLogUndo.snackId) {
      next[lastLogUndo.day] = {
        ...next[lastLogUndo.day],
        snackSlots: next[lastLogUndo.day].snackSlots.map((snack) =>
          snack.id === lastLogUndo.snackId
            ? { ...snack, logged: false }
            : snack
        ),
      };
    }

    return next;
  });

  setPlannerErr(null);
  setPlannerMsg(`Undid log for ${lastLogUndo.label} ↩`);
  setLastLogUndo(null);

  window.setTimeout(() => setPlannerMsg(null), 1800);
}

  function setMealSlotRecipe(slot: MealSlotKey, recipe: Recipe) {
  setPlannerByDay((prev) => ({
    ...prev,
    [selectedDay]: {
      ...prev[selectedDay],
      mealSlots: {
        ...prev[selectedDay].mealSlots,
        [slot]: {
          recipe,
          servings:
            prev[selectedDay].mealSlots[slot].servings ||
            recipe.defaultServings ||
            1,
          logged: false,
        },
      },
    },
  }));
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
function generateGroceryFromPlanner() {
  try {
    const ingredients = collectPlannerIngredients();

    if (ingredients.length === 0) {
      setPlannerErr("No meals selected to generate groceries.");
      setPlannerMsg(null);
      return;
    }

    const currentList = loadGroceryList();
    const next = addIngredientsToGrocery(currentList, ingredients);

    saveGroceryList(next);

    setPlannerErr(null);
    setPlannerMsg(`Added ${ingredients.length} ingredient lines to grocery ✅`);

    window.setTimeout(() => setPlannerMsg(null), 1800);
  } catch {
    setPlannerMsg(null);
    setPlannerErr("Couldn’t generate grocery list.");
  }
}
  function clearMealSlot(slot: MealSlotKey) {
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
}

function markMealSlotLogged(slot: MealSlotKey) {
  const day = selectedDay; // <-- ADD THIS

  const meal = plannerByDay[day].mealSlots[slot];
  if (!meal.recipe || meal.logged) return;

  const macros = macrosForRecipe(meal.recipe, meal.servings);
  const name =
    meal.servings > 1 ? `${meal.recipe.name} x${meal.servings}` : meal.recipe.name;

  const entry = addLogEntry(name, macros);

console.log("UNDO TEST MEAL", {
  entryId: entry.id,
  name,
  day,
  slot,
});

setLastLogUndo({
  entryId: entry.id,
  date: todayISO(),
  type: "meal",
  day: day,
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
}

  function updateMealSlotServings(slot: MealSlotKey, delta: number) {
  setPlannerByDay((prev) => ({
    ...prev,
    [selectedDay]: {
      ...prev[selectedDay],
      mealSlots: {
        ...prev[selectedDay].mealSlots,
        [slot]: {
          ...prev[selectedDay].mealSlots[slot],
          servings: Math.max(
            1,
            prev[selectedDay].mealSlots[slot].servings + delta
          ),
        },
      },
    },
  }));
}
  function setSnackRecipe(id: string, recipe: Recipe) {
  setPlannerByDay((prev) => ({
    ...prev,
    [selectedDay]: {
      ...prev[selectedDay],
      snackSlots: prev[selectedDay].snackSlots.map((snack) =>
        snack.id === id
          ? {
              ...snack,
              recipe,
              servings: snack.servings || recipe.defaultServings || 1,
              logged: false,
            }
          : snack
      ),
    },
  }));
}

 function clearSnack(id: string) {
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
}

function markSnackLogged(id: string) {
  const day = selectedDay; // <-- ADD THIS


  const snack = plannerByDay[day].snackSlots.find((s) => s.id === id);
  if (!snack?.recipe || snack.logged) return;

  const macros = macrosForRecipe(snack.recipe, snack.servings);
  const name =
    snack.servings > 1 ? `${snack.recipe.name} x${snack.servings}` : snack.recipe.name;

  const entry = addLogEntry(name, macros);
  console.log("SETTING UNDO", entry.id);
  setLastLogUndo({
    entryId: entry.id,
    date: todayISO(),
    type: "snack",
    day: day, // <-- use local var
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
}

function updateSnackServings(id: string, delta: number) {
  setPlannerByDay((prev) => ({
    ...prev,
    [selectedDay]: {
      ...prev[selectedDay],
      snackSlots: prev[selectedDay].snackSlots.map((snack) =>
        snack.id === id
          ? { ...snack, servings: Math.max(1, snack.servings + delta) }
          : snack
      ),
    },
  }));
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

function generateGroceryFromAllDays() {
  try {
    const ingredients = collectAllPlannedIngredients();

    if (ingredients.length === 0) {
      setPlannerErr("No planned meals found across days.");
      setPlannerMsg(null);
      return;
    }

    const currentList = loadGroceryList();
    const next = addIngredientsToGrocery(currentList, ingredients);

    saveGroceryList(next);

    setPlannerErr(null);
    setPlannerMsg(`Added groceries from all planned days ✅`);
    window.setTimeout(() => setPlannerMsg(null), 1800);
  } catch {
    setPlannerMsg(null);
    setPlannerErr("Couldn’t generate grocery list.");
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

  function assignRecipeToActiveSlot(recipe: Recipe) {
    if (!activeSlot) return;

    if (activeSlot.type === "meal") {
      setMealSlotRecipe(activeSlot.key, recipe);
    } else {
      setSnackRecipe(activeSlot.key, recipe);
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

  function updateIngredient(i: number, patch: Partial<Ingredient>) {
    setIngredients((prev) =>
      prev.map((ing, idx) => (idx === i ? { ...ing, ...patch } : ing))
    );
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

  function onCreateRecipe(e: React.FormEvent) {
    e.preventDefault();

    const cleanedName = recipeName.trim();

    const cleanedIngredients = ingredients
      .map((ing) => ({
        name: ing.name.trim(),
        qty: ing.qty?.trim() || undefined,
        category: ing.category,
      }))
      .filter((ing) => ing.name.length > 0);

    const cleanedSteps = steps
      .map((step) => step.trim())
      .filter((step) => step.length > 0);

    const servingsNum = Math.max(1, Number(defaultServings) || 1);

    if (!cleanedName || cleanedIngredients.length === 0) return;

    setMyRecipes((prev) =>
      addRecipe(prev, {
        name: cleanedName,
        ingredients: cleanedIngredients,
        defaultServings: servingsNum,
        totalMacros: {
          calories: Number(totalCalories) || 0,
          protein: Number(totalProtein) || 0,
          carbs: Number(totalCarbs) || 0,
          fat: Number(totalFat) || 0,
        },
        steps: cleanedSteps,
      })
    );

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

function onDeleteRecipe(id: string) {
  setMyRecipes((prev) => deleteRecipe(prev, id));

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
      setRecipeShareMsg("Recipe code copied ✅");
      window.setTimeout(() => setRecipeShareMsg(null), 1600);
    } catch {
      setRecipeShareMsg(null);
      setRecipeShareErr("Couldn’t copy recipe code.");
    }
  }

  function onImportRecipe() {
    try {
      const imported = importRecipeShareCode(recipeShareCode);
      setMyRecipes((prev) => mergeImportedRecipe(prev, imported));
      setRecipeShareCode("");
      setRecipeShareErr(null);
      setRecipeShareMsg("Recipe imported ✅");
      window.setTimeout(() => setRecipeShareMsg(null), 1600);
    } catch {
      setRecipeShareMsg(null);
      setRecipeShareErr("Invalid recipe code.");
    }
  }

  const activeSlotLabel = useMemo(() => {
    if (!activeSlot) return null;
    if (activeSlot.type === "meal") {
      return activeSlot.key.charAt(0).toUpperCase() + activeSlot.key.slice(1);
    }

    const snackIndex = snackSlots.findIndex((snack) => snack.id === activeSlot.key);
    return snackIndex >= 0 ? `Snack ${snackIndex + 1}` : "Snack";
  }, [activeSlot, snackSlots]);

  return (
    <AppShell title="Meals" subtitle="Plan your macros">
      <div className="space-y-4">
        <div className="flex gap-2">
          <TabButton active={tab === "planner"} onClick={() => setTab("planner")}>
            Planner
          </TabButton>
          <TabButton active={tab === "recipes"} onClick={() => setTab("recipes")}>
            Recipe Book
          </TabButton>
          <TabButton active={tab === "create"} onClick={() => setTab("create")}>
            Create
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
                    –
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

        {tab === "planner" && (
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
    ? "Today’s Meals"
    : selectedDay === "tomorrow"
    ? "Tomorrow’s Meals"
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

 <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
  <button
    type="button"
    onClick={generateGroceryFromPlanner}
    className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
  >
    Generate Grocery for This Day
  </button>

  <button
    type="button"
    onClick={generateGroceryFromAllDays}
    className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
  >
    Generate Grocery for All Days
  </button>
  <p className="text-xs text-red-400">
  {lastLogUndo ? `UNDO READY: ${lastLogUndo.label}` : "UNDO EMPTY"}
</p>

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
      –
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
      –
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
            {activeSlot && (
              <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-100">
                Selecting a recipe for <span className="font-semibold">{activeSlotLabel}</span>.
              </div>
            )}

            <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-white">Recipe Share</h2>
              <p className="mt-1 text-sm text-gray-400">
                Paste a recipe code to import it into your recipe book.
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
                className="mt-3 w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
              />

              <button
                type="button"
                onClick={onImportRecipe}
                disabled={!recipeShareCode.trim()}
                className="mt-3 w-full rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Import Recipe
              </button>
            </div>

            <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">Recipe Book</h2>
                <button
                  type="button"
                  onClick={() => setTab("create")}
                  className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  + Create
                </button>
              </div>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search recipes..."
                className="mt-3 w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
              />
            </div>

            <div className="space-y-3">
              {filteredRecipes.map((recipe) => {
                const isCustom = !recipe.isTemplate;
                const perServing = macrosForRecipe(recipe, 1);

                return (
                  <div
                    key={recipe.id}
                    className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-white">{recipe.name}</div>
                        <div className="mt-1 text-xs text-gray-400">
                          {recipe.isTemplate ? "Template" : "My recipe"} •{" "}
                          {recipe.ingredients.length} ingredients
                          {recipe.steps?.length ? ` • ${recipe.steps.length} steps` : ""}
                        </div>
                        <div className="mt-2 text-xs text-gray-300">
                          Per serving: {perServing.calories} kcal • P {perServing.protein} • C{" "}
                          {perServing.carbs} • F {perServing.fat}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Default servings: {recipe.defaultServings}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <MealActionButton
                        onClick={() => assignRecipeToActiveSlot(recipe)}
                        disabled={!activeSlot}
                      >
                        {activeSlot ? `Use in ${activeSlotLabel}` : "Choose Slot First"}
                      </MealActionButton>

                      <MealActionButton onClick={() => openViewer(recipe, recipe.defaultServings)}>
                        View Steps
                      </MealActionButton>

                      {isCustom ? (
                        <MealActionButton onClick={() => onShareRecipe(recipe)}>
                          Share Recipe
                        </MealActionButton>
                      ) : (
                        <MealActionButton disabled>Template</MealActionButton>
                      )}

                      {isCustom ? (
                        <MealActionButton onClick={() => onDeleteRecipe(recipe.id)}>
                          Delete
                        </MealActionButton>
                      ) : (
                        <MealActionButton disabled>Locked</MealActionButton>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredRecipes.length === 0 && (
                <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 text-sm text-gray-400 shadow-sm">
                  No recipes found.
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

            <div>
              <label className="mb-1 block text-sm text-gray-300">Recipe name</label>
              <input
                value={recipeName}
                onChange={(e) => setRecipeName(e.target.value)}
                placeholder="e.g. Turkey Chili"
                className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
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
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-gray-300">Total calories</label>
                <input
                  type="number"
                  value={totalCalories}
                  onChange={(e) => setTotalCalories(e.target.value)}
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                />
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
                          className="w-full rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm text-white"
                        />
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
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Save Recipe
            </button>
          </form>
        )}
      </div>
    </AppShell>
  );
}