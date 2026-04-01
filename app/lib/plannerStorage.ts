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

type StoredPlannerState = {
  date: string;
  plannerByDay: PlannerStateByDay;
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function dayDiff(savedDate: string, currentDate: string) {
  const saved = new Date(savedDate + "T00:00:00");
  const current = new Date(currentDate + "T00:00:00");
  const ms = current.getTime() - saved.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function resetLoggedFlags(day: PlannerDayState): PlannerDayState {
  return {
    mealSlots: {
      breakfast: { ...day.mealSlots.breakfast, logged: false },
      lunch: { ...day.mealSlots.lunch, logged: false },
      dinner: { ...day.mealSlots.dinner, logged: false },
    },
    snackSlots: day.snackSlots.map((snack) => ({
      ...snack,
      logged: false,
    })),
  };
}

function shiftPlannerForwardOnce(plannerByDay: PlannerStateByDay): PlannerStateByDay {
  return {
    today: resetLoggedFlags(plannerByDay.tomorrow),
    tomorrow: resetLoggedFlags(plannerByDay.day3),
    day3: {
      mealSlots: getDefaultMealSlots(),
      snackSlots: getDefaultSnackSlots(),
    },
  };
}

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

    const parsed = JSON.parse(raw) as Partial<StoredPlannerState>;
    const currentDate = todayKey();

    if (!parsed.date || !parsed.plannerByDay) {
      return createDefaultPlannerByDay();
    }

    const diff = dayDiff(parsed.date, currentDate);

    if (diff <= 0) {
      return parsed.plannerByDay;
    }

    if (diff === 1) {
      return shiftPlannerForwardOnce(parsed.plannerByDay);
    }

    return createDefaultPlannerByDay();
  } catch {
    return createDefaultPlannerByDay();
  }
}

export function saveMealPlannerState(plannerByDay: PlannerStateByDay) {
  const payload: StoredPlannerState = {
    date: todayKey(),
    plannerByDay,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearMealPlannerState() {
  localStorage.removeItem(STORAGE_KEY);
}