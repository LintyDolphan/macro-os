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

const HISTORY_KEY = "macroHistory";
const CURRENT_KEY = "macros";
const MAX_ENTRIES = 10;

export function loadHistory(): MacroEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHistory(entries: MacroEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
}

export function addToHistory(entry: MacroEntry) {
  const prev = loadHistory();
  const next = [entry, ...prev].slice(0, MAX_ENTRIES);
  saveHistory(next);

  // Keep "current macros" synced to latest entry as well:
  localStorage.setItem(CURRENT_KEY, JSON.stringify(entry));

  return next;
}

export function setCurrent(entry: MacroEntry) {
  localStorage.setItem(CURRENT_KEY, JSON.stringify(entry));
}

export function loadCurrent(): MacroEntry | null {
  try {
    const raw = localStorage.getItem(CURRENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function deleteFromHistory(id: string) {
  const prev = loadHistory();
  const next = prev.filter((e) => e.id !== id);
  saveHistory(next);
  return next;
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(CURRENT_KEY);
}
