"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AppShell from "./components/AppShell";
import { loadGroceryList } from "./lib/grocery";
import { getPlannedMeals, upsertPlannedMeal, type PlannedMealRow } from "./lib/planner-db";
import { loadRecipes, TEMPLATE_RECIPES, type Recipe } from "./lib/recipes";
import {
  MacroEntry,
  deleteFromHistory,
  loadCurrent,
  loadHistory,
  setCurrent,
} from "./lib/history";
import { loadLog, sumMacros, todayISO } from "./lib/macroLog";
import { supabase } from "./lib/supabase/client";
import {
  listInventoryItems,
  listInventorySuggestions,
  type InventoryItemRecord,
  type InventorySuggestionRecord,
} from "./lib/supabase/inventory-db";
import {
  listWorkoutSessions,
  listWorkoutTemplates,
  type WorkoutSessionRecord,
  type WorkoutTemplateRecord,
} from "./lib/supabase/workouts-db";
import { getUserProfile, type UserProfileRow } from "./lib/user-profile-db";

type RecentMeal = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type NextMealSummary = {
  title: string;
  name: string;
  description: string;
  href: string;
  actionLabel: string;
  meta: string;
};

type NextActionSummary = {
  title: string;
  name: string;
  description: string;
  href: string;
  actionLabel: string;
  meta: string;
};

type PantryGrocerySummary = {
  groceryPreview: { id: string; name: string }[];
  groceryCount: number;
  lowStock: InventoryItemRecord[];
  expiringSoon: InventoryItemRecord[];
  pendingSuggestions: InventorySuggestionRecord[];
};

type MacroRemainder = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type DailyGuidance = {
  id: string;
  type: "macro_gap" | "inventory_match" | "low_stock" | "review" | "workout";
  title: string;
  body: string;
  href: string;
  actionLabel: string;
  priority: number;
  quickAction?: "add_snack";
  recipeId?: string;
};

type PlannedMacroProjection = {
  unloggedCount: number;
  plannedTotals: MacroRemainder;
  projectedRemaining: MacroRemainder | null;
};

function formatUpdatedAt(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString();
}

function niceLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function DashboardCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="monolith-card rounded-[28px] p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-gray-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function OnboardingPrompt({ profile }: { profile: UserProfileRow | null }) {
  const hasStarted = Boolean(profile);

  return (
    <section className="monolith-card rounded-[28px] p-5">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">
        Personal Setup
      </div>
      <h2 className="mt-2 text-xl font-bold text-white">
        {hasStarted ? "Finish your setup" : "Set up your beta profile"}
      </h2>
      <p className="mt-2 text-sm leading-6 text-blue-50/80">
        Add your goals, body stats, food preferences, and training access so Macro OS can start
        shaping meal, grocery, workout, and budget suggestions around you.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="monolith-subcard rounded-2xl px-2 py-3 text-gray-200">
          Macro Targets
        </div>
        <div className="monolith-subcard rounded-2xl px-2 py-3 text-gray-200">
          Meal Ideas
        </div>
        <div className="monolith-subcard rounded-2xl px-2 py-3 text-gray-200">
          Workout Fit
        </div>
      </div>
      <div className="mt-4 grid grid-cols-[1.5fr_1fr] gap-2">
        <Link
          href="/onboarding"
          className="rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-500"
        >
          {hasStarted ? "Continue Setup" : "Start Setup"}
        </Link>
        <Link
          href="/macros"
          className="monolith-subcard rounded-2xl px-4 py-3 text-center text-sm font-semibold text-white transition hover:border-white/20"
        >
          Explore App
        </Link>
      </div>
    </section>
  );
}

function NextActionCard({
  eyebrow,
  summary,
  accentClass,
}: {
  eyebrow: string;
  summary: NextActionSummary;
  accentClass: string;
}) {
  return (
    <Link
      href={summary.href}
      className="monolith-subcard block rounded-[26px] p-4 transition hover:border-[rgba(189,238,255,0.28)] hover:shadow-[0_0_28px_rgba(111,213,255,0.08)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            {eyebrow}
          </div>
          <div className="mt-2 text-lg font-semibold text-white">{summary.title}</div>
          <div className={`mt-1 truncate text-sm font-semibold ${accentClass}`}>
            {summary.name}
          </div>
          <div className="mt-1 text-sm leading-5 text-gray-500">{summary.description}</div>
          <div className="mt-3 inline-flex rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-gray-300">
            {summary.meta}
          </div>
        </div>
        <div className="shrink-0 rounded-2xl border border-[rgba(189,238,255,0.16)] bg-[rgba(189,238,255,0.08)] px-3 py-2 text-sm font-semibold text-[#d8f5ff]">
          {summary.actionLabel}
        </div>
      </div>
    </Link>
  );
}

