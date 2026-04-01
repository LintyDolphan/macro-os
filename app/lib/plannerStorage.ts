import type { Recipe } from "./recipes";

export type MealSlotKey = "breakfast" | "lunch" | "dinner";
export type PlannerDayKey = "today" | "tomorrow" | "day3";

export type MealSlot = {
  recipe: Recipe | null;
  servings: number;
  logged: boolean;
};

export type SnackSlot = {
  id: string;
  recipe: Recipe | null;
  servings: number;
  logged: boolean;
};

export type PlannerDayState = {
  mealSlots: Record<MealSlotKey, MealSlot>;
  snackSlots: SnackSlot[];
};

export type PlannerStateByDay = Record<PlannerDayKey, PlannerDayState>;

const STORAGE_KEY = "meal-planner-state";

export function getDefaultMealSlots(): Record<MealSlotKey, MealSlot> {
  return {
    breakfast: { recipe: null, servings: 1, logged: false },
    lunch: { recipe: null, servings: 1, logged: false },
    dinner: { recipe: null, servings: 1, logged: false },
  };
}

export function getDefaultSnackSlots(): SnackSlot[] {
  return [
    {
      id: crypto.randomUUID(),
      recipe: null,
      servings: 1,
      logged: false,
    },
  ];
}

function createDefaultPlannerByDay(): PlannerStateByDay {
  return {
    today: {
      mealSlots: getDefaultMealSlots(),
      snackSlots: getDefaultSnackSlots(),
    },
    tomorrow: {
      mealSlots: getDefaultMealSlots(),
      snackSlots: getDefaultSnackSlots(),
    },
    day3: {
      mealSlots: getDefaultMealSlots(),
      snackSlots: getDefaultSnackSlots(),
    },
  };
}

export function loadMealPlannerState(): PlannerStateByDay {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultPlannerByDay();

    const parsed = JSON.parse(raw) as Partial<PlannerStateByDay>;

    return {
      today: {
        mealSlots: parsed.today?.mealSlots ?? getDefaultMealSlots(),
        snackSlots:
          parsed.today?.snackSlots && parsed.today.snackSlots.length > 0
            ? parsed.today.snackSlots
            : getDefaultSnackSlots(),
      },
      tomorrow: {
        mealSlots: parsed.tomorrow?.mealSlots ?? getDefaultMealSlots(),
        snackSlots:
          parsed.tomorrow?.snackSlots && parsed.tomorrow.snackSlots.length > 0
            ? parsed.tomorrow.snackSlots
            : getDefaultSnackSlots(),
      },
      day3: {
        mealSlots: parsed.day3?.mealSlots ?? getDefaultMealSlots(),
        snackSlots:
          parsed.day3?.snackSlots && parsed.day3.snackSlots.length > 0
            ? parsed.day3.snackSlots
            : getDefaultSnackSlots(),
      },
    };
  } catch {
    return createDefaultPlannerByDay();
  }
}

export function saveMealPlannerState(plannerByDay: PlannerStateByDay) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plannerByDay));
}

export function clearMealPlannerState() {
  localStorage.removeItem(STORAGE_KEY);
}