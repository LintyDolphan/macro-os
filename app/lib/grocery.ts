import {
  clearAllGroceryItems,
  clearBoughtGroceryItems,
  createGroceryItem,
  deleteGroceryItem,
  getGroceryItems,
  updateGroceryItemBought,
} from "./grocery-db";

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
  qty?: string;
  category: GroceryCategory;
  bought: boolean;
  createdAt: string;
  boughtAt?: string;
};

function mapRowToGroceryItem(row: {
  id: string;
  name: string;
  qty: string | null;
  category: GroceryCategory;
  bought: boolean;
  created_at: string;
  bought_at: string | null;
}): GroceryItem {
  return {
    id: row.id,
    name: row.name,
    qty: row.qty ?? undefined,
    category: row.category,
    bought: row.bought,
    createdAt: row.created_at,
    boughtAt: row.bought_at ?? undefined,
  };
}

export async function loadGroceryList(): Promise<GroceryItem[]> {
  const rows = await getGroceryItems();
  return rows.map(mapRowToGroceryItem);
}

export async function saveGroceryList(items: GroceryItem[]) {
  await clearAllGroceryItems();

  for (const item of items) {
    await createGroceryItem({
      name: item.name,
      qty: item.qty ?? null,
      category: item.category,
    });

    if (item.bought) {
      const fresh = await loadGroceryList();
      const inserted = fresh.find(
        (it) =>
          it.name === item.name &&
          it.category === item.category &&
          (it.qty ?? "") === (item.qty ?? "")
      );

      if (inserted) {
        await updateGroceryItemBought(inserted.id, true);
      }
    }
  }

  return await loadGroceryList();
}

export async function addGroceryItem(
  items: GroceryItem[],
  item: Omit<GroceryItem, "id" | "createdAt" | "bought" | "boughtAt">
) {
  await createGroceryItem({
    name: item.name,
    qty: item.qty ?? null,
    category: item.category,
  });

  return await loadGroceryList();
}

export async function toggleBought(items: GroceryItem[], id: string) {
  const current = items.find((it) => it.id === id);
  if (!current) return items;

  await updateGroceryItemBought(id, !current.bought);
  return await loadGroceryList();
}

export async function deleteItem(items: GroceryItem[], id: string) {
  await deleteGroceryItem(id);
  return await loadGroceryList();
}

export async function clearAll() {
  await clearAllGroceryItems();
}

export async function clearBought(items: GroceryItem[]) {
  await clearBoughtGroceryItems();
  return await loadGroceryList();
}

export function exportShareCode(items: GroceryItem[]) {
  const payload = { v: 1, items };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

export function importShareCode(code: string): GroceryItem[] {
  const json = decodeURIComponent(escape(atob(code.trim())));
  const payload = JSON.parse(json);

  if (Array.isArray(payload)) return payload as GroceryItem[];
  if (payload?.items && Array.isArray(payload.items)) return payload.items as GroceryItem[];

  throw new Error("Invalid share code");
}

export function mergeGroceryLists(
  current: GroceryItem[],
  incoming: GroceryItem[]
): GroceryItem[] {
  const key = (i: GroceryItem) =>
    `${i.category}::${i.name}`.toLowerCase().trim();

  const map = new Map<string, GroceryItem>();

  for (const it of current) map.set(key(it), it);

  for (const inc of incoming) {
    const k = key(inc);
    const existing = map.get(k);

    if (!existing) {
      map.set(k, {
        ...inc,
        id: inc.id ?? crypto.randomUUID(),
      });
      continue;
    }

    map.set(k, {
      ...existing,
      bought: existing.bought || inc.bought,
      boughtAt: existing.boughtAt ?? inc.boughtAt,
      qty: existing.qty ?? inc.qty,
    });
  }

  return Array.from(map.values());
}