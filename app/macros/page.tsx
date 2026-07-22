"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "../components/AppShell";
import ScrollPreservingLink from "../components/ScrollPreservingLink";
import { loadGroceryList } from "../lib/grocery";
import { loadCurrent, type MacroEntry } from "../lib/history";
import {
  addLogEntry,
  deleteLogEntryForPlannedMeal,
  loadLog,
  sumMacros,
  todayISO,
} from "../lib/macroLog";
import { addIngredientsToGrocery, scaleQty } from "../lib/mealplan";
import {
  canLogPlannerDay,
  deletePlannedMealBySlot,
  getPlannedMeals,
  setPlannedMealLogged,
  upsertPlannedMeal,
  type PlannedMealRow,
  type PlannerDayKey,
  type PlannerSlotType,
} from "../lib/planner-db";
import { loadRecipes, TEMPLATE_RECIPES, type Recipe } from "../lib/recipes";
import { supabase } from "../lib/supabase/client";

const dayOrder: PlannerDayKey[] = ["today", "tomorrow", "day3"];

const dayMeta: Record<
  PlannerDayKey,
  {
    title: string;
    subtitle: string;
  }
> = {
  today: {
    title: "Today",
    subtitle: "What you are eating today",
  },
  tomorrow: {
    title: "Tomorrow",
    subtitle: "Your next day meal plan",
  },
  day3: {
    title: "Day 3",
    subtitle: "A little further ahead",
  },
};

