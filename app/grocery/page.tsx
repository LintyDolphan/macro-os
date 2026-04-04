"use client";

import AppShell from "../components/AppShell";
import { useEffect, useMemo, useState } from "react";
import {
  GroceryCategory,
  GroceryItem,
  addGroceryItem,
  clearAll,
  clearBought,
  deleteItem,
  loadGroceryList,
  toggleBought,
  exportShareCode,
  importShareCode,
  mergeGroceryLists,
} from "../lib/grocery";
import Link from "next/link";

const CATEGORY_LABELS: Record<GroceryCategory, string> = {
  produce: "Produce",
  dairy: "Dairy",
  meat: "Meat",
  pantry: "Pantry",
  frozen: "Frozen",
  snacks: "Snacks",
  other: "Other",
};
function byName(a: GroceryItem, b: GroceryItem) {
  return a.name.localeCompare(b.name);
}

export default function GroceryPage() {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [category, setCategory] = useState<GroceryCategory>("produce");
  const [shareCode, setShareCode] = useState("");
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [shareErr, setShareErr] = useState<string | null>(null);

  useEffect(() => {
  async function init() {
    try {
      const data = await loadGroceryList();
      setItems(data);
    } catch (error) {
      console.error("Failed to load grocery list:", error);
    }
  }

  init();
}, []);

  const { unbought, bought } = useMemo(() => {
    const unb = items.filter((i) => !i.bought);
    const b = items.filter((i) => i.bought);
    return { unbought: unb, bought: b };
  }, [items]);

  const groupedUnbought = useMemo(() => {
    const groups: Record<GroceryCategory, GroceryItem[]> = {
      produce: [],
      dairy: [],
      meat: [],
      pantry: [],
      frozen: [],
      snacks: [],
      other: [],
    };
    for (const it of unbought) groups[it.category].push(it);
    return groups;
  }, [unbought]);

async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const next = await addGroceryItem(items, {
  name,
  qty,
  category,
});
setItems(next);

    setName("");
    setQty("");
  }

async function onToggle(id: string) {
  const next = await toggleBought(items, id);
  setItems(next);
}

async function onDelete(id: string) {
  const next = await deleteItem(items, id);
  setItems(next);
}

async function onClearAll() {
  await clearAll();
  setItems([]);
}

async function onClearBought() {
  const next = await clearBought(items);
  setItems(next);
}

async function onCopyShare() {
  try {
    const code = exportShareCode(items);
    await navigator.clipboard.writeText(code);
    setShareMsg("Share code copied ✅");
    setShareErr(null);
    window.setTimeout(() => setShareMsg(null), 1500);
  } catch {
    setShareErr("Couldn’t copy. Try manually selecting the code.");
  }
}

async function onImportShare() {
  try {
    const incoming = importShareCode(shareCode);
    const merged = mergeGroceryLists(items, incoming);

    // Clear existing DB list
    await clearAll();

    // Reinsert merged list
    for (const item of merged) {
      await addGroceryItem([], {
        name: item.name,
        qty: item.qty,
        category: item.category,
      });
    }

    const fresh = await loadGroceryList();
    setItems(fresh);

    setShareMsg("Imported and merged ✅");
    setShareErr(null);
    setShareCode("");

    window.setTimeout(() => setShareMsg(null), 1500);
  } catch {
    setShareErr("Invalid share code.");
    setShareMsg(null);
  }
}

