"use client";

import AppShell from "../components/AppShell";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  GroceryCategory,
  GroceryItem,
  GroceryMode,
  addGroceryItem,
  clearAll,
  clearBought,
  deleteItem,
  loadGroceryList,
  toggleBought,
} from "../lib/grocery";
import { getMyHousehold, type HouseholdRow } from "../lib/households-db";

const CATEGORY_LABELS: Record<GroceryCategory, string> = {
  produce: "Produce",
  dairy: "Dairy",
  meat: "Meat",
  pantry: "Pantry",
  frozen: "Frozen",
  snacks: "Snacks",
  other: "Other",
};

type FoodSuggestion = {
  sourceName: string;
  sourceId: string;
  name: string;
  brandName?: string | null;
  foodCategory?: string | null;
  caloriesPer100g?: number | null;
  proteinPer100g?: number | null;
  carbsPer100g?: number | null;
  fatPer100g?: number | null;
  matchCount?: number;
};

const CATEGORY_STYLES: Record<
  GroceryCategory,
  { badge: string; dot: string; heading: string; section: string }
> = {
  produce: {
    badge: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
    dot: "bg-emerald-400",
    heading: "text-emerald-200",
    section: "border-emerald-400/15 bg-emerald-500/[0.04]",
  },
  dairy: {
    badge: "border-sky-400/20 bg-sky-500/10 text-sky-200",
    dot: "bg-sky-400",
    heading: "text-sky-200",
    section: "border-sky-400/15 bg-sky-500/[0.04]",
  },
  meat: {
    badge: "border-rose-400/20 bg-rose-500/10 text-rose-200",
    dot: "bg-rose-400",
    heading: "text-rose-200",
    section: "border-rose-400/15 bg-rose-500/[0.04]",
  },
  pantry: {
    badge: "border-amber-400/20 bg-amber-500/10 text-amber-200",
    dot: "bg-amber-400",
    heading: "text-amber-200",
    section: "border-amber-400/15 bg-amber-500/[0.04]",
  },
  frozen: {
    badge: "border-cyan-400/20 bg-cyan-500/10 text-cyan-200",
    dot: "bg-cyan-400",
    heading: "text-cyan-200",
    section: "border-cyan-400/15 bg-cyan-500/[0.04]",
  },
  snacks: {
    badge: "border-violet-400/20 bg-violet-500/10 text-violet-200",
    dot: "bg-violet-400",
    heading: "text-violet-200",
    section: "border-violet-400/15 bg-violet-500/[0.04]",
  },
  other: {
    badge: "border-gray-500/30 bg-gray-700/50 text-gray-300",
    dot: "bg-gray-400",
    heading: "text-gray-300",
    section: "border-gray-600/30 bg-gray-700/[0.08]",
  },
};

function byName(a: GroceryItem, b: GroceryItem) {
  return a.name.localeCompare(b.name);
}

function inferGroceryCategory(suggestion: FoodSuggestion): GroceryCategory {
  const text = `${suggestion.foodCategory ?? ""} ${suggestion.name}`.toLowerCase();

  if (/\b(frozen|ice cream|frozen meals?)\b/.test(text)) return "frozen";
  if (/\b(dairy|milk|cheese|yogurt|cream|egg|butter)\b/.test(text)) return "dairy";
  if (/\b(poultry|chicken|turkey|beef|pork|lamb|veal|meat|fish|seafood|salmon|tuna)\b/.test(text)) {
    return "meat";
  }
  if (/\b(vegetable|fruit|produce|lettuce|spinach|apple|banana|berry|tomato|potato)\b/.test(text)) {
    return "produce";
  }
  if (/\b(snack|candy|sweets|chips|cookie|cracker|popcorn)\b/.test(text)) return "snacks";
  if (/\b(cereal|grain|pasta|rice|bread|bakery|spice|sauce|soup|bean|nut|oil)\b/.test(text)) {
    return "pantry";
  }

  return "other";
}

function formatFoodName(name: string) {
  return name
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\bUsda\b/g, "USDA");
}

function formatMacroPreview(suggestion: FoodSuggestion) {
  const calories = Math.round(Number(suggestion.caloriesPer100g ?? 0));
  const protein = Math.round(Number(suggestion.proteinPer100g ?? 0));

  if (calories <= 0 && protein <= 0) return null;
  return `${calories} cal${protein > 0 ? `, ${protein}g protein` : ""} / 100g`;
}

