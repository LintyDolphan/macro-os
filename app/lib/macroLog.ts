import type { Macros } from "./recipes";

export type MacroLogEntry = {
  id: string;
  name: string;        // e.g. recipe name or "Meal plan"
  macros: Macros;      // macros added
  createdAt: string;
};

function keyForDate(dateISO: string) {
  return `macroLog:${dateISO}`;
}

export function deleteLogEntry(date: string, id: string) {
  const existing = loadLog(date);
  const next = existing.filter((entry) => entry.id !== id);
  localStorage.setItem(keyForDate(date), JSON.stringify(next));
  return next;
}

export function todayISO() {
  // YYYY-MM-DD
  return new Date().toISOString().slice(0, 10);
}

export function loadLog(dateISO = todayISO()): MacroLogEntry[] {
  try {
    const raw = localStorage.getItem(keyForDate(dateISO));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLog(entries: MacroLogEntry[], dateISO = todayISO()) {
  localStorage.setItem(keyForDate(dateISO), JSON.stringify(entries));
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

export function addLogEntry(
  name: string,
  macros: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }
) {
  const date = todayISO();
  const existing = loadLog(date);

  const entry = {
    id: crypto.randomUUID(),
    name,
    macros,
    createdAt: new Date().toISOString(),
  };

  const next = [entry, ...existing];
  localStorage.setItem(keyForDate(date), JSON.stringify(next));

  return entry;
}