"use client";

import { useEffect, useMemo, useState } from "react";
import {
  GroceryCategory,
  GroceryItem,
  addGroceryItem,
  clearAll,
  deleteItem,
  loadGroceryList,
  toggleBought,
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

export default function GroceryPage() {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [category, setCategory] = useState<GroceryCategory>("produce");

  useEffect(() => {
    setItems(loadGroceryList());
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

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setItems((prev) =>
      addGroceryItem(prev, {
        name,
        qty,
        category,
      })
    );

    setName("");
    setQty("");
  }

  function onToggle(id: string) {
    setItems((prev) => toggleBought(prev, id));
  }

  function onDelete(id: string) {
    setItems((prev) => deleteItem(prev, id));
  }

  function onClearAll() {
    clearAll();
    setItems([]);
  }

  return (
    <main className="min-h-screen p-6 bg-gray-900 text-white">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Grocery List</h1>
          <Link href="/" className="text-sm text-gray-300 hover:text-white">
            ← Back
          </Link>
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

        <div className="mt-6 space-y-5">
          {Object.entries(groupedUnbought).map(([cat, list]) => {
            if (list.length === 0) return null;
            const label = CATEGORY_LABELS[cat as GroceryCategory];

            return (
              <section key={cat}>
                <h2 className="text-lg font-semibold mb-2">{label}</h2>
                <ul className="space-y-2">
                  {list.map((it) => (
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
                {bought.map((it) => (
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
    </main>
  );
}
