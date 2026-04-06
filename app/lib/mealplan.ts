import type { GroceryItem, GroceryMode } from "./grocery";
import { addGroceryItem } from "./grocery";
import type { Ingredient } from "./recipes";

type Aggregated = {
  name: string;
  category: Ingredient["category"];
  qty?: string;
};

function normalizeName(s: string) {
  return s.trim().toLowerCase();
}

// Scales quantities like:
// "500g" -> "1000g" (x2)
// "1.5 lb" -> "3 lb"
// "1–2 kg" -> "2–4 kg"
// If it can't parse a number, it falls back: "to taste" -> "to taste x2"
export function scaleQty(qty: string | undefined, factor: number) {
  if (!qty) return undefined;
  const raw = qty.trim();
  if (!raw) return undefined;

  const m = raw.match(
    /^\s*([0-9]*\.?[0-9]+)\s*([\-–]\s*([0-9]*\.?[0-9]+))?\s*(.*)$/
  );

  if (!m) return `${raw} x${factor}`;

  const n1 = Number(m[1]);
  const n2 = m[3] ? Number(m[3]) : null;
  const rest = (m[4] ?? "").trim();

  if (!Number.isFinite(n1)) return `${raw} x${factor}`;

  const scaled1 = n1 * factor;
  const scaled2 = n2 !== null && Number.isFinite(n2) ? n2 * factor : null;

  const fmt = (n: number) => {
    const rounded = Math.round(n * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  };

  if (scaled2 !== null) {
    const dash = raw.includes("–") ? "–" : "-";
    return `${fmt(scaled1)}${dash}${fmt(scaled2)}${rest ? " " + rest : ""}`.trim();
  }

  return `${fmt(scaled1)}${rest ? " " + rest : ""}`.trim();
}

function mergeQty(a?: string, b?: string) {
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;
  return `${a} + ${b}`;
}

export function aggregateIngredients(ingredients: Ingredient[]): Aggregated[] {
  const map = new Map<string, Aggregated>();

  for (const ing of ingredients) {
    const key = normalizeName(ing.name);
    const existing = map.get(key);

    if (existing) {
      map.set(key, {
        ...existing,
        qty: mergeQty(existing.qty, ing.qty?.trim()),
      });
    } else {
      map.set(key, {
        name: ing.name.trim(),
        category: ing.category,
        qty: ing.qty?.trim() || undefined,
      });
    }
  }

  return Array.from(map.values());
}

export async function addIngredientsToGrocery(
  currentList: GroceryItem[],
  ingredients: Ingredient[],
  mode: GroceryMode = "personal"
) {
  const aggregated = aggregateIngredients(ingredients);

  let next = currentList;
  for (const a of aggregated) {
    next = await addGroceryItem(
      next,
      {
        name: a.name,
        qty: a.qty,
        category: a.category,
      },
      mode
    );
  }

  return next;
}