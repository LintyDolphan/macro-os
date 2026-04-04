import type { Recipe } from "./recipes";
import type {
  MealSlot,
  MealSlotKey,
  PlannerDayKey,
  PlannerDayState,
  PlannerStateByDay,
  SnackSlot,
} from "./plannerStorage";
import type { PlannedMealRow } from "./planner-db";

function createEmptyMealSlot(): MealSlot {
  return {
    recipe: null,
    servings: 1,
    logged: false,
  };
}

function createEmptyDayState(): PlannerDayState {
  return {
    mealSlots: {
      breakfast: createEmptyMealSlot(),
      lunch: createEmptyMealSlot(),
      dinner: createEmptyMealSlot(),
    },
    snackSlots: [],
  };
}

function createDefaultPlannerState(): PlannerStateByDay {
  return {
    today: createEmptyDayState(),
    tomorrow: createEmptyDayState(),
    day3: createEmptyDayState(),
  };
}

export function ensurePlannerHasSnackFallback(
  planner: PlannerStateByDay
): PlannerStateByDay {
  const withFallback = { ...planner };

  (Object.keys(withFallback) as PlannerDayKey[]).forEach((dayKey) => {
    if (withFallback[dayKey].snackSlots.length === 0) {
      withFallback[dayKey] = {
        ...withFallback[dayKey],
        snackSlots: [
          {
            id: crypto.randomUUID(),
            recipe: null,
            servings: 1,
            logged: false,
          },
        ],
      };
    }
  });

  return withFallback;
}

export function mapPlannedMealsToPlannerState(
  rows: PlannedMealRow[],
  recipes: Recipe[]
): PlannerStateByDay {
  const planner = createDefaultPlannerState();

  const recipeMap = new Map<string, Recipe>();
  for (const recipe of recipes) {
    recipeMap.set(recipe.id, recipe);
  }

  for (const row of rows) {
    const dayKey = row.day_key as PlannerDayKey;
    const recipe =
     row.recipe_id
    ? recipeMap.get(row.recipe_id) ?? null
    : row.template_id
    ? recipeMap.get(row.template_id) ?? null
    : null;

    if (row.slot_type === "meal") {
      const mealKey = row.slot_key as MealSlotKey;

      if (mealKey === "breakfast" || mealKey === "lunch" || mealKey === "dinner") {
        planner[dayKey].mealSlots[mealKey] = {
          recipe,
          servings: row.servings,
          logged: row.logged,
        };
      }

      continue;
    }

    const snack: SnackSlot = {
      id: row.slot_key,
      recipe,
      servings: row.servings,
      logged: row.logged,
    };

    planner[dayKey].snackSlots.push(snack);
  }

  (Object.keys(planner) as PlannerDayKey[]).forEach((dayKey) => {
    planner[dayKey].snackSlots.sort((a, b) => {
      const rowA = rows.find(
        (row) =>
          row.day_key === dayKey &&
          row.slot_type === "snack" &&
          row.slot_key === a.id
      );
      const rowB = rows.find(
        (row) =>
          row.day_key === dayKey &&
          row.slot_type === "snack" &&
          row.slot_key === b.id
      );

      return (rowA?.sort_order ?? 0) - (rowB?.sort_order ?? 0);
    });
  });

  return ensurePlannerHasSnackFallback(planner);
}

export function getSnackSortOrder(
  snackSlots: SnackSlot[],
  snackId: string
): number {
  const index = snackSlots.findIndex((snack) => snack.id === snackId);
  return index >= 0 ? index : 0;
}