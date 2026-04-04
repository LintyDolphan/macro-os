import {
  deleteMacroTarget,
  getCurrentMacroTarget,
  getMacroTargets,
  saveMacroTarget,
} from "./macro-db";

export type MacroEntry = {
  id: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  updatedAt: string;
  inputs?: {
    sex: "male" | "female";
    age: number;
    activity: "sedentary" | "light" | "moderate" | "very" | "athlete";
    weightLbs: number;
    heightIn: number;
    goal: "cut" | "maintain" | "bulk";
  };
};

const MAX_ENTRIES = 10;

function mapRowToMacroEntry(row: {
  id: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sex: "male" | "female" | null;
  age: number | null;
  activity: "sedentary" | "light" | "moderate" | "very" | "athlete" | null;
  weight_lbs: number | null;
  height_in: number | null;
  goal: "cut" | "maintain" | "bulk" | null;
  updated_at: string;
}): MacroEntry {
  const hasInputs =
    row.sex !== null &&
    row.age !== null &&
    row.activity !== null &&
    row.weight_lbs !== null &&
    row.height_in !== null &&
    row.goal !== null;

  return {
    id: row.id,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    updatedAt: row.updated_at,
    inputs: hasInputs
      ? {
          sex: row.sex!,
          age: row.age!,
          activity: row.activity!,
          weightLbs: Number(row.weight_lbs),
          heightIn: Number(row.height_in),
          goal: row.goal!,
        }
      : undefined,
  };
}

export async function loadHistory(): Promise<MacroEntry[]> {
  const rows = await getMacroTargets();
  return rows.slice(0, MAX_ENTRIES).map(mapRowToMacroEntry);
}

export async function saveHistory(entries: MacroEntry[]) {
  return entries;
}

export async function addToHistory(entry: MacroEntry) {
  await saveMacroTarget({
    calories: entry.calories,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
    sex: entry.inputs?.sex ?? null,
    age: entry.inputs?.age ?? null,
    activity: entry.inputs?.activity ?? null,
    weight_lbs: entry.inputs?.weightLbs ?? null,
    height_in: entry.inputs?.heightIn ?? null,
    goal: entry.inputs?.goal ?? null,
    is_current: true,
  });

  return await loadHistory();
}

export async function setCurrent(entry: MacroEntry) {
  await saveMacroTarget({
    calories: entry.calories,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
    sex: entry.inputs?.sex ?? null,
    age: entry.inputs?.age ?? null,
    activity: entry.inputs?.activity ?? null,
    weight_lbs: entry.inputs?.weightLbs ?? null,
    height_in: entry.inputs?.heightIn ?? null,
    goal: entry.inputs?.goal ?? null,
    is_current: true,
  });
}

export async function loadCurrent(): Promise<MacroEntry | null> {
  const row = await getCurrentMacroTarget();
  return row ? mapRowToMacroEntry(row) : null;
}

export async function deleteFromHistory(id: string) {
  await deleteMacroTarget(id);
  return await loadHistory();
}

export async function clearHistory() {
  const entries = await loadHistory();

  for (const entry of entries) {
    await deleteMacroTarget(entry.id);
  }
}