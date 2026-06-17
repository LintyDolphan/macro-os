import type { Macros } from "./recipes";
import {
  createMacroLogEntry,
  deleteMacroLogEntry,
  deleteMacroLogEntryForPlannedMeal,
  getMacroLogEntries,
} from "./macro-db";

export type MacroLogEntry = {
  id: string;
  name: string;
  macros: Macros;
  createdAt: string;
};

const plannerLogStorageKey = "macro-os:planner-log-entries";

function readPlannerLogEntryIds() {
  if (typeof window === "undefined") return {} as Record<string, string>;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(plannerLogStorageKey) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writePlannerLogEntryId(plannedMealId: string, entryId: string | null) {
  if (typeof window === "undefined") return;

  try {
    const entries = readPlannerLogEntryIds();
    if (entryId) {
      entries[plannedMealId] = entryId;
    } else {
      delete entries[plannedMealId];
    }
    window.localStorage.setItem(plannerLogStorageKey, JSON.stringify(entries));
  } catch {
    // Logging should still work if browser storage is unavailable.
  }
}

function mapRowToEntry(row: {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  created_at: string;
}): MacroLogEntry {
  return {
    id: row.id,
    name: row.name,
    macros: {
      calories: row.calories ?? 0,
      protein: row.protein ?? 0,
      carbs: row.carbs ?? 0,
      fat: row.fat ?? 0,
    },
    createdAt: row.created_at,
  };
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export async function loadLog(dateISO = todayISO()): Promise<MacroLogEntry[]> {
  const rows = await getMacroLogEntries(dateISO);
  return rows.map(mapRowToEntry);
}

export async function deleteLogEntry(date: string, id: string) {
  await deleteMacroLogEntry(id);
  return await loadLog(date);
}

export async function deleteLogEntryForPlannedMeal(plannedMealId: string) {
  const fallbackEntryId = readPlannerLogEntryIds()[plannedMealId];

  try {
    await deleteMacroLogEntryForPlannedMeal(plannedMealId);
  } catch (error) {
    if (!fallbackEntryId) throw error;
  }

  if (fallbackEntryId) {
    await deleteMacroLogEntry(fallbackEntryId);
  }

  writePlannerLogEntryId(plannedMealId, null);
  return await loadLog(todayISO());
}

export function sumMacros(entries: MacroLogEntry[]): Macros {
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + (e.macros.calories || 0),
      protein: acc.protein + (e.macros.protein || 0),
      carbs: acc.carbs + (e.macros.carbs || 0),
      fat: acc.fat + (e.macros.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

export async function addLogEntry(
  name: string,
  macros: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  },
  plannedMealId?: string
): Promise<MacroLogEntry> {
  const row = await createMacroLogEntry({
    date_key: todayISO(),
    name,
    calories: macros.calories,
    protein: macros.protein,
    carbs: macros.carbs,
    fat: macros.fat,
    planned_meal_id: plannedMealId ?? null,
  });

  if (plannedMealId) {
    writePlannerLogEntryId(plannedMealId, row.id);
  }

  return mapRowToEntry(row);
}