function foodGroupKey(suggestion: FoodSuggestion) {
  return formatFoodName(suggestion.name)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function averageSuggestionValue(suggestions: FoodSuggestion[], field: keyof FoodSuggestion) {
  const values = suggestions
    .map((suggestion) => Number(suggestion[field]))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function summarizeFoodSuggestions(suggestions: FoodSuggestion[]) {
  const groups = new Map<string, FoodSuggestion[]>();

  for (const suggestion of suggestions) {
    const key = foodGroupKey(suggestion);
    const group = groups.get(key) ?? [];
    group.push(suggestion);
    groups.set(key, group);
  }

  return Array.from(groups.entries()).map(([key, group]) => {
    const first = group[0];

    return {
      ...first,
      sourceId: `average-${key}`,
      name: formatFoodName(first.name),
      brandName: null,
      foodCategory: first.foodCategory ?? group.find((suggestion) => suggestion.foodCategory)?.foodCategory,
      caloriesPer100g: averageSuggestionValue(group, "caloriesPer100g"),
      proteinPer100g: averageSuggestionValue(group, "proteinPer100g"),
      carbsPer100g: averageSuggestionValue(group, "carbsPer100g"),
      fatPer100g: averageSuggestionValue(group, "fatPer100g"),
      matchCount: group.length,
    } satisfies FoodSuggestion;
  });
}

function GroceryRow({
  item,
  onToggle,
  onDelete,
}: {
  item: GroceryItem;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const categoryStyle = CATEGORY_STYLES[item.category];

  return (
    <li
      className={`flex items-center gap-3 rounded-2xl border px-3 py-3 transition ${
        item.bought
          ? "border-gray-700/70 bg-gray-900/55"
          : "border-gray-700 bg-gray-900 hover:border-gray-600"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={item.bought ? `Mark ${item.name} as not purchased` : `Mark ${item.name} as purchased`}
        aria-pressed={item.bought}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-lg font-bold transition ${
          item.bought
            ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
            : "border-gray-600 bg-gray-800 text-transparent hover:border-emerald-400/40 hover:bg-emerald-500/10"
        }`}
      >
        ✓
      </button>

      <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
        <div
          className={`truncate text-sm font-semibold ${
            item.bought ? "text-gray-400 line-through" : "text-white"
          }`}
        >
          {item.name}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${categoryStyle.badge}`}
          >
            {CATEGORY_LABELS[item.category]}
          </span>
          {item.qty ? (
            <span className="text-xs font-medium text-gray-400">{item.qty}</span>
          ) : null}
        </div>
      </button>

      <details className="relative shrink-0">
        <summary
          aria-label={`Actions for ${item.name}`}
          className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl text-lg font-bold text-gray-400 transition hover:bg-gray-800 hover:text-white [&::-webkit-details-marker]:hidden"
        >
          ···
        </summary>
        <div className="absolute right-0 top-11 z-10 min-w-32 rounded-2xl border border-gray-700 bg-gray-950 p-1.5 shadow-xl">
          <button
            type="button"
            onClick={onDelete}
            className="w-full rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-300 transition hover:bg-red-500/10"
          >
            Delete item
          </button>
        </div>
      </details>
    </li>
  );
}

export default function GroceryPage() {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [category, setCategory] = useState<GroceryCategory>("produce");
  const [mode, setMode] = useState<GroceryMode>("personal");
  const [household, setHousehold] = useState<HouseholdRow | null>(null);
  const [modeError, setModeError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [purchasedOpen, setPurchasedOpen] = useState(false);
  const [recentPurchase, setRecentPurchase] = useState<GroceryItem | null>(null);
  const [listOptionsOpen, setListOptionsOpen] = useState(false);
  const [foodSuggestions, setFoodSuggestions] = useState<FoodSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsUnavailable, setSuggestionsUnavailable] = useState(false);
  const purchaseUndoTimerRef = useRef<number | null>(null);
  const suggestionBlurTimerRef = useRef<number | null>(null);
  const selectedSuggestionNameRef = useRef("");

  useEffect(() => {
    async function init() {
      try {
        const currentHousehold = await getMyHousehold();
        setHousehold(currentHousehold);

        const data = await loadGroceryList("personal");
        setItems(data);
        setMode("personal");
        setModeError(null);
      } catch (error) {
        console.error("Failed to load grocery list:", error);
        setModeError("Failed to load grocery list.");
      }
    }

    void init();

    return () => {
      if (purchaseUndoTimerRef.current !== null) {
        window.clearTimeout(purchaseUndoTimerRef.current);
      }
      if (suggestionBlurTimerRef.current !== null) {
        window.clearTimeout(suggestionBlurTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const query = name.trim();

    if (query.length < 3) {
      setFoodSuggestions([]);
      setSuggestionsLoading(false);
      setSuggestionsUnavailable(false);
      return;
    }

    if (query === selectedSuggestionNameRef.current) {
      setFoodSuggestions([]);
      setSuggestionsLoading(false);
      setSuggestionsUnavailable(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSuggestionsLoading(true);

      try {
        const response = await fetch(
          `/api/catalog/foods/search?q=${encodeURIComponent(query)}&limit=8`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          setFoodSuggestions([]);
          setSuggestionsOpen(false);
          setSuggestionsUnavailable(true);
          return;
        }

        const payload = (await response.json()) as { foods?: FoodSuggestion[] };
        setFoodSuggestions(payload.foods ?? []);
        setSuggestionsOpen(true);
        setSuggestionsUnavailable(false);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof Error && error.name !== "AbortError") {
          console.warn("Food suggestions unavailable:", error.message);
        }
        setFoodSuggestions([]);
        setSuggestionsOpen(false);
        setSuggestionsUnavailable(true);
      } finally {
        if (!controller.signal.aborted) setSuggestionsLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [name]);

  const { unbought, bought } = useMemo(() => {
    const unb = items.filter((item) => !item.bought);
    const b = items.filter((item) => item.bought);
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

    for (const item of unbought) groups[item.category].push(item);
    return groups;
  }, [unbought]);

  const groupedBought = useMemo(() => {
    const groups: Record<GroceryCategory, GroceryItem[]> = {
      produce: [],
      dairy: [],
      meat: [],
      pantry: [],
      frozen: [],
      snacks: [],
      other: [],
    };

    for (const item of bought) groups[item.category].push(item);
    return groups;
  }, [bought]);

  const boughtPercent =
    items.length > 0 ? Math.round((bought.length / items.length) * 100) : 0;
  const summarizedFoodSuggestions = useMemo(
    () => summarizeFoodSuggestions(foodSuggestions),
    [foodSuggestions]
  );

  async function loadForMode(nextMode: GroceryMode) {
    try {
      clearPurchaseUndo();
      const data = await loadGroceryList(nextMode);
      setItems(data);
      setMode(nextMode);
      setPurchasedOpen(false);
      setListOptionsOpen(false);
      setModeError(null);
    } catch (error) {
      console.error(`Failed to load ${nextMode} grocery list:`, error);
      setModeError(
        nextMode === "household"
          ? "Failed to load household grocery list."
          : "Failed to load personal grocery list."
      );
    }
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setActionError(null);

    try {
      const next = await addGroceryItem(
        items,
        {
          name,
          qty,
          category,
        },
        mode
      );

      setItems(next);
      setName("");
      setQty("");
      setFoodSuggestions([]);
      setSuggestionsOpen(false);
      setSuggestionsUnavailable(false);
    } catch (error) {
      console.error("Failed to add grocery item:", error);
      setActionError(
        error instanceof Error ? error.message : "Failed to add grocery item."
      );
    }
  }

  function selectFoodSuggestion(suggestion: FoodSuggestion) {
    const nextName = formatFoodName(suggestion.name);
    selectedSuggestionNameRef.current = nextName;
    setName(nextName);
    setCategory(inferGroceryCategory(suggestion));
    setFoodSuggestions([]);
    setSuggestionsOpen(false);
    setSuggestionsUnavailable(false);
  }

  function closeSuggestionsSoon() {
    if (suggestionBlurTimerRef.current !== null) {
      window.clearTimeout(suggestionBlurTimerRef.current);
    }
    suggestionBlurTimerRef.current = window.setTimeout(() => {
      setSuggestionsOpen(false);
      suggestionBlurTimerRef.current = null;
    }, 120);
  }

  function clearPurchaseUndo() {
    if (purchaseUndoTimerRef.current !== null) {
      window.clearTimeout(purchaseUndoTimerRef.current);
      purchaseUndoTimerRef.current = null;
    }
    setRecentPurchase(null);
  }

  async function onToggle(id: string) {
    const current = items.find((item) => item.id === id);
    if (!current) return;

    const next = await toggleBought(items, id, mode);
    setItems(next);

    if (!current.bought) {
      if (purchaseUndoTimerRef.current !== null) {
        window.clearTimeout(purchaseUndoTimerRef.current);
      }
      setRecentPurchase(current);
      purchaseUndoTimerRef.current = window.setTimeout(() => {
        setRecentPurchase(null);
        purchaseUndoTimerRef.current = null;
      }, 3000);
    } else if (recentPurchase?.id === id) {
      clearPurchaseUndo();
    }
  }

  async function undoRecentPurchase() {
    const item = recentPurchase;
    if (!item) return;

    clearPurchaseUndo();
    const next = await toggleBought(items, item.id, mode);
    setItems(next);
  }

  async function onDelete(id: string) {
    const next = await deleteItem(items, id, mode);
    setItems(next);
  }

  async function onClearAll() {
    if (!window.confirm(`Clear every item from your ${mode} grocery list?`)) return;

    clearPurchaseUndo();
    await clearAll(mode);
    setItems([]);
  }

  async function onClearBought() {
    if (!window.confirm(`Clear ${bought.length} purchased item${bought.length === 1 ? "" : "s"}?`)) {
      return;
    }

    clearPurchaseUndo();
    const next = await clearBought(items, mode);
    setItems(next);
    setPurchasedOpen(false);
  }

  return (
    <AppShell title="Grocery" subtitle="Shopping list and budget planning">
      <div className="mx-auto max-w-md">
        <section className="mb-4 rounded-3xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
          {actionError ? (
            <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {actionError}
            </div>
          ) : null}

          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
                Shopping Progress
              </div>
              <h2 className="mt-2 text-xl font-bold text-white">
                {unbought.length === 0 && items.length > 0
                  ? "List complete"
                  : `${unbought.length} item${unbought.length === 1 ? "" : "s"} remaining`}
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                {items.length === 0
                  ? "Your list is ready for its first item."
                  : `${bought.length} of ${items.length} purchased`}
              </p>
            </div>
            <div className="rounded-2xl bg-gray-900 px-3 py-2 text-center">
              <div className="text-lg font-bold text-white">{boughtPercent}%</div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Done</div>
            </div>
          </div>

          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-gray-900">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all duration-300"
              style={{ width: `${boughtPercent}%` }}
            />
          </div>

          <div className={`mt-4 grid gap-2 ${household ? "grid-cols-2" : "grid-cols-1"}`}>
            <button
              type="button"
              onClick={() => void loadForMode("personal")}
              className={`rounded-2xl border px-3 py-2.5 text-sm font-semibold transition ${
                mode === "personal"
                  ? "border-blue-400/40 bg-blue-600 text-white"
                  : "border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-700"
              }`}
            >
              Personal
            </button>

            {household ? (
              <button
                type="button"
                onClick={() => void loadForMode("household")}
                className={`rounded-2xl border px-3 py-2.5 text-sm font-semibold transition ${
                  mode === "household"
                    ? "border-blue-400/40 bg-blue-600 text-white"
                    : "border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-700"
                }`}
              >
                Household
              </button>
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-gray-900 px-3 py-2.5">
            <div>
              <div className="text-xs font-semibold text-white">
                {mode === "personal" ? "Personal list" : "Shared household list"}
              </div>
              <div className="mt-0.5 text-[11px] text-gray-500">
                Budget tracking will appear here later.
              </div>
            </div>
            <span className="rounded-full bg-gray-800 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Budget soon
            </span>
          </div>

          {modeError ? (
            <div className="mt-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {modeError}
            </div>
          ) : null}
        </section>

        <form
          onSubmit={onAdd}
          className="rounded-3xl border border-gray-700 bg-gray-800 p-4 shadow-sm"
        >
          <div>
            <h2 className="text-sm font-semibold text-white">Quick Add</h2>
            <p className="mt-1 text-xs text-gray-400">
              Select a category, then add several items without switching it again.
            </p>
          </div>

          <div className="relative mt-4 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <input
                value={name}
                onChange={(e) => {
                  selectedSuggestionNameRef.current = "";
                  setName(e.target.value);
                  setSuggestionsOpen(true);
                }}
                onFocus={() => {
                  if (summarizedFoodSuggestions.length > 0) setSuggestionsOpen(true);
                }}
                onBlur={closeSuggestionsSoon}
                placeholder="Add grocery item..."
                aria-label="Grocery item name"
                autoComplete="off"
                className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />

              {suggestionsOpen && (summarizedFoodSuggestions.length > 0 || suggestionsLoading) ? (
                <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 overflow-hidden rounded-3xl border border-gray-700 bg-gray-950 shadow-2xl">
                  <div className="border-b border-gray-800 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    {suggestionsLoading ? "Searching USDA foods..." : "Average Food Suggestions"}
                  </div>
                  {summarizedFoodSuggestions.length > 0 ? (
                    <div className="max-h-72 overflow-y-auto p-2">
                      {summarizedFoodSuggestions.map((suggestion) => {
                        const suggestionCategory = inferGroceryCategory(suggestion);
                        const categoryStyle = CATEGORY_STYLES[suggestionCategory];
                        const macroPreview = formatMacroPreview(suggestion);

                        return (
                          <button
                            key={`${suggestion.sourceName}-${suggestion.sourceId}`}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectFoodSuggestion(suggestion)}
                            className="w-full rounded-2xl px-3 py-2.5 text-left transition hover:bg-gray-800"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="line-clamp-2 text-sm font-semibold text-white">
                                  {formatFoodName(suggestion.name)}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                                  <span>
                                    {suggestion.matchCount && suggestion.matchCount > 1
                                      ? `Average of ${suggestion.matchCount} USDA matches`
                                      : "USDA estimate"}
                                  </span>
                                  {macroPreview ? <span>{macroPreview}</span> : null}
                                </div>
                              </div>
                              <span
                                className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${categoryStyle.badge}`}
                              >
                                {CATEGORY_LABELS[suggestionCategory]}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-4 py-3 text-xs text-gray-400">Looking for matches...</div>
                  )}
                </div>
              ) : null}
            </div>
            <button
              type="submit"
              disabled={!name.trim()}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
            </button>
          </div>
          {suggestionsUnavailable ? (
            <div className="mt-2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
              Food suggestions are unavailable right now. You can still add this item manually.
            </div>
          ) : null}

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
              const categoryKey = key as GroceryCategory;
              const selected = category === categoryKey;

              return (
                <button
                  key={categoryKey}
                  type="button"
                  onClick={() => setCategory(categoryKey)}
                  aria-pressed={selected}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                    selected
                      ? "border-blue-400/40 bg-blue-600 text-white shadow-[0_8px_20px_rgba(37,99,235,0.22)]"
                      : "border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-600 hover:bg-gray-700"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="mt-3">
            <label className="sr-only" htmlFor="grocery-quick-quantity">
              Optional quantity
            </label>
            <input
              id="grocery-quick-quantity"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Optional quantity, e.g. 2 or 500g"
              className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white outline-none placeholder:text-gray-500 focus:border-blue-500"
            />
            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-gray-500">
              <span>
                Adding to <span className="font-semibold text-blue-200">{CATEGORY_LABELS[category]}</span>
              </span>
              {qty.trim() ? (
                <button
                  type="button"
                  onClick={() => setQty("")}
                  className="font-semibold text-gray-400 hover:text-white"
                >
                  Clear quantity
                </button>
              ) : null}
            </div>
          </div>
        </form>

        <div className="relative mt-4 h-[58px] overflow-hidden rounded-2xl">
          <div
            className="absolute inset-y-0 left-[calc(25%+0.5rem)] right-0"
            aria-hidden={!listOptionsOpen}
          >
            <button
              type="button"
              onClick={() => void onClearBought()}
              disabled={bought.length === 0}
              tabIndex={listOptionsOpen ? 0 : -1}
              className={`absolute inset-y-0 left-0 z-20 w-[calc(50%-0.25rem)] min-w-0 rounded-2xl border border-gray-700 bg-gray-900 px-2 py-2.5 text-center text-[11px] font-semibold text-gray-200 shadow-lg transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-35 ${
                listOptionsOpen
                  ? "translate-x-0 delay-0"
                  : "pointer-events-none -translate-x-[calc(100%+0.5rem)] delay-100"
              }`}
            >
              <span className="block truncate">Clear Purchased</span>
              <span className="mt-0.5 block text-[9px] font-normal text-gray-500">
                {bought.length} item{bought.length === 1 ? "" : "s"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void onClearAll()}
              disabled={items.length === 0}
              tabIndex={listOptionsOpen ? 0 : -1}
              className={`absolute inset-y-0 right-0 z-10 w-[calc(50%-0.25rem)] min-w-0 rounded-2xl border border-red-500/20 bg-red-950 px-2 py-2.5 text-center text-[11px] font-semibold text-red-300 shadow-lg transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-35 ${
                listOptionsOpen
                  ? "translate-x-0 delay-100"
                  : "pointer-events-none -translate-x-[calc(200%+1rem)] delay-0"
              }`}
            >
              <span className="block truncate">Clear List</span>
              <span className="mt-0.5 block text-[9px] font-normal text-red-300/60">
                {items.length} item{items.length === 1 ? "" : "s"}
              </span>
            </button>
          </div>

          <div className="absolute inset-y-0 left-0 z-30 w-[25%] min-w-[96px] overflow-hidden rounded-2xl bg-gray-900">
            <button
              type="button"
              onClick={() => setListOptionsOpen((open) => !open)}
              aria-expanded={listOptionsOpen}
              className={`h-full w-full rounded-2xl border px-3 py-2.5 text-left text-xs font-semibold transition ${
                listOptionsOpen
                  ? "border-blue-400/40 bg-blue-500/15 text-blue-200"
                  : "border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-700 hover:text-white"
              }`}
            >
              <span className="block">List Options</span>
              <span className="mt-0.5 block text-[10px] font-normal text-gray-500">
                {mode === "personal" ? "Personal" : "Household"}
              </span>
            </button>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          {Object.entries(groupedUnbought).map(([cat, list]) => {
            if (list.length === 0) return null;
            const label = CATEGORY_LABELS[cat as GroceryCategory];

            return (
              <section
                key={cat}
                className={`rounded-3xl border p-3 ${CATEGORY_STYLES[cat as GroceryCategory].section}`}
              >
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                  <h2
                    className={`flex items-center gap-2 text-sm font-semibold ${CATEGORY_STYLES[cat as GroceryCategory].heading}`}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${CATEGORY_STYLES[cat as GroceryCategory].dot}`}
                      aria-hidden="true"
                    />
                    {label}
                  </h2>
                  <span className="rounded-full bg-gray-950/40 px-2.5 py-1 text-[10px] font-semibold text-gray-400">
                    {list.length}
                  </span>
                </div>
                <ul className="space-y-2">
                  {[...list].sort(byName).map((item) => (
                    <GroceryRow
                      key={item.id}
                      item={item}
                      onToggle={() => void onToggle(item.id)}
                      onDelete={() => void onDelete(item.id)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}

          {bought.length > 0 ? (
            <section className="overflow-hidden rounded-3xl border border-gray-700 bg-gray-800">
              <button
                type="button"
                onClick={() => setPurchasedOpen((open) => !open)}
                aria-expanded={purchasedOpen}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-gray-700/50"
              >
                <div>
                  <div className="text-sm font-semibold text-white">
                    Purchased · {bought.length}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {purchasedOpen
                      ? "Hide completed shopping items."
                      : "Completed items are tucked away."}
                  </div>
                </div>
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gray-900 text-sm font-semibold text-gray-300 transition ${
                    purchasedOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                >
                  ↓
                </span>
              </button>

              {purchasedOpen ? (
                <div className="border-t border-gray-700 px-3 pb-3 pt-3">
                  <div className="space-y-4">
                    {Object.entries(groupedBought).map(([cat, list]) => {
                      if (list.length === 0) return null;
                      const label = CATEGORY_LABELS[cat as GroceryCategory];

                      return (
                        <div
                          key={cat}
                          className={`rounded-2xl border p-2 ${CATEGORY_STYLES[cat as GroceryCategory].section}`}
                        >
                          <div
                            className={`mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${CATEGORY_STYLES[cat as GroceryCategory].heading}`}
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${CATEGORY_STYLES[cat as GroceryCategory].dot}`}
                              aria-hidden="true"
                            />
                            {label} · {list.length}
                          </div>
                          <ul className="space-y-2">
                            {[...list].sort(byName).map((item) => (
                              <GroceryRow
                                key={item.id}
                                item={item}
                                onToggle={() => void onToggle(item.id)}
                                onDelete={() => void onDelete(item.id)}
                              />
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {items.length === 0 ? (
            <p className="mt-6 text-center text-sm text-gray-400">
              Add your first grocery item above.
            </p>
          ) : null}
        </div>
      </div>

      {recentPurchase ? (
        <div className="fixed inset-x-4 bottom-36 z-[60] mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-emerald-300/25 bg-slate-950/95 px-4 py-3 shadow-[0_18px_55px_rgba(2,6,23,0.6)] backdrop-blur">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">
              Purchased {recentPurchase.name}
            </div>
            <div className="mt-0.5 text-xs text-gray-400">Moved into Purchased.</div>
          </div>
          <button
            type="button"
            onClick={() => void undoRecentPurchase()}
            className="shrink-0 rounded-xl bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
          >
            Undo
          </button>
        </div>
      ) : null}
    </AppShell>
  );
}