function byName(a: GroceryItem, b: GroceryItem) {
  return a.name.localeCompare(b.name);
}

  return (
    <AppShell title="Grocery" subtitle="Manage your shopping list">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Grocery List</h1>
        </div>
<div className="bg-gray-800 p-4 rounded-lg shadow-lg mb-4 border border-gray-700">
  <h2 className="text-lg font-semibold">Share List</h2>
  <p className="text-sm text-gray-300 mt-1">
    Copy a share code to send to someone else. Paste a code to merge their list into yours.
  </p>

  {shareMsg && (
    <div className="mt-3 rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
      {shareMsg}
    </div>
  )}
  {shareErr && (
    <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
      {shareErr}
    </div>
  )}

  <div className="mt-3 flex gap-2">
    <button
      type="button"
      onClick={onCopyShare}
      className="flex-1 bg-blue-600 hover:bg-blue-700 py-2 rounded font-semibold"
    >
      Copy Share Code
    </button>

    <button
      type="button"
      onClick={onImportShare}
      disabled={!shareCode.trim()}
      className="flex-1 bg-emerald-600 hover:bg-emerald-700 py-2 rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
    >
      Import & Merge
    </button>
  </div>

  <textarea
    value={shareCode}
    onChange={(e) => setShareCode(e.target.value)}
    placeholder="Paste share code here…"
    className="mt-2 w-full p-3 rounded bg-gray-900 border border-gray-700 text-sm"
    rows={3}
  />
</div>
        <form onSubmit={onAdd} className="bg-gray-800 p-4 rounded-lg shadow-lg space-y-3">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Item</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Greek yogurt"
              className="w-full p-3 rounded bg-gray-900 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Qty (optional)</label>
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="e.g., 2 / 500g"
                className="w-full p-3 rounded bg-gray-900 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as GroceryCategory)}
                className="w-full p-3 rounded bg-gray-900 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded font-semibold"
          >
            Add Item
          </button>
        </form>

        <div className="mt-4 flex gap-2">
          <div className="flex-1 bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-sm text-gray-400">To buy</div>
            <div className="text-xl font-bold">{unbought.length}</div>
          </div>
          <div className="flex-1 bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-sm text-gray-400">Bought</div>
            <div className="text-xl font-bold">{bought.length}</div>
          </div>
        </div>

        <button
          onClick={onClearAll}
          disabled={items.length === 0}
          className="mt-3 w-full bg-gray-900 hover:bg-gray-950 py-2 rounded font-semibold border border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Clear All
        </button>
        <button
          onClick={onClearBought}
          disabled={bought.length === 0}
          className="mt-3 w-full bg-gray-900 hover:bg-gray-950 py-2 rounded font-semibold border border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Clear Purchased
        </button>


        <div className="mt-6 space-y-5">
          {Object.entries(groupedUnbought).map(([cat, list]) => {
            if (list.length === 0) return null;
            const label = CATEGORY_LABELS[cat as GroceryCategory];

            return (
              <section key={cat}>
                <h2 className="text-lg font-semibold mb-2">{label}</h2>
                <ul className="space-y-2">
                  {[...list].sort(byName).map((it) => (

                    <li
                      key={it.id}
                      className="flex items-center justify-between rounded border border-gray-700 bg-gray-900 p-3"
                    >
                      <button onClick={() => onToggle(it.id)} className="text-left flex-1">
                        <div className="font-semibold">{it.name}</div>
                        {it.qty && <div className="text-sm text-gray-400">{it.qty}</div>}
                      </button>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => onToggle(it.id)}
                          className="text-sm text-gray-300 hover:text-white"
                          title="Mark bought"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => onDelete(it.id)}
                          className="text-sm text-gray-300 hover:text-white"
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {bought.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-2">Bought</h2>
              <ul className="space-y-2">
                {[...bought].sort(byName).map((it) => (

                  <li
                    key={it.id}
                    className="flex items-center justify-between rounded border border-gray-700 bg-gray-900/60 p-3"
                  >
                    <button onClick={() => onToggle(it.id)} className="text-left flex-1">
                      <div className="font-semibold line-through opacity-80">{it.name}</div>
                      {it.qty && <div className="text-sm text-gray-400">{it.qty}</div>}
                    </button>

                    <button
                      onClick={() => onDelete(it.id)}
                      className="ml-3 text-sm text-gray-300 hover:text-white"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {items.length === 0 && (
            <p className="text-sm text-gray-400 text-center mt-6">
              Add your first grocery item above.
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