function ProgressRow({
  label,
  consumed,
  target,
  unit = "",
  colorClass,
}: {
  label: string;
  consumed: number;
  target: number;
  unit?: string;
  colorClass: string;
}) {
  const safeTarget = Math.max(target, 1);
  const percent = Math.min((consumed / safeTarget) * 100, 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-gray-300">{label}</span>
        <span className="text-gray-500">
          {consumed} / {target}
          {unit}
        </span>
      </div>
      <div className="h-2 w-full rounded-full border border-white/10 bg-black/45">
        <div
          className={`h-2 rounded-full transition-all ${colorClass}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function formatWorkoutSummary(
  activeSession: WorkoutSessionRecord | null,
  latestTemplate: WorkoutTemplateRecord | null
): NextActionSummary {
  if (activeSession) {
    return {
      title: "Resume workout",
      name: activeSession.name,
      description: "Pick up where you left off and keep logging your session.",
      href: `/workouts/session/${activeSession.id}`,
      actionLabel: "Resume",
      meta: activeSession.duration_sec
        ? `${Math.max(1, Math.round(activeSession.duration_sec / 60))} min logged`
        : "In progress",
    };
  }

  if (latestTemplate) {
    return {
      title: "Next workout",
      name: latestTemplate.name,
      description: "Start from your latest saved workout template.",
      href: `/workouts/session/${latestTemplate.id}`,
      actionLabel: "Start",
      meta: latestTemplate.estimated_duration_min
        ? `${latestTemplate.estimated_duration_min} min planned`
        : "Template ready",
    };
  }

  return {
    title: "Workout panel",
    name: "No workout planned",
    description: "Create a workout template or log a quick session to get started.",
    href: "/workouts",
    actionLabel: "Open",
    meta: "Ready when you are",
  };
}

const mealSlotOrder: Record<string, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
};

function formatSlotLabel(slot: PlannedMealRow) {
  if (slot.slot_type === "snack") {
    return slot.sort_order > 0 ? `Snack ${slot.sort_order + 1}` : "Snack";
  }

  return niceLabel(slot.slot_key);
}

function findRecipeForPlan(plan: PlannedMealRow, recipes: Recipe[]) {
  if (plan.recipe_id) {
    return recipes.find((recipe) => recipe.id === plan.recipe_id) ?? null;
  }

  if (plan.template_id) {
    return recipes.find((recipe) => recipe.id === plan.template_id) ?? null;
  }

  return null;
}

function formatNextMealSummary(
  plannedMeals: PlannedMealRow[],
  recipes: Recipe[]
): NextMealSummary {
  const nextPlan =
    plannedMeals
      .filter((plan) => plan.day_key === "today" && !plan.logged)
      .sort((a, b) => {
        const aOrder =
          a.slot_type === "meal" ? mealSlotOrder[a.slot_key] ?? 99 : 50 + a.sort_order;
        const bOrder =
          b.slot_type === "meal" ? mealSlotOrder[b.slot_key] ?? 99 : 50 + b.sort_order;
        return aOrder - bOrder;
      })[0] ?? null;

  if (!nextPlan) {
    return {
      title: "No meals left today",
      name: "Plan or log your next meal",
      description: "Open Macros to add another meal, log a snack, or plan tomorrow.",
      href: "/macros",
      actionLabel: "Open",
      meta: "Today clear",
    };
  }

  const recipe = findRecipeForPlan(nextPlan, recipes);
  const slotLabel = formatSlotLabel(nextPlan);
  const servings = Math.max(Number(nextPlan.servings) || 1, 1);

  return {
    title: `Next meal: ${slotLabel}`,
    name: recipe?.name ?? "Recipe not selected",
    description: recipe
      ? "View the recipe, log it, or swap it from your meal planner."
      : "This slot is planned, but the recipe could not be found.",
    href: "/macros",
    actionLabel: "Open",
    meta: `${servings} serving${servings === 1 ? "" : "s"}`,
  };
}

function getExpiringSoonItems(items: InventoryItemRecord[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const soon = new Date(today);
  soon.setDate(today.getDate() + 7);

  return items
    .filter((item) => {
      if (!item.expiration_date) return false;
      const expiration = new Date(item.expiration_date);
      return expiration >= today && expiration <= soon;
    })
    .sort(
      (a, b) =>
        new Date(a.expiration_date ?? "").getTime() -
        new Date(b.expiration_date ?? "").getTime()
    );
}

function formatInventoryLine(item: InventoryItemRecord) {
  return `${item.name} • ${Number(item.quantity)} ${item.unit}`;
}

function formatExpirationLine(item: InventoryItemRecord) {
  const date = item.expiration_date ? new Date(item.expiration_date).toLocaleDateString() : "";
  return `${item.name} • ${date}`;
}

function PreviewList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: string[];
}) {
  return (
    <div className="monolith-subcard rounded-2xl p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
        {title}
      </div>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {items.map((item) => (
            <li key={item} className="text-sm text-gray-200">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-2 text-sm text-gray-500">{empty}</div>
      )}
    </div>
  );
}

function SmartGuidanceCard({
  guidance,
  onAddSnack,
  isBusy,
}: {
  guidance: DailyGuidance;
  onAddSnack: (guidance: DailyGuidance) => void;
  isBusy: boolean;
}) {
  const toneClass =
    guidance.type === "macro_gap"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
      : guidance.type === "inventory_match"
        ? "border-blue-400/30 bg-blue-500/10 text-blue-100"
        : guidance.type === "workout"
          ? "border-indigo-400/30 bg-indigo-500/10 text-indigo-100"
          : guidance.type === "review"
            ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
            : "border-rose-400/30 bg-rose-500/10 text-rose-100";

  const content = (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{guidance.title}</div>
          <div className="mt-1 text-sm leading-5 text-gray-300">{guidance.body}</div>
        </div>
        <div className="shrink-0 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-semibold text-white">
          {isBusy ? "Adding" : guidance.actionLabel}
        </div>
      </div>
  );

  if (guidance.quickAction === "add_snack" && guidance.recipeId) {
    return (
      <button
        type="button"
        onClick={() => onAddSnack(guidance)}
        disabled={isBusy}
        className={`block w-full rounded-[24px] border p-4 text-left transition hover:scale-[1.01] hover:bg-opacity-20 disabled:cursor-wait disabled:opacity-70 ${toneClass}`}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={guidance.href}
      className={`block rounded-[24px] border p-4 transition hover:scale-[1.01] hover:bg-opacity-20 ${toneClass}`}
    >
      {content}
    </Link>
  );
}

function normalizeGuidanceName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function recipeProteinPerServing(recipe: Recipe) {
  const servings = Math.max(Number(recipe.defaultServings) || 1, 1);
  return Math.round((Number(recipe.totalMacros.protein) || 0) / servings);
}

function recipeCaloriesPerServing(recipe: Recipe) {
  const servings = Math.max(Number(recipe.defaultServings) || 1, 1);
  return Math.round((Number(recipe.totalMacros.calories) || 0) / servings);
}

function macrosForRecipeServings(recipe: Recipe, servings: number): MacroRemainder {
  const baseServings = Math.max(Number(recipe.defaultServings) || 1, 1);
  const factor = Math.max(Number(servings) || 1, 1) / baseServings;

  return {
    calories: Math.round((Number(recipe.totalMacros.calories) || 0) * factor),
    protein: Math.round((Number(recipe.totalMacros.protein) || 0) * factor),
    carbs: Math.round((Number(recipe.totalMacros.carbs) || 0) * factor),
    fat: Math.round((Number(recipe.totalMacros.fat) || 0) * factor),
  };
}

function findBestProteinRecipe(recipes: Recipe[], proteinRemaining: number) {
  return recipes
    .map((recipe) => ({
      recipe,
      protein: recipeProteinPerServing(recipe),
      calories: recipeCaloriesPerServing(recipe),
    }))
    .filter((candidate) => candidate.protein >= Math.min(proteinRemaining, 25))
    .sort((a, b) => b.protein - a.protein)[0];
}

function findBestSnackRecipe(recipes: Recipe[], projectedRemaining: MacroRemainder) {
  return recipes
    .map((recipe) => ({
      recipe,
      protein: recipeProteinPerServing(recipe),
      calories: recipeCaloriesPerServing(recipe),
    }))
    .filter((candidate) => candidate.calories > 0 && candidate.calories <= projectedRemaining.calories + 150)
    .sort((a, b) => {
      const aScore =
        Math.abs(projectedRemaining.calories - a.calories) -
        Math.min(a.protein, Math.max(projectedRemaining.protein, 0)) * 4;
      const bScore =
        Math.abs(projectedRemaining.calories - b.calories) -
        Math.min(b.protein, Math.max(projectedRemaining.protein, 0)) * 4;
      return aScore - bScore;
    })[0];
}

function calculatePlannedMacroProjection(
  remaining: MacroRemainder | null,
  plannedMeals: PlannedMealRow[],
  recipes: Recipe[]
): PlannedMacroProjection {
  const unloggedPlans = plannedMeals.filter((plan) => plan.day_key === "today" && !plan.logged);
  const plannedTotals = unloggedPlans.reduce(
    (totals, plan) => {
      const recipe = findRecipeForPlan(plan, recipes);
      if (!recipe) return totals;

      const macros = macrosForRecipeServings(recipe, plan.servings);
      return {
        calories: totals.calories + macros.calories,
        protein: totals.protein + macros.protein,
        carbs: totals.carbs + macros.carbs,
        fat: totals.fat + macros.fat,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return {
    unloggedCount: unloggedPlans.length,
    plannedTotals,
    projectedRemaining: remaining
      ? {
          calories: remaining.calories - plannedTotals.calories,
          protein: remaining.protein - plannedTotals.protein,
          carbs: remaining.carbs - plannedTotals.carbs,
          fat: remaining.fat - plannedTotals.fat,
        }
      : null,
  };
}

function findBestInventoryRecipeMatch(recipes: Recipe[], inventoryItems: InventoryItemRecord[]) {
  const stockedItems = inventoryItems.filter((item) => !item.is_archived && Number(item.quantity) > 0);
  const linkedIngredientIds = new Set(
    stockedItems
      .map((item) => item.linked_ingredient_id)
      .filter((id): id is string => Boolean(id))
  );
  const inventoryNames = stockedItems.map((item) =>
    normalizeGuidanceName(item.normalized_name || item.name)
  );

  return recipes
    .map((recipe) => {
      const ingredients = recipe.ingredients.filter((ingredient) => ingredient.name.trim());
      const matched = ingredients.filter((ingredient) => {
        const ingredientName = normalizeGuidanceName(ingredient.name);
        return (
          (ingredient.ingredientId && linkedIngredientIds.has(ingredient.ingredientId)) ||
          inventoryNames.some(
            (inventoryName) =>
              inventoryName === ingredientName ||
              inventoryName.includes(ingredientName) ||
              ingredientName.includes(inventoryName)
          )
        );
      }).length;

      return {
        recipe,
        matched,
        total: ingredients.length,
      };
    })
    .filter((candidate) => candidate.total > 0 && candidate.matched >= 2)
    .sort((a, b) => b.matched / b.total - a.matched / a.total || b.matched - a.matched)[0];
}

function buildDailyGuidance({
  remaining,
  plannedMeals,
  recipes,
  inventoryItems,
  pantryGrocery,
  activeWorkoutSession,
  latestWorkoutTemplate,
}: {
  remaining: MacroRemainder | null;
  plannedMeals: PlannedMealRow[];
  recipes: Recipe[];
  inventoryItems: InventoryItemRecord[];
  pantryGrocery: PantryGrocerySummary;
  activeWorkoutSession: WorkoutSessionRecord | null;
  latestWorkoutTemplate: WorkoutTemplateRecord | null;
}) {
  const guidance: DailyGuidance[] = [];
  const plannedProjection = calculatePlannedMacroProjection(remaining, plannedMeals, recipes);
  const projectedRemaining = plannedProjection.projectedRemaining ?? remaining;

  if (pantryGrocery.pendingSuggestions.length > 0) {
    guidance.push({
      id: "inventory-review",
      type: "review",
      title: "Review inventory changes",
      body: `${pantryGrocery.pendingSuggestions.length} inventory suggestion${
        pantryGrocery.pendingSuggestions.length === 1 ? "" : "s"
      } waiting before they affect your pantry.`,
      href: "/inventory/suggestions",
      actionLabel: "Review",
      priority: 95,
    });
  }

  if (activeWorkoutSession) {
    guidance.push({
      id: "resume-workout",
      type: "workout",
      title: "Workout still in progress",
      body: `${activeWorkoutSession.name} is open. Resume it when you are ready to finish logging.`,
      href: `/workouts/session/${activeWorkoutSession.id}`,
      actionLabel: "Resume",
      priority: 90,
    });
  } else if (latestWorkoutTemplate) {
    guidance.push({
      id: "start-workout",
      type: "workout",
      title: "Workout ready",
      body: `${latestWorkoutTemplate.name} is ready if today is a training day.`,
      href: `/workouts/session/${latestWorkoutTemplate.id}`,
      actionLabel: "Start",
      priority: 45,
    });
  }

  if (projectedRemaining && projectedRemaining.protein >= 25) {
    const proteinRecipe = findBestProteinRecipe(recipes, projectedRemaining.protein);

    if (proteinRecipe) {
      guidance.push({
        id: `protein-${proteinRecipe.recipe.id}`,
        type: "macro_gap",
        title: `${Math.round(projectedRemaining.protein)}g protein left`,
        body: `${proteinRecipe.recipe.name} adds about ${proteinRecipe.protein}g protein and ${proteinRecipe.calories} calories per serving.`,
        href: "/macros",
        actionLabel: "View",
        priority: 85,
      });
    }
  }

  if (projectedRemaining && projectedRemaining.calories >= 250) {
    const snackRecipe = findBestSnackRecipe(recipes, projectedRemaining);
    const projectionPrefix =
      plannedProjection.unloggedCount > 0
        ? `After your ${plannedProjection.unloggedCount} planned meal${
            plannedProjection.unloggedCount === 1 ? "" : "s"
          }, you are expected to be`
        : "You are";

    guidance.push({
      id: snackRecipe ? `calorie-snack-${snackRecipe.recipe.id}` : "calorie-gap",
      type: "macro_gap",
      title: `${Math.round(projectedRemaining.calories)} calories left`,
      body: snackRecipe
        ? `${projectionPrefix} about ${Math.round(projectedRemaining.calories)} calories short. ${snackRecipe.recipe.name} would add about ${snackRecipe.calories} calories and ${snackRecipe.protein}g protein.`
        : `${projectionPrefix} about ${Math.round(projectedRemaining.calories)} calories short. Add a snack or small meal to close the gap.`,
      href: "/macros",
      actionLabel: "Add Snack",
      priority: plannedProjection.unloggedCount > 0 ? 88 : 82,
      quickAction: snackRecipe ? "add_snack" : undefined,
      recipeId: snackRecipe?.recipe.id,
    });
  }

  const inventoryRecipe = findBestInventoryRecipeMatch(recipes, inventoryItems);
  if (inventoryRecipe) {
    guidance.push({
      id: `inventory-recipe-${inventoryRecipe.recipe.id}`,
      type: "inventory_match",
      title: "You may have a meal ready",
      body: `Inventory matches ${inventoryRecipe.matched}/${inventoryRecipe.total} ingredients for ${inventoryRecipe.recipe.name}.`,
      href: "/macros",
      actionLabel: "Open",
      priority: 75,
    });
  }

  const expiringSoon = pantryGrocery.expiringSoon[0];
  if (expiringSoon) {
    guidance.push({
      id: `expiring-${expiringSoon.id}`,
      type: "low_stock",
      title: "Use this soon",
      body: `${expiringSoon.name} expires soon. This could be a good ingredient to build around today.`,
      href: "/grocery",
      actionLabel: "Check",
      priority: 70,
    });
  }

  const lowStock = pantryGrocery.lowStock[0];
  if (lowStock) {
    guidance.push({
      id: `low-stock-${lowStock.id}`,
      type: "low_stock",
      title: "Running low",
      body: `${lowStock.name} is below your preferred stock level.`,
      href: "/grocery",
      actionLabel: "Restock",
      priority: 60,
    });
  }

  if (guidance.length === 0) {
    guidance.push({
      id: "fallback-plan",
      type: "inventory_match",
      title: "Plan your next move",
      body: "Log a meal, scan an item, or plan your next recipe to make the guidance smarter.",
      href: "/macros",
      actionLabel: "Open",
      priority: 10,
    });
  }

  return guidance.sort((a, b) => b.priority - a.priority).slice(0, 3);
}

export default function Dashboard() {
  const router = useRouter();
  const [current, setCurrentState] = useState<MacroEntry | null>(null);
  const [history, setHistory] = useState<MacroEntry[]>([]);
  const [pantryGrocery, setPantryGrocery] = useState<PantryGrocerySummary>({
    groceryPreview: [],
    groceryCount: 0,
    lowStock: [],
    expiringSoon: [],
    pendingSuggestions: [],
  });
  const [recentMeals, setRecentMeals] = useState<RecentMeal[]>([]);
  const [plannedMeals, setPlannedMeals] = useState<PlannedMealRow[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemRecord[]>([]);
  const [todayTotals, setTodayTotals] = useState({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });
  const [workoutTemplates, setWorkoutTemplates] = useState<WorkoutTemplateRecord[]>([]);
  const [workoutSessions, setWorkoutSessions] = useState<WorkoutSessionRecord[]>([]);
  const [onboardingProfile, setOnboardingProfile] = useState<UserProfileRow | null>(null);
  const [guidanceMessage, setGuidanceMessage] = useState<string | null>(null);
  const [guidanceBusyId, setGuidanceBusyId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadDashboardData() {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("Failed to load session:", sessionError);
        if (!active) return;
        setRedirecting(true);
        router.replace("/auth");
        return;
      }

      const user = sessionData.session?.user ?? null;

      if (!user) {
        if (!active) return;
        setRedirecting(true);
        router.replace("/auth");
        return;
      }

      try {
        const [
          loadedCurrent,
          loadedHistory,
          todayEntries,
          loadedPlannedMeals,
          loadedRecipes,
          loadedProfile,
        ] = await Promise.all([
          loadCurrent(),
          loadHistory(),
          loadLog(todayISO()),
          getPlannedMeals(),
          loadRecipes(),
          getUserProfile(user.id),
        ]);

        if (!active) return;

        setCurrentState(loadedCurrent);
        setHistory(loadedHistory);
        setTodayTotals(sumMacros(todayEntries));
        setPlannedMeals(loadedPlannedMeals);
        setRecipes([...TEMPLATE_RECIPES, ...loadedRecipes]);
        setOnboardingProfile(loadedProfile);
        setRecentMeals(
          todayEntries.slice(0, 3).map((entry) => ({
            id: entry.id,
            name: entry.name,
            calories: entry.macros.calories,
            protein: entry.macros.protein,
            carbs: entry.macros.carbs,
            fat: entry.macros.fat,
          }))
        );

        try {
          const [groceryItems, inventoryItems, pendingSuggestions] = await Promise.all([
            loadGroceryList(),
            listInventoryItems(),
            listInventorySuggestions({ status: "pending", limit: 10 }),
          ]);
          if (!active) return;

          const pending = groceryItems.filter((item) => !item.bought);
          setInventoryItems(inventoryItems);
          setPantryGrocery({
            groceryPreview: pending.slice(0, 3).map((item) => ({
              id: item.id,
              name: item.name,
            })),
            groceryCount: pending.length,
            lowStock: inventoryItems.filter((item) => item.is_low_stock).slice(0, 3),
            expiringSoon: getExpiringSoonItems(inventoryItems).slice(0, 3),
            pendingSuggestions: pendingSuggestions.slice(0, 3),
          });
        } catch (groceryError) {
          console.error("Failed to load pantry and grocery preview:", groceryError);
          if (!active) return;
          setPantryGrocery({
            groceryPreview: [],
            groceryCount: 0,
            lowStock: [],
            expiringSoon: [],
            pendingSuggestions: [],
          });
          setInventoryItems([]);
        }

        try {
          const [templates, sessions] = await Promise.all([
            listWorkoutTemplates(user.id),
            listWorkoutSessions(user.id),
          ]);
          if (!active) return;
          setWorkoutTemplates(templates);
          setWorkoutSessions(sessions);
        } catch (workoutError) {
          console.error("Failed to load workout preview:", workoutError);
          if (!active) return;
          setWorkoutTemplates([]);
          setWorkoutSessions([]);
        }

        setAuthChecked(true);
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
        if (active) setAuthChecked(true);
      }
    }

    void loadDashboardData();

    return () => {
      active = false;
    };
  }, [router]);

  async function restoreEntry(entry: MacroEntry) {
    await setCurrent(entry);
    setCurrentState(entry);
  }

  async function removeEntry(id: string) {
    const next = await deleteFromHistory(id);
    setHistory(next);

    if (current?.id === id) {
      const newCurrent = next[0] ?? null;
      if (newCurrent) {
        await setCurrent(newCurrent);
      }
      setCurrentState(newCurrent);
    }
  }

  async function addGuidanceSnack(guidance: DailyGuidance) {
    if (!guidance.recipeId || guidanceBusyId) return;

    const recipe = recipes.find((item) => item.id === guidance.recipeId);
    if (!recipe) {
      setGuidanceMessage("That suggested recipe could not be found.");
      window.setTimeout(() => setGuidanceMessage(null), 2200);
      return;
    }

    setGuidanceBusyId(guidance.id);
    setGuidanceMessage(null);

    const existingSnackCount = plannedMeals.filter(
      (plan) => plan.day_key === "today" && plan.slot_type === "snack"
    ).length;
    const slotKey = `smart-snack-${Date.now()}`;

    try {
      const result = await upsertPlannedMeal({
        day_key: "today",
        slot_type: "snack",
        slot_key: slotKey,
        recipe_id: recipe.isTemplate ? null : recipe.id,
        template_id: recipe.isTemplate ? recipe.id : null,
        servings: 1,
        logged: false,
        sort_order: existingSnackCount,
      });

      if (result.error) {
        setGuidanceMessage(result.error);
        return;
      }

      setPlannedMeals(await getPlannedMeals());
      setGuidanceMessage(`Added ${recipe.name} as a snack.`);
    } catch (error) {
      setGuidanceMessage(error instanceof Error ? error.message : "Could not add that snack.");
    } finally {
      setGuidanceBusyId(null);
      window.setTimeout(() => setGuidanceMessage(null), 2400);
    }
  }

  if (redirecting || !authChecked) {
    return (
      <AppShell title="Dashboard" subtitle="Your daily check-in and next actions">
        <div className="text-sm text-gray-400">Loading...</div>
      </AppShell>
    );
  }

  const remaining = current
    ? {
        calories: current.calories - todayTotals.calories,
        protein: current.protein - todayTotals.protein,
        carbs: current.carbs - todayTotals.carbs,
        fat: current.fat - todayTotals.fat,
      }
    : null;

  const activeWorkoutSession =
    workoutSessions.find((session) => session.status === "in_progress") ?? null;
  const latestWorkoutTemplate = workoutTemplates[0] ?? null;
  const workoutSummary = formatWorkoutSummary(activeWorkoutSession, latestWorkoutTemplate);
  const nextMealSummary = formatNextMealSummary(plannedMeals, recipes);
  const dailyGuidance = buildDailyGuidance({
    remaining,
    plannedMeals,
    recipes,
    inventoryItems,
    pantryGrocery,
    activeWorkoutSession,
    latestWorkoutTemplate,
  });

  return (
    <AppShell title="Dashboard" subtitle="Your daily check-in and next actions">
      <div className="space-y-4">
        {!onboardingProfile?.onboarding_completed ? (
          <OnboardingPrompt profile={onboardingProfile} />
        ) : null}

        <DashboardCard title="At A Glance" subtitle="The next things worth acting on today.">
          <div className="space-y-3">
            <NextActionCard
              eyebrow="Next Meal"
              summary={nextMealSummary}
              accentClass="text-emerald-300"
            />
            <NextActionCard
              eyebrow="Next Workout"
              summary={workoutSummary}
              accentClass="text-blue-300"
            />
          </div>
        </DashboardCard>

        <DashboardCard
          title="Smart Guidance"
          subtitle="Small next-step suggestions from your macros, recipes, and inventory."
        >
          <div className="space-y-2.5">
            {dailyGuidance.map((guidance) => (
              <SmartGuidanceCard
                key={guidance.id}
                guidance={guidance}
                onAddSnack={addGuidanceSnack}
                isBusy={guidanceBusyId === guidance.id}
              />
            ))}
          </div>
        </DashboardCard>

        <DashboardCard
          title="Today's Macro Progress"
          subtitle={`Tracking for ${todayISO()}`}
        >
          {current ? (
            <div className="space-y-2.5">
              <div className="monolith-subcard mb-3 flex items-start justify-between gap-3 rounded-2xl px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                    Target
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {current.calories} kcal • P {current.protein} • C {current.carbs} • F {current.fat}
                  </div>
                  {current.inputs ? (
                    <div className="mt-1 truncate text-xs text-gray-500">
                      {niceLabel(current.inputs.goal)} • {niceLabel(current.inputs.activity)}
                    </div>
                  ) : null}
                </div>
                <Link
                  href="/macros"
                  className="rounded-2xl bg-blue-500/12 px-3 py-2 text-xs font-semibold text-blue-200 hover:bg-blue-500/20"
                >
                  Edit
                </Link>
              </div>
              <ProgressRow
                label={`Calories • ${remaining?.calories ?? 0} left`}
                consumed={todayTotals.calories}
                target={current.calories}
                colorClass="macro-bar-calories"
              />
              <ProgressRow
                label={`Protein • ${remaining?.protein ?? 0}g left`}
                consumed={todayTotals.protein}
                target={current.protein}
                unit="g"
                colorClass="macro-bar-protein"
              />
              <ProgressRow
                label={`Carbs • ${remaining?.carbs ?? 0}g left`}
                consumed={todayTotals.carbs}
                target={current.carbs}
                unit="g"
                colorClass="macro-bar-carbs"
              />
              <ProgressRow
                label={`Fat • ${remaining?.fat ?? 0}g left`}
                consumed={todayTotals.fat}
                target={current.fat}
                unit="g"
                colorClass="macro-bar-fat"
              />
            </div>
          ) : (
            <div className="monolith-subcard rounded-2xl p-4 text-sm text-gray-400">
              Set your macro targets to start tracking daily progress.
            </div>
          )}
        </DashboardCard>

        {false ? (
        <DashboardCard title="Current Targets" subtitle="Your active macro target profile.">
          {current ? (
            <div className="space-y-3">
              {current?.inputs ? (
                <div className="text-xs uppercase tracking-[0.16em] text-gray-500">
                  {niceLabel(current?.inputs?.sex ?? "")} • {current?.inputs?.age ?? ""} • {niceLabel(current?.inputs?.activity ?? "")} •{" "}
                  {current?.inputs?.weightLbs ?? ""} lb • {current?.inputs?.heightIn ?? ""} in • {niceLabel(current?.inputs?.goal ?? "")}
                </div>
              ) : null}

              <div className="monolith-subcard rounded-2xl p-4">
                <div className="text-3xl font-bold text-white">{current?.calories ?? 0} kcal</div>
                <div className="mt-2 text-sm text-gray-300">
                  P {current?.protein ?? 0} • C {current?.carbs ?? 0} • F {current?.fat ?? 0}
                </div>
              </div>

              {current?.updatedAt ? (
                <div className="text-xs text-gray-500">
                  Last updated: {formatUpdatedAt(current?.updatedAt)}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="monolith-subcard rounded-2xl p-4 text-sm text-gray-400">
              No macro targets set yet.
            </div>
          )}
        </DashboardCard>
        ) : null}

        {false ? (
        <DashboardCard title="Recent Meals" subtitle="A quick look at what you logged today.">
          {recentMeals.length > 0 ? (
            <ul className="space-y-2">
              {recentMeals.map((meal) => (
                <li key={meal.id} className="monolith-subcard rounded-2xl px-4 py-3">
                  <div className="text-sm font-semibold text-white">{meal.name}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {meal.calories} kcal • P {meal.protein} • C {meal.carbs} • F {meal.fat}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="monolith-subcard rounded-2xl p-4 text-sm text-gray-400">
              No meals logged today yet.
            </div>
          )}

          <Link href="/macros" className="mt-3 block text-sm font-semibold text-blue-300 hover:text-blue-200">
            Open Macros
          </Link>
        </DashboardCard>
        ) : null}

        <DashboardCard title="Pantry & Grocery" subtitle="What’s low, expiring, or still on your list.">
          <div className="grid grid-cols-2 gap-2">
            <div className="monolith-subcard rounded-2xl p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                Next Trip
              </div>
              <div className="mt-2 text-sm font-semibold text-white">Not scheduled</div>
            </div>
            <Link href="/grocery" className="monolith-subcard rounded-2xl p-4 transition hover:border-[rgba(189,238,255,0.28)]">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                To Buy
              </div>
              <div className="mt-2 text-2xl font-bold text-white">{pantryGrocery.groceryCount}</div>
            </Link>
          </div>

          <div className="mt-3 grid gap-2">
            <PreviewList
              title="Low Stock"
              empty="No low-stock inventory right now."
              items={pantryGrocery.lowStock.map(formatInventoryLine)}
            />
            <PreviewList
              title="Expiring Soon"
              empty="Nothing expiring in the next week."
              items={pantryGrocery.expiringSoon.map(formatExpirationLine)}
            />
            <PreviewList
              title="Grocery List"
              empty="Your grocery list is clear."
              items={pantryGrocery.groceryPreview.map((item) => item.name)}
            />
            <PreviewList
              title="Needs Review"
              empty="No inventory suggestions waiting."
              items={pantryGrocery.pendingSuggestions.map(
                (suggestion) =>
                  `${suggestion.proposed_name} • ${Number(suggestion.quantity_delta)} ${suggestion.unit}`
              )}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link
              href="/grocery"
              className="rounded-2xl bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Open Grocery
            </Link>
            <Link
              href="/grocery"
              className="monolith-subcard rounded-2xl px-4 py-3 text-center text-sm font-semibold text-white transition hover:border-white/20"
            >
              Open Grocery
            </Link>
          </div>
        </DashboardCard>

        {false ? (
        <DashboardCard title="History" subtitle="Restore or remove past macro target entries.">
          {history.length === 0 ? (
            <div className="monolith-subcard rounded-2xl p-4 text-sm text-gray-400">
              No history yet. Calculate your macros to start saving entries.
            </div>
          ) : (
            <ul className="space-y-2">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="monolith-subcard flex items-center justify-between rounded-2xl p-4"
                >
                  <button
                    onClick={() => void restoreEntry(entry)}
                    className="flex-1 text-left"
                    title="Restore this entry"
                  >
                    <div className="text-sm font-semibold text-white">
                      {entry.calories} kcal • P {entry.protein} • C {entry.carbs} • F {entry.fat}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {formatUpdatedAt(entry.updatedAt)}
                      {entry.inputs ? (
                        <> • {niceLabel(entry.inputs.goal)} • {niceLabel(entry.inputs.activity)}</>
                      ) : null}
                    </div>
                  </button>

                  <button
                    onClick={() => void removeEntry(entry.id)}
                    className="ml-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-gray-300 hover:bg-white/[0.08] hover:text-white"
                    title="Delete entry"
                  >
                    X
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>
        ) : null}
      </div>

      {guidanceMessage ? (
        <div className="fixed inset-x-4 bottom-36 z-[60] mx-auto max-w-md rounded-2xl border border-emerald-300/20 bg-slate-950/95 px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_55px_rgba(2,6,23,0.6)] backdrop-blur">
          {guidanceMessage}
        </div>
      ) : null}
    </AppShell>
  );
}
