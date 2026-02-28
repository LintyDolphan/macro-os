export type GroceryCategory =
  | "produce"
  | "dairy"
  | "meat"
  | "pantry"
  | "frozen"
  | "snacks"
  | "other";

export type GroceryItem = {
  id: string;
  name: string;
  qty?: string; // keep it flexible: "2", "500g", "1 box"
  category: GroceryCategory;
  bought: boolean;
  createdAt: string;
  boughtAt?: string;
};

const KEY = "groceryList";

export function loadGroceryList(): GroceryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGroceryList(items: GroceryItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function addGroceryItem(
  items: GroceryItem[],
  item: Omit<GroceryItem, "id" | "createdAt" | "bought" | "boughtAt">
) {
  const newItem: GroceryItem = {
    id: crypto.randomUUID(),
    name: item.name.trim(),
    qty: item.qty?.trim() || undefined,
    category: item.category,
    bought: false,
    createdAt: new Date().toISOString(),
  };

  const next = [newItem, ...items];
  saveGroceryList(next);
  return next;
}

export function toggleBought(items: GroceryItem[], id: string) {
  const next = items.map((it) => {
    if (it.id !== id) return it;

    const nowBought = !it.bought;
    return {
      ...it,
      bought: nowBought,
      boughtAt: nowBought ? new Date().toISOString() : undefined,
    };
  });

  saveGroceryList(next);
  return next;
}

export function deleteItem(items: GroceryItem[], id: string) {
  const next = items.filter((it) => it.id !== id);
  saveGroceryList(next);
  return next;
}

export function clearAll() {
  localStorage.removeItem(KEY);
}
export function clearBought(items: GroceryItem[]) {
  const next = items.filter((it) => !it.bought);
  saveGroceryList(next);
  return next;
}

export function exportShareCode(items: GroceryItem[]) {
  // include a version so you can evolve this later
  const payload = { v: 1, items };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

export function importShareCode(code: string): GroceryItem[] {
  const json = decodeURIComponent(escape(atob(code.trim())));
  const payload = JSON.parse(json);

  // supports either {v, items} or a raw array fallback
  if (Array.isArray(payload)) return payload as GroceryItem[];
  if (payload?.items && Array.isArray(payload.items)) return payload.items as GroceryItem[];

  throw new Error("Invalid share code");
}

export function mergeGroceryLists(
  current: GroceryItem[],
  incoming: GroceryItem[]
): GroceryItem[] {
  // Merge by name+category (simple + effective). Keeps "bought" if either is bought.
  const key = (i: GroceryItem) =>
    `${i.category}::${i.name}`.toLowerCase().trim();

  const map = new Map<string, GroceryItem>();

  for (const it of current) map.set(key(it), it);

  for (const inc of incoming) {
    const k = key(inc);
    const existing = map.get(k);

    if (!existing) {
      // ensure id exists (in case older payloads)
      map.set(k, {
        ...inc,
        id: inc.id ?? crypto.randomUUID(),
      });
      continue;
    }

    map.set(k, {
      ...existing,
      // keep bought if either list has it bought
      bought: existing.bought || inc.bought,
      boughtAt: existing.boughtAt ?? inc.boughtAt,
      // keep qty if you ever add it later (safe)
      qty: (existing as any).qty ?? (inc as any).qty,
      notes: (existing as any).notes ?? (inc as any).notes,
    } as GroceryItem);
  }

  const next = Array.from(map.values());
  saveGroceryList(next);
  return next;
}