const mealSlotOrder = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
} as const;

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-gray-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ProgressBar({
  label,
  consumed,
  projected,
  target,
  unit = "",
  colorClass,
}: {
  label: string;
  consumed: number;
  projected: number;
  target: number;
  unit?: string;
  colorClass: string;
}) {
  const safeTarget = Math.max(target, 1);
  const consumedPercent = Math.min((consumed / safeTarget) * 100, 100);
  const projectedPercent = Math.min(
    (Math.max(projected - consumed, 0) / safeTarget) * 100,
    100 - consumedPercent
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-gray-300">{label}</span>
        <span className="text-gray-500">
          {Math.round(consumed)} / {target}
          {unit}
          {projected > consumed ? ` • planned ${Math.round(projected)}${unit}` : ""}
        </span>
      </div>
      <div className="monolith-progress-track h-2 w-full rounded-full bg-gray-950">
        <div className="relative h-2 w-full">
          <div
            className={`absolute left-0 top-0 h-2 rounded-full ${colorClass}`}
            style={{ width: `${consumedPercent}%` }}
          />
          {projected > consumed ? (
            <div
              className={`absolute top-0 h-2 rounded-full opacity-35 ${colorClass}`}
              style={{ left: `${consumedPercent}%`, width: `${projectedPercent}%` }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function resolveRecipe(plan: PlannedMealRow, recipes: Recipe[]) {
  if (plan.recipe_id) {
    return recipes.find((recipe) => recipe.id === plan.recipe_id) ?? null;
  }

  if (plan.template_id) {
    return recipes.find((recipe) => recipe.id === plan.template_id) ?? null;
  }

  return null;
}

function macrosForRecipe(recipe: Recipe, servings: number) {
  const baseServings = Math.max(Number(recipe.defaultServings) || 1, 1);
  const factor = Math.max(Number(servings) || 1, 1) / baseServings;

  return {
    calories: (Number(recipe.totalMacros.calories) || 0) * factor,
    protein: (Number(recipe.totalMacros.protein) || 0) * factor,
    carbs: (Number(recipe.totalMacros.carbs) || 0) * factor,
    fat: (Number(recipe.totalMacros.fat) || 0) * factor,
  };
}

function recipeProteinPerServing(recipe: Recipe) {
  return Math.round(
    (Number(recipe.totalMacros.protein) || 0) /
      Math.max(Number(recipe.defaultServings) || 1, 1)
  );
}

function recipeCaloriesPerServing(recipe: Recipe) {
  return Math.round(
    (Number(recipe.totalMacros.calories) || 0) /
      Math.max(Number(recipe.defaultServings) || 1, 1)
  );
}

function findBestMacroSuggestion(
  recipes: Recipe[],
  remaining: { calories: number; protein: number; carbs: number; fat: number }
) {
  return recipes
    .map((recipe) => ({
      recipe,
      protein: recipeProteinPerServing(recipe),
      calories: recipeCaloriesPerServing(recipe),
    }))
    .filter((candidate) => candidate.calories > 0)
    .sort((a, b) => {
      const aScore =
        Math.abs(remaining.calories - a.calories) +
        Math.abs(Math.max(remaining.protein, 0) - a.protein) * 4;
      const bScore =
        Math.abs(remaining.calories - b.calories) +
        Math.abs(Math.max(remaining.protein, 0) - b.protein) * 4;
      return aScore - bScore;
    })[0];
}

function buildRecipePickerHref(params: {
  day: PlannerDayKey;
  slotType: PlannerSlotType;
  slotKey: string;
  slotLabel: string;
}) {
  const query = new URLSearchParams({
    pickForPlanner: "1",
    pickerReturn: "macros",
    day: params.day,
    slotType: params.slotType,
    slotKey: params.slotKey,
    slotLabel: params.slotLabel,
  });

  return `/recipes?${query.toString()}`;
}

export default function MacrosPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [current, setCurrent] = useState<MacroEntry | null>(null);
  const [todayTotals, setTodayTotals] = useState({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });
  const [plannedMeals, setPlannedMeals] = useState<PlannedMealRow[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedDay, setSelectedDay] = useState<PlannerDayKey>("today");
  const [error, setError] = useState<string | null>(null);
  const [plannerMessage, setPlannerMessage] = useState<string | null>(null);
  const [plannerBusyKey, setPlannerBusyKey] = useState<string | null>(null);
  const [groceryAddedPlanIds, setGroceryAddedPlanIds] = useState<Set<string>>(new Set());
  const [handledPickerKey, setHandledPickerKey] = useState<string | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (!session?.user) {
          if (!active) return;
          setRedirecting(true);
          window.location.replace("/auth");
          return;
        }

        const [loadedCurrent, todayEntries, loadedPlannedMeals, loadedRecipes] =
          await Promise.all([
            loadCurrent(),
            loadLog(todayISO()),
            getPlannedMeals(),
            loadRecipes(),
          ]);

        if (!active) return;

        setCurrent(loadedCurrent);
        setTodayTotals(sumMacros(todayEntries));
        setPlannedMeals(loadedPlannedMeals);
        setRecipes([...TEMPLATE_RECIPES, ...loadedRecipes]);
        setError(null);
      } catch (initError) {
        if (!active) return;
        console.error("Failed to initialize macros page:", initError);
        setError(
          initError instanceof Error
            ? initError.message
            : "Macros page could not be loaded."
        );
      } finally {
        if (active) setAuthChecked(true);
      }
    }

    void init();

    return () => {
      active = false;
    };
  }, []);

  async function refreshPlannedMeals() {
    setPlannedMeals(await getPlannedMeals());
  }

  async function refreshTodayTotals() {
    setTodayTotals(sumMacros(await loadLog(todayISO())));
  }

  useEffect(() => {
    if (!authChecked || recipes.length === 0 || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const pickedRecipe = params.get("pickedRecipe");
    const pickedTemplate = params.get("pickedTemplate") === "1";
    const day = params.get("day") as PlannerDayKey | null;
    const slotType = params.get("slotType") as PlannerSlotType | null;
    const slotKey = params.get("slotKey");
    const pickerKey = [pickedRecipe, day, slotType, slotKey, pickedTemplate ? "1" : "0"].join(":");

    if (!pickedRecipe || !day || !slotType || !slotKey || handledPickerKey === pickerKey) {
      return;
    }

    const selectedPickerDay = day;
    const selectedPickerSlotType = slotType;
    const selectedPickerSlotKey = slotKey;
    const recipe = recipes.find((item) => item.id === pickedRecipe);
    if (!recipe) {
      setHandledPickerKey(pickerKey);
      return;
    }
    const selectedRecipe = recipe;

    async function applyPickedRecipe() {
      setPlannerBusyKey(`pick:${slotType}:${slotKey}`);
      setError(null);

      try {
        const existingPlan = plannedMeals.find(
          (plan) =>
            plan.day_key === selectedPickerDay &&
            plan.slot_type === selectedPickerSlotType &&
            plan.slot_key === selectedPickerSlotKey
        );

        if (existingPlan?.logged) {
          setError("Clear the logged meal before choosing a replacement.");
          return;
        }

        const snackCount = plannedMeals.filter(
          (plan) => plan.day_key === selectedPickerDay && plan.slot_type === "snack"
        ).length;

        const result = await upsertPlannedMeal({
          day_key: selectedPickerDay,
          slot_type: selectedPickerSlotType,
          slot_key: selectedPickerSlotKey,
          recipe_id: pickedTemplate ? null : selectedRecipe.id,
          template_id: pickedTemplate ? selectedRecipe.id : null,
          servings: 1,
          logged: false,
          sort_order: selectedPickerSlotType === "snack" ? snackCount : 0,
        });

        if (result.error) {
          setError(result.error);
          return;
        }

        await refreshPlannedMeals();
        setSelectedDay(selectedPickerDay);
        setPlannerMessage(`Added ${selectedRecipe.name} to ${dayMeta[selectedPickerDay].title}.`);
        window.setTimeout(() => setPlannerMessage(null), 2200);
        router.replace("/macros");
      } catch (pickerError) {
        setError(
          pickerError instanceof Error
            ? pickerError.message
            : "Could not apply the selected recipe."
        );
      } finally {
        setHandledPickerKey(pickerKey);
        setPlannerBusyKey(null);
      }
    }

    void applyPickedRecipe();
  }, [authChecked, handledPickerKey, plannedMeals, recipes, router]);

  const selectedDayIndex = dayOrder.indexOf(selectedDay);

  const dayMeals = useMemo(
    () =>
      plannedMeals
        .filter((plan) => plan.day_key === selectedDay)
        .sort((a, b) => {
          const aOrder =
            a.slot_type === "meal"
              ? mealSlotOrder[a.slot_key as keyof typeof mealSlotOrder] ?? 10
              : 20 + a.sort_order;
          const bOrder =
            b.slot_type === "meal"
              ? mealSlotOrder[b.slot_key as keyof typeof mealSlotOrder] ?? 10
              : 20 + b.sort_order;
          return aOrder - bOrder;
        }),
    [plannedMeals, selectedDay]
  );

  const projectedTotals = useMemo(() => {
    const base =
      selectedDay === "today"
        ? { ...todayTotals }
        : { calories: 0, protein: 0, carbs: 0, fat: 0 };

    dayMeals.forEach((plan) => {
      if (selectedDay === "today" && plan.logged) return;

      const recipe = resolveRecipe(plan, recipes);
      if (!recipe) return;

      const macros = macrosForRecipe(recipe, plan.servings);
      base.calories += macros.calories;
      base.protein += macros.protein;
      base.carbs += macros.carbs;
      base.fat += macros.fat;
    });

    return {
      calories: Math.round(base.calories),
      protein: Math.round(base.protein),
      carbs: Math.round(base.carbs),
      fat: Math.round(base.fat),
    };
  }, [dayMeals, recipes, selectedDay, todayTotals]);

  const remainingAfterPlan = useMemo(() => {
    if (!current) return null;

    return {
      calories: Math.round(current.calories - projectedTotals.calories),
      protein: Math.round(current.protein - projectedTotals.protein),
      carbs: Math.round(current.carbs - projectedTotals.carbs),
      fat: Math.round(current.fat - projectedTotals.fat),
    };
  }, [current, projectedTotals]);

  const suggestion = useMemo(() => {
    if (!current || !remainingAfterPlan) return null;
    return findBestMacroSuggestion(recipes, remainingAfterPlan);
  }, [current, recipes, remainingAfterPlan]);

  function moveDay(direction: "prev" | "next") {
    setSelectedDay((currentDay) => {
      const currentIndex = dayOrder.indexOf(currentDay);
      const nextIndex =
        direction === "prev"
          ? Math.max(0, currentIndex - 1)
          : Math.min(dayOrder.length - 1, currentIndex + 1);
      return dayOrder[nextIndex];
    });
  }

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const startX = touchStartXRef.current;
    const endX = event.changedTouches[0]?.clientX ?? null;
    touchStartXRef.current = null;

    if (startX == null || endX == null) return;
    const delta = endX - startX;

    if (Math.abs(delta) < 50) return;
    if (delta < 0) moveDay("next");
    if (delta > 0) moveDay("prev");
  }

  async function adjustMealServings(plan: PlannedMealRow, delta: number) {
    if (plan.logged) {
      setPlannerMessage("Clear the logged meal before changing its servings.");
      window.setTimeout(() => setPlannerMessage(null), 2200);
      return;
    }

    const recipe = resolveRecipe(plan, recipes);
    if (!recipe) return;

    const nextServings = Math.max(1, (Number(plan.servings) || 1) + delta);
    const busyKey = `${plan.day_key}:${plan.slot_type}:${plan.slot_key}:servings`;
    setPlannerBusyKey(busyKey);
    setError(null);

    try {
      const result = await upsertPlannedMeal({
        day_key: plan.day_key,
        slot_type: plan.slot_type,
        slot_key: plan.slot_key,
        recipe_id: plan.recipe_id,
        template_id: plan.template_id,
        servings: nextServings,
        logged: plan.logged,
        sort_order: plan.sort_order,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      await refreshPlannedMeals();
      setPlannerMessage(`Updated ${recipe.name} to ${nextServings} serving${nextServings === 1 ? "" : "s"}.`);
      window.setTimeout(() => setPlannerMessage(null), 1800);
    } catch (servingError) {
      setError(
        servingError instanceof Error
          ? servingError.message
          : "Could not update servings."
      );
    } finally {
      setPlannerBusyKey(null);
    }
  }

  async function toggleLogged(plan: PlannedMealRow) {
    if (!plan.logged && !canLogPlannerDay(plan.day_key)) {
      setPlannerMessage("Future meals can be planned, but they cannot be logged yet.");
      window.setTimeout(() => setPlannerMessage(null), 2200);
      return;
    }

    const busyKey = `${plan.day_key}:${plan.slot_type}:${plan.slot_key}:logged`;
    setPlannerBusyKey(busyKey);
    setError(null);

    try {
      const nextLogged = !plan.logged;
      const result = await setPlannedMealLogged(
        plan.day_key,
        plan.slot_type,
        plan.slot_key,
        nextLogged
      );

      if (result.error) {
        setError(result.error);
        return;
      }

      if (!plan.logged) {
        const recipe = resolveRecipe(plan, recipes);
        if (!recipe) {
          await setPlannedMealLogged(plan.day_key, plan.slot_type, plan.slot_key, false);
          setError("Could not find the recipe attached to this planned meal.");
          return;
        }

        const macros = macrosForRecipe(recipe, plan.servings);
        const servings = Math.max(Number(plan.servings) || 1, 1);
        const name = servings > 1 ? `${recipe.name} x${servings}` : recipe.name;
        try {
          await addLogEntry(name, macros, plan.id);
        } catch (logError) {
          await setPlannedMealLogged(plan.day_key, plan.slot_type, plan.slot_key, false);
          throw logError;
        }
      }

      if (plan.logged) {
        await deleteLogEntryForPlannedMeal(plan.id);
      }

      await Promise.all([refreshPlannedMeals(), refreshTodayTotals()]);
      setPlannerMessage(plan.logged ? "Marked meal as planned again." : "Marked meal as logged.");
      window.setTimeout(() => setPlannerMessage(null), 1800);
    } catch (loggedError) {
      setError(
        loggedError instanceof Error
          ? loggedError.message
          : "Could not update logged state."
      );
    } finally {
      setPlannerBusyKey(null);
    }
  }

  async function clearPlannedMeal(plan: PlannedMealRow) {
    const busyKey = `${plan.day_key}:${plan.slot_type}:${plan.slot_key}:clear`;
    setPlannerBusyKey(busyKey);
    setError(null);

    try {
      if (plan.logged) {
        await deleteLogEntryForPlannedMeal(plan.id);
      }

      await deletePlannedMealBySlot(plan.day_key, plan.slot_type, plan.slot_key);
      await Promise.all([refreshPlannedMeals(), refreshTodayTotals()]);
      setPlannerMessage("Removed meal from the plan.");
      window.setTimeout(() => setPlannerMessage(null), 1800);
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : "Could not remove that meal."
      );
    } finally {
      setPlannerBusyKey(null);
    }
  }

  async function addPlannedMealToGrocery(plan: PlannedMealRow) {
    const recipe = resolveRecipe(plan, recipes);
    if (!recipe) {
      setError("Could not find the recipe attached to this planned meal.");
      return;
    }

    const busyKey = `${plan.day_key}:${plan.slot_type}:${plan.slot_key}:grocery`;
    setPlannerBusyKey(busyKey);
    setError(null);

    try {
      const factor =
        Math.max(Number(plan.servings) || 1, 1) /
        Math.max(Number(recipe.defaultServings) || 1, 1);
      const ingredients = recipe.ingredients.map((ingredient) => ({
        ...ingredient,
        qty: scaleQty(ingredient.qty, factor),
      }));

      if (ingredients.length === 0) {
        setPlannerMessage(`${recipe.name} has no ingredients to add.`);
        window.setTimeout(() => setPlannerMessage(null), 2200);
        return;
      }

      const currentList = await loadGroceryList("personal");
      await addIngredientsToGrocery(currentList, ingredients, "personal");
      setGroceryAddedPlanIds((current) => new Set(current).add(plan.id));
      setPlannerMessage(
        `Added ${ingredients.length} ingredient${ingredients.length === 1 ? "" : "s"} from ${recipe.name} to Grocery.`
      );
      window.setTimeout(() => setPlannerMessage(null), 2400);
    } catch (groceryError) {
      setError(
        groceryError instanceof Error
          ? groceryError.message
          : "Could not add this meal to Grocery."
      );
    } finally {
      setPlannerBusyKey(null);
    }
  }

  function buildSnackAddHref(dayKey: PlannerDayKey) {
    const snackCount = plannedMeals.filter(
      (plan) => plan.day_key === dayKey && plan.slot_type === "snack"
    ).length;

    return buildRecipePickerHref({
      day: dayKey,
      slotType: "snack",
      slotKey: `macro-snack-${dayKey}-${snackCount + 1}`,
      slotLabel: "Snack",
    });
  }

  if (redirecting || !authChecked) {
    return (
      <AppShell title="Macros" subtitle="Meals, recipes, and your nutrition targets">
        <div className="text-sm text-gray-400">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Macros" subtitle="Meals, recipes, and your nutrition targets">
      <div className="space-y-4">
        {error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <SectionCard
          title="Today's Macro Summary"
          subtitle="Solid bars are logged. The soft extension shows where your current plan would land."
        >
          {current ? (
            <div className="space-y-2.5">
              <div className="mb-3 flex items-start justify-between gap-3 rounded-2xl bg-gray-900 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                    {dayMeta[selectedDay].title} target
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {current.calories} kcal • P {current.protein} • C {current.carbs} • F {current.fat}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Planned finish: {projectedTotals.calories} kcal • P {projectedTotals.protein} • C {projectedTotals.carbs} • F {projectedTotals.fat}
                  </div>
                </div>
                <Link
                  href="/calculator"
                  className="rounded-2xl bg-blue-500/12 px-3 py-2 text-xs font-semibold text-blue-200 hover:bg-blue-500/20"
                >
                  Edit
                </Link>
              </div>

              <ProgressBar
                label={`Calories • ${remainingAfterPlan?.calories ?? 0} left after plan`}
                consumed={selectedDay === "today" ? todayTotals.calories : 0}
                projected={projectedTotals.calories}
                target={current.calories}
                colorClass="macro-bar-calories"
              />
              <ProgressBar
                label={`Protein • ${remainingAfterPlan?.protein ?? 0}g left after plan`}
                consumed={selectedDay === "today" ? todayTotals.protein : 0}
                projected={projectedTotals.protein}
                target={current.protein}
                unit="g"
                colorClass="macro-bar-protein"
              />
              <ProgressBar
                label={`Carbs • ${remainingAfterPlan?.carbs ?? 0}g left after plan`}
                consumed={selectedDay === "today" ? todayTotals.carbs : 0}
                projected={projectedTotals.carbs}
                target={current.carbs}
                unit="g"
                colorClass="macro-bar-carbs"
              />
              <ProgressBar
                label={`Fat • ${remainingAfterPlan?.fat ?? 0}g left after plan`}
                consumed={selectedDay === "today" ? todayTotals.fat : 0}
                projected={projectedTotals.fat}
                target={current.fat}
                unit="g"
                colorClass="macro-bar-fat"
              />
            </div>
          ) : (
            <div className="rounded-2xl bg-gray-900 p-4 text-sm text-gray-400">
              Set your macro targets to start tracking progress here.
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Meal Planning"
          subtitle="Swipe once to snap between days, then make small edits right inside the planner card."
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => moveDay("prev")}
                disabled={selectedDayIndex === 0}
                className="rounded-2xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ←
              </button>
              <div className="text-center">
                <div className="text-sm font-semibold text-white">
                  {dayMeta[selectedDay].title}
                </div>
                <div className="text-xs text-gray-400">
                  {dayMeta[selectedDay].subtitle}
                </div>
              </div>
              <button
                type="button"
                onClick={() => moveDay("next")}
                disabled={selectedDayIndex === dayOrder.length - 1}
                className="rounded-2xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                →
              </button>
            </div>

            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              className="overflow-hidden rounded-[28px] border border-gray-700 bg-gray-900"
            >
              <div
                className="flex transition-transform duration-300 ease-out"
                style={{ transform: `translateX(-${selectedDayIndex * 100}%)` }}
              >
                {dayOrder.map((dayKey) => {
                  const mealsForDay = plannedMeals
                    .filter((plan) => plan.day_key === dayKey)
                    .sort((a, b) => {
                      const aOrder =
                        a.slot_type === "meal"
                          ? mealSlotOrder[a.slot_key as keyof typeof mealSlotOrder] ?? 10
                          : 20 + a.sort_order;
                      const bOrder =
                        b.slot_type === "meal"
                          ? mealSlotOrder[b.slot_key as keyof typeof mealSlotOrder] ?? 10
                          : 20 + b.sort_order;
                      return aOrder - bOrder;
                    });

                  const slots = ["breakfast", "lunch", "dinner"] as const;
                  const snacksForDay = mealsForDay.filter((plan) => plan.slot_type === "snack");

                  return (
                    <div key={dayKey} className="w-full shrink-0 p-4">
                      <div className="space-y-2">
                        {slots.map((slot) => {
                          const slotMeal =
                            mealsForDay.find(
                              (plan) =>
                                plan.slot_type === "meal" && plan.slot_key === slot
                            ) ?? null;
                          const recipe = slotMeal
                            ? resolveRecipe(slotMeal, recipes)
                            : null;

                          return (
                            <div
                              key={slot}
                              className={`rounded-2xl border px-4 py-3 transition ${
                                slotMeal?.logged
                                  ? "confirmed-accent"
                                  : "border-white/10 bg-gray-900"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="text-[11px] uppercase tracking-[0.16em] text-gray-500">
                                    {slot.charAt(0).toUpperCase() + slot.slice(1)}
                                  </div>
                                  <div className="mt-1 truncate text-sm font-semibold text-white">
                                    {recipe?.name ?? "Add meal"}
                                  </div>
                                  <div className="mt-1 text-xs text-gray-400">
                                    {slotMeal
                                      ? `${Math.max(Number(slotMeal.servings) || 1, 1)} servings${slotMeal.logged ? " • Logged" : " • Planned"}`
                                      : "No meal planned"}
                                  </div>
                                </div>

                                {slotMeal?.logged ? (
                                  <span
                                    title="Clear this logged meal before choosing a replacement."
                                    className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-500"
                                  >
                                    Locked
                                  </span>
                                ) : (
                                  <ScrollPreservingLink
                                    href={buildRecipePickerHref({
                                      day: dayKey,
                                      slotType: "meal",
                                      slotKey: slot,
                                      slotLabel:
                                        slot.charAt(0).toUpperCase() + slot.slice(1),
                                    })}
                                    className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                                  >
                                    {slotMeal ? "Swap" : "Pick"}
                                  </ScrollPreservingLink>
                                )}
                              </div>

                              {slotMeal ? (
                                <div className="mt-3 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <div className="flex items-center rounded-xl bg-gray-900">
                                      <button
                                        type="button"
                                        onClick={() => void adjustMealServings(slotMeal, -1)}
                                        disabled={
                                          slotMeal.logged ||
                                          plannerBusyKey === `${slotMeal.day_key}:${slotMeal.slot_type}:${slotMeal.slot_key}:servings`
                                        }
                                        className="px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-30"
                                      >
                                        -
                                      </button>
                                      <div className="px-2 text-xs font-semibold text-gray-300">
                                        {Math.max(Number(slotMeal.servings) || 1, 1)}x
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => void adjustMealServings(slotMeal, 1)}
                                        disabled={
                                          slotMeal.logged ||
                                          plannerBusyKey === `${slotMeal.day_key}:${slotMeal.slot_type}:${slotMeal.slot_key}:servings`
                                        }
                                        className="px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-30"
                                      >
                                        +
                                      </button>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => void toggleLogged(slotMeal)}
                                      disabled={
                                        plannerBusyKey === `${slotMeal.day_key}:${slotMeal.slot_type}:${slotMeal.slot_key}:logged` ||
                                        (!slotMeal.logged && !canLogPlannerDay(dayKey))
                                      }
                                      title={!slotMeal.logged && !canLogPlannerDay(dayKey) ? "Future meals cannot be logged." : undefined}
                                      className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                                        slotMeal.logged
                                          ? "confirmed-button"
                                          : "bg-gray-900 text-gray-300 hover:bg-gray-950"
                                      } disabled:cursor-not-allowed disabled:opacity-40`}
                                    >
                                      {slotMeal.logged
                                        ? "Logged"
                                        : canLogPlannerDay(dayKey)
                                          ? "Log"
                                          : "Available Today"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void clearPlannedMeal(slotMeal)}
                                      disabled={plannerBusyKey === `${slotMeal.day_key}:${slotMeal.slot_type}:${slotMeal.slot_key}:clear`}
                                      className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-300 transition hover:bg-gray-950 disabled:opacity-40"
                                    >
                                      Clear
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-1 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => void addPlannedMealToGrocery(slotMeal)}
                                      disabled={
                                        groceryAddedPlanIds.has(slotMeal.id) ||
                                        plannerBusyKey === `${slotMeal.day_key}:${slotMeal.slot_type}:${slotMeal.slot_key}:grocery`
                                      }
                                      className="rounded-xl border border-white/10 bg-gray-900 px-3 py-2.5 text-xs font-semibold text-[#d8f5ff] transition hover:border-[rgba(189,238,255,0.28)] hover:bg-[#101719] disabled:cursor-not-allowed disabled:text-gray-500"
                                    >
                                      {groceryAddedPlanIds.has(slotMeal.id)
                                        ? "In Grocery"
                                        : plannerBusyKey === `${slotMeal.day_key}:${slotMeal.slot_type}:${slotMeal.slot_key}:grocery`
                                          ? "Adding..."
                                          : "Add Grocery"}
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}

                        <div className="rounded-2xl border border-white/10 bg-gray-900 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.16em] text-gray-500">
                                Snacks
                              </div>
                              <div className="mt-1 text-sm font-semibold text-white">
                                {snacksForDay.length} planned
                              </div>
                            </div>

                            <ScrollPreservingLink
                              href={buildSnackAddHref(dayKey)}
                              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                            >
                              Add Snack
                            </ScrollPreservingLink>
                          </div>

                          {snacksForDay.length > 0 ? (
                            <div className="mt-3 space-y-2">
                              {snacksForDay.map((snack, index) => {
                                const recipe = resolveRecipe(snack, recipes);
                                return (
                                  <div
                                    key={snack.id}
                                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition ${
                                      snack.logged
                                        ? "confirmed-accent"
                                        : "border-transparent bg-gray-900"
                                    }`}
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-sm font-semibold text-white">
                                        {recipe?.name ?? `Snack ${index + 1}`}
                                      </div>
                                      <div className="mt-1 text-xs text-gray-400">
                                        {Math.max(Number(snack.servings) || 1, 1)} servings
                                        {snack.logged ? " • Logged" : ""}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void toggleLogged(snack)}
                                        disabled={
                                          plannerBusyKey === `${snack.day_key}:${snack.slot_type}:${snack.slot_key}:logged` ||
                                          (!snack.logged && !canLogPlannerDay(dayKey))
                                        }
                                        title={!snack.logged && !canLogPlannerDay(dayKey) ? "Future meals cannot be logged." : undefined}
                                        className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                                          snack.logged
                                            ? "confirmed-button"
                                            : "bg-gray-800 text-gray-300"
                                        } disabled:cursor-not-allowed disabled:opacity-40`}
                                      >
                                        {snack.logged
                                          ? "Logged"
                                          : canLogPlannerDay(dayKey)
                                            ? "Log"
                                            : "Available Today"}
                                      </button>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => void clearPlannedMeal(snack)}
                                          disabled={plannerBusyKey === `${snack.day_key}:${snack.slot_type}:${snack.slot_key}:clear`}
                                          className="rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-[11px] font-semibold text-gray-300 disabled:opacity-40"
                                        >
                                          Clear
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void addPlannedMealToGrocery(snack)}
                                          disabled={
                                            groceryAddedPlanIds.has(snack.id) ||
                                            plannerBusyKey === `${snack.day_key}:${snack.slot_type}:${snack.slot_key}:grocery`
                                          }
                                          className="rounded-lg border border-white/10 bg-gray-900 px-2.5 py-1.5 text-[11px] font-semibold text-[#d8f5ff] transition hover:border-[rgba(189,238,255,0.28)] hover:bg-[#101719] disabled:cursor-not-allowed disabled:text-gray-500"
                                        >
                                          {groceryAddedPlanIds.has(snack.id)
                                            ? "In Grocery"
                                            : plannerBusyKey === `${snack.day_key}:${snack.slot_type}:${snack.slot_key}:grocery`
                                              ? "Adding..."
                                              : "Grocery"}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-center gap-2">
              {dayOrder.map((dayKey) => (
                <button
                  key={dayKey}
                  type="button"
                  onClick={() => setSelectedDay(dayKey)}
                  className={`h-2.5 rounded-full transition ${
                    selectedDay === dayKey ? "w-7 bg-blue-500" : "w-2.5 bg-gray-600"
                  }`}
                  aria-label={`Show ${dayMeta[dayKey].title}`}
                />
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/meals"
                className="rounded-2xl bg-gray-900 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-gray-700"
              >
                Full Planner
              </Link>
              <Link
                href="/recipes"
                className="rounded-2xl bg-gray-900 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-gray-700"
              >
                Browse Recipes
              </Link>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Smart Meal Suggestions"
          subtitle="Use the projected bars to close out the day instead of guessing."
        >
          {current && remainingAfterPlan ? (
            <div className="space-y-3">
              <div className="rounded-2xl bg-gray-900 p-4">
                <div className="text-sm font-semibold text-white">
                  {dayMeta[selectedDay].title} projection
                </div>
                <div className="mt-2 text-sm text-gray-300">
                  After your current plan, you are projected to be{" "}
                  <span className="font-semibold text-white">
                    {remainingAfterPlan.calories} kcal
                  </span>{" "}
                  and{" "}
                  <span className="font-semibold text-white">
                    {remainingAfterPlan.protein}g protein
                  </span>{" "}
                  away from target.
                </div>
              </div>

              {suggestion ? (
                <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4">
                  <div className="text-sm font-semibold text-white">
                    {suggestion.recipe.name}
                  </div>
                  <div className="mt-1 text-sm text-emerald-100/85">
                    Adds about {suggestion.calories} kcal and {suggestion.protein}g protein per serving.
                  </div>
                  <Link
                    href="/recipes"
                    className="mt-3 inline-flex rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    View Recipes
                  </Link>
                </div>
              ) : (
                <div className="rounded-2xl bg-gray-900 p-4 text-sm text-gray-400">
                  Add more recipes to get smarter suggestions here.
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl bg-gray-900 p-4 text-sm text-gray-400">
              Set your macro targets to unlock projected suggestions.
            </div>
          )}
        </SectionCard>
      </div>

      {plannerMessage ? (
        <div className="fixed inset-x-4 bottom-36 z-[60] mx-auto max-w-md rounded-2xl border border-emerald-300/20 bg-slate-950/95 px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_55px_rgba(2,6,23,0.6)] backdrop-blur">
          {plannerMessage}
        </div>
      ) : null}
    </AppShell>
  );
}
