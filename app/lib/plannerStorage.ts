import type { Recipe } from "./recipes";

export type MealSlotKey = "breakfast" | "lunch" | "dinner";

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

type MealPlannerState = {
  date: string;
  mealSlots: Record<MealSlotKey, MealSlot>;
  snackSlots: SnackSlot[];
};
function todayKey() {
  return new Date().toISOString().slice(0, 10);
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

export function loadMealPlannerState(): MealPlannerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return {
        date: todayKey(),
        mealSlots: getDefaultMealSlots(),
        snackSlots: getDefaultSnackSlots(),
      };
    }

    const parsed = JSON.parse(raw) as Partial<MealPlannerState>;

    if (!parsed.date || parsed.date !== todayKey()) {
      return {
        date: todayKey(),
        mealSlots: getDefaultMealSlots(),
        snackSlots: getDefaultSnackSlots(),
      };
    }

    return {
      date: parsed.date,
      mealSlots: parsed.mealSlots ?? getDefaultMealSlots(),
      snackSlots:
        parsed.snackSlots && parsed.snackSlots.length > 0
          ? parsed.snackSlots
          : getDefaultSnackSlots(),
    };
  } catch {
    return {
      date: todayKey(),
      mealSlots: getDefaultMealSlots(),
      snackSlots: getDefaultSnackSlots(),
    };
  }
}

export function saveMealPlannerState(
  mealSlots: Record<MealSlotKey, MealSlot>,
  snackSlots: SnackSlot[]
) {
  const payload: MealPlannerState = {
    date: todayKey(),
    mealSlots,
    snackSlots,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}
export function clearMealPlannerState() {
  localStorage.removeItem(STORAGE_KEY);
}