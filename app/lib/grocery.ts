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

