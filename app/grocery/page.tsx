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
import {
  getLatestGroceryPriceMemories,
  normalizeGroceryPriceName,
  recordGroceryPriceMemory,
  type GroceryPriceMemoryRecord,
  type GroceryPriceUnit,
} from "../lib/supabase/grocery-budget-db";

const CATEGORY_LABELS: Record<GroceryCategory, string> = {
  produce: "Produce",
  dairy: "Dairy",
  meat: "Meat",
  pantry: "Pantry",
  frozen: "Frozen",
  snacks: "Snacks",
  other: "Other",
};

const CATEGORY_STYLES: Record<
  GroceryCategory,
  { badge: string; dot: string; heading: string; section: string }
> = {
  produce: {
    badge: "border-[#34d399]/25 bg-[#10b981]/10 text-[#a7f3d0]",
    dot: "bg-[#34d399]",
    heading: "text-[#a7f3d0]",
    section: "border-[#34d399]/20 bg-[#10b981]/[0.045]",
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

function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(value);
}

function formatPriceUnit(unit?: GroceryPriceUnit | null) {
  switch (unit) {
    case "lb":
      return "lb";
    case "kg":
      return "kg";
    default:
      return "1";
  }
}

function formatPriceMemory(price: number, currency: string, unit?: GroceryPriceUnit | null) {
  return `${formatCurrency(price, currency)} / ${formatPriceUnit(unit)}`;
}

function formatCentsInput(cents: number) {
  return formatCurrency(cents / 100);
}

function centsFromDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return 0;

  return Math.min(Number(digits), 9999999);
}

function firstQuantityNumber(value?: string) {
  if (!value) return null;

  const match = value.match(/(\d+(?:[.,]\d+)?)/);
  if (!match?.[1]) return null;

  const parsed = Number(match[1].replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function quantityMultiplier(qty: string | undefined, unit: GroceryPriceUnit) {
  const amount = firstQuantityNumber(qty);
  if (!amount) return 1;

  const normalizedQty = qty?.toLowerCase() ?? "";

  if (unit === "each") return amount;
  if (unit === "lb") {
    if (/\bkg\b|kilogram/.test(normalizedQty)) return amount * 2.20462;
    if (/\bg\b|gram/.test(normalizedQty)) return amount / 453.592;
    return amount;
  }
  if (unit === "kg") {
    if (/\blb\b|lbs\b|pound/.test(normalizedQty)) return amount / 2.20462;
    if (/\bg\b|gram/.test(normalizedQty)) return amount / 1000;
    return amount;
  }

  return 1;
}

function estimateItemCost(item: GroceryItem, memory?: GroceryPriceMemoryRecord | null) {
  const price = memory ? Number(memory.price) : NaN;
  if (!Number.isFinite(price)) return null;

  return price * quantityMultiplier(item.qty, memory?.price_unit ?? "each");
}

function formatDateLabel(value?: string | null) {
  if (!value) return "date unknown";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function moneyFromLine(line: string) {
  const matches = line.match(/(?:[$]\s*)?(\d{1,4}(?:[.,]\d{2}))(?!\d)/g);
  const last = matches?.at(-1);
  if (!last) return "";

  return last.replace("$", "").replace(",", ".").trim();
}

function wordTokens(value: string) {
  return normalizeGroceryPriceName(value)
    .split(" ")
    .filter((token) => token.length > 2);
}

function parseReceiptTextForItems(text: string, receiptItems: GroceryItem[]) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const nextPrices: Record<string, string> = {};

  for (const item of receiptItems) {
    const tokens = wordTokens(item.name);
    if (tokens.length === 0) continue;

    const matchingLine = lines.find((line) => {
      const normalizedLine = normalizeGroceryPriceName(line);
      const requiredMatches = Math.min(tokens.length, 2);
      const matchedTokens = tokens.filter((token) => normalizedLine.includes(token));

      return matchedTokens.length >= requiredMatches && Boolean(moneyFromLine(line));
    });

    if (matchingLine) {
      nextPrices[item.id] = moneyFromLine(matchingLine);
    }
  }

  return nextPrices;
}

async function readReceiptImageText(file: File) {
  const TextDetectorCtor = (globalThis as typeof globalThis & {
    TextDetector?: new () => {
      detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
    };
  }).TextDetector;

  if (!TextDetectorCtor) {
    throw new Error("Receipt image scanning is not supported in this browser yet.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const detector = new TextDetectorCtor();
    const blocks = await detector.detect(bitmap);

    return blocks
      .map((block) => block.rawValue?.trim() || "")
      .filter(Boolean)
      .join("\n");
  } finally {
    bitmap.close();
  }
}

async function readReceiptFrameText(video: HTMLVideoElement) {
  const TextDetectorCtor = (globalThis as typeof globalThis & {
    TextDetector?: new () => {
      detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
    };
  }).TextDetector;

  if (!TextDetectorCtor) {
    throw new Error("Receipt camera scanning is not supported in this browser yet.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1080;
  canvas.height = video.videoHeight || 1440;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Receipt camera frame could not be captured.");

  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const detector = new TextDetectorCtor();
  const blocks = await detector.detect(canvas);

  return blocks
    .map((block) => block.rawValue?.trim() || "")
    .filter(Boolean)
    .join("\n");
}

function GroceryRow({
  item,
  priceMemory,
  onToggle,
  onDelete,
}: {
  item: GroceryItem;
  priceMemory?: GroceryPriceMemoryRecord | null;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const categoryStyle = CATEGORY_STYLES[item.category];
  const price = priceMemory ? Number(priceMemory.price) : null;
  const estimatedCost = estimateItemCost(item, priceMemory);

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
          {priceMemory && price != null && Number.isFinite(price) ? (
            <span className="rounded-full border border-cyan-200/20 bg-cyan-200/10 px-2.5 py-1 text-[10px] font-semibold text-cyan-100">
              {formatPriceMemory(price, priceMemory.currency, priceMemory.price_unit)}
              {estimatedCost != null && Math.abs(estimatedCost - price) >= 0.01
                ? ` · est. ${formatCurrency(estimatedCost, priceMemory.currency)}`
                : ""}
            </span>
          ) : null}
        </div>
        {priceMemory && price != null && Number.isFinite(price) ? (
          <div className="mt-1 text-[11px] text-gray-500">
            Last logged
            {priceMemory.store_name ? ` at ${priceMemory.store_name}` : ""} · {formatDateLabel(priceMemory.observed_at)}
          </div>
        ) : null}
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
  const [priceCents, setPriceCents] = useState(0);
  const [priceUnit, setPriceUnit] = useState<GroceryPriceUnit>("each");
  const [storeName, setStoreName] = useState("");
  const [storeLocation, setStoreLocation] = useState("");
  const [tripStoreName, setTripStoreName] = useState("");
  const [tripStoreLocation, setTripStoreLocation] = useState("");
  const [tripObservedAt, setTripObservedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [tripPrices, setTripPrices] = useState<Record<string, string>>({});
  const [tripReceiptText, setTripReceiptText] = useState("");
  const [tripReviewOpen, setTripReviewOpen] = useState(false);
  const [tripBusy, setTripBusy] = useState(false);
  const [tripError, setTripError] = useState<string | null>(null);
  const [tripMessage, setTripMessage] = useState<string | null>(null);
  const [receiptScanning, setReceiptScanning] = useState(false);
  const [receiptCameraOpen, setReceiptCameraOpen] = useState(false);
  const [receiptCameraStarting, setReceiptCameraStarting] = useState(false);
  const [category, setCategory] = useState<GroceryCategory>("produce");
  const [mode, setMode] = useState<GroceryMode>("personal");
  const [household, setHousehold] = useState<HouseholdRow | null>(null);
  const [modeError, setModeError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [purchasedOpen, setPurchasedOpen] = useState(false);
  const [recentPurchase, setRecentPurchase] = useState<GroceryItem | null>(null);
  const [listOptionsOpen, setListOptionsOpen] = useState(false);
  const [priceMemories, setPriceMemories] = useState<Map<string, GroceryPriceMemoryRecord>>(
    () => new Map()
  );
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const receiptVideoRef = useRef<HTMLVideoElement | null>(null);
  const receiptStreamRef = useRef<MediaStream | null>(null);
  const purchaseUndoTimerRef = useRef<number | null>(null);

  function stopReceiptCamera() {
    if (receiptStreamRef.current) {
      receiptStreamRef.current.getTracks().forEach((track) => track.stop());
      receiptStreamRef.current = null;
    }

    if (receiptVideoRef.current) {
      receiptVideoRef.current.srcObject = null;
    }

    setReceiptCameraOpen(false);
    setReceiptCameraStarting(false);
  }

  useEffect(() => {
    async function init() {
      try {
        const currentHousehold = await getMyHousehold();
        setHousehold(currentHousehold);

        const data = await loadGroceryList("personal");
        setItems(data);
        if (data.length === 0) {
          setPriceMemories(new Map());
          setBudgetError(null);
        }
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
      stopReceiptCamera();
    };
  }, []);

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
  const tripReady = items.length > 0 && unbought.length === 0 && bought.length > 0;

  const budgetSummary = useMemo(() => {
    const activeItems = items.filter((item) => !item.bought);
    let knownTotal = 0;
    let knownCount = 0;

    for (const item of activeItems) {
      const memory = priceMemories.get(normalizeGroceryPriceName(item.name));
      const itemPrice = estimateItemCost(item, memory);

      if (itemPrice != null && Number.isFinite(itemPrice)) {
        knownTotal += itemPrice;
        knownCount += 1;
      }
    }

    return {
      knownTotal,
      knownCount,
      missingCount: activeItems.length - knownCount,
      totalCount: activeItems.length,
    };
  }, [items, priceMemories]);

  useEffect(() => {
    let cancelled = false;

    async function loadBudgetMemory() {
      try {
        const latest = await getLatestGroceryPriceMemories(
          items.map((item) => item.name),
          mode
        );

        if (!cancelled) {
          setPriceMemories(latest);
          setBudgetError(null);
        }
      } catch (error) {
        console.error("Failed to load grocery price memories:", error);
        if (!cancelled) {
          setPriceMemories(new Map());
          setBudgetError("Budget estimates could not be loaded.");
        }
      }
    }

    if (items.length > 0) void loadBudgetMemory();

    return () => {
      cancelled = true;
    };
  }, [items, mode]);

  async function loadForMode(nextMode: GroceryMode) {
    try {
      clearPurchaseUndo();
      const data = await loadGroceryList(nextMode);
      setItems(data);
      if (data.length === 0) {
        setBudgetError(null);
      }
      setMode(nextMode);
      setPurchasedOpen(false);
      setListOptionsOpen(false);
      setPriceMemories(new Map());
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

      const parsedPrice = priceCents / 100;
      if (priceCents > 0) {
        await recordGroceryPriceMemory(
          {
            item_name: name,
            category,
            store_name: storeName,
            store_location: storeLocation,
            price: parsedPrice,
            price_unit: priceUnit,
            quantity_text: qty,
            source_type: "manual",
            source_label: "Grocery quick add",
          },
          mode
        );
      }

      setItems(next);
      setName("");
      setQty("");
      setPriceCents(0);
    } catch (error) {
      console.error("Failed to add grocery item:", error);
      setActionError(
        error instanceof Error ? error.message : "Failed to add grocery item."
      );
    }
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
    setPriceMemories(new Map());
    setBudgetError(null);
  }

  async function onClearBought() {
    if (!window.confirm(`Clear ${bought.length} purchased item${bought.length === 1 ? "" : "s"}?`)) {
      return;
    }

    clearPurchaseUndo();
    const next = await clearBought(items, mode);
    setItems(next);
    setPurchasedOpen(false);
    setTripReviewOpen(false);
  }

  function openTripReview() {
    const seededPrices: Record<string, string> = {};

    for (const item of bought) {
      const memory = priceMemories.get(normalizeGroceryPriceName(item.name));
      const memoryPrice = memory ? Number(memory.price) : NaN;

      if (Number.isFinite(memoryPrice)) {
        seededPrices[item.id] = String(memoryPrice.toFixed(2));
      }
    }

    setTripPrices(seededPrices);
    setTripStoreName(storeName);
    setTripStoreLocation(storeLocation);
    setTripObservedAt(new Date().toISOString().slice(0, 10));
    setTripReceiptText("");
    setTripError(null);
    setTripMessage(null);
    stopReceiptCamera();
    setTripReviewOpen(true);
  }

  function applyReceiptText(text: string) {
    const parsedPrices = parseReceiptTextForItems(text, bought);
    setTripPrices((current) => ({ ...current, ...parsedPrices }));

    const parsedCount = Object.keys(parsedPrices).length;
    setTripMessage(
      parsedCount > 0
        ? `Matched ${parsedCount} receipt line${parsedCount === 1 ? "" : "s"}. Please confirm before saving.`
        : "No item prices were matched automatically. You can still enter them manually."
    );
  }

  async function onReceiptImageSelected(file: File | null) {
    if (!file) return;

    setReceiptScanning(true);
    setTripError(null);
    setTripMessage(null);

    try {
      const text = await readReceiptImageText(file);
      setTripReceiptText(text);
      applyReceiptText(text);
    } catch (error) {
      setTripError(
        error instanceof Error
          ? error.message
          : "Receipt image could not be scanned. You can enter prices manually."
      );
    } finally {
      setReceiptScanning(false);
    }
  }

  async function openReceiptCamera() {
    setReceiptCameraOpen(true);
    setReceiptCameraStarting(true);
    setTripError(null);
    setTripMessage(null);

    try {
      stopReceiptCamera();
      setReceiptCameraOpen(true);
      setReceiptCameraStarting(true);

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access is not available in this browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "environment" },
      });

      receiptStreamRef.current = stream;

      if (!receiptVideoRef.current) {
        throw new Error("Receipt camera preview is not ready.");
      }

      receiptVideoRef.current.srcObject = stream;
      await receiptVideoRef.current.play();
    } catch (error) {
      stopReceiptCamera();
      setTripError(
        error instanceof Error
          ? error.message
          : "Receipt camera could not be opened. You can upload or enter receipt text manually."
      );
    } finally {
      setReceiptCameraStarting(false);
    }
  }

  async function captureReceiptPhoto() {
    if (!receiptVideoRef.current) return;

    setReceiptScanning(true);
    setTripError(null);
    setTripMessage(null);

    try {
      const text = await readReceiptFrameText(receiptVideoRef.current);
      setTripReceiptText(text);
      applyReceiptText(text);
      stopReceiptCamera();
    } catch (error) {
      setTripError(
        error instanceof Error
          ? error.message
          : "Receipt photo could not be scanned. You can enter prices manually."
      );
    } finally {
      setReceiptScanning(false);
    }
  }

  async function completeGroceryTrip() {
    setTripBusy(true);
    setTripError(null);
    setTripMessage(null);

    try {
      const entries = bought
        .map((item) => {
          const parsedPrice = Number(tripPrices[item.id]);
          return {
            item,
            price: parsedPrice,
          };
        })
        .filter(({ price }) => Number.isFinite(price) && price >= 0);

      if (entries.length === 0) {
        throw new Error("Enter at least one confirmed receipt price before completing the trip.");
      }

      for (const { item, price: itemPrice } of entries) {
        await recordGroceryPriceMemory(
          {
            item_name: item.name,
            category: item.category,
            store_name: tripStoreName,
            store_location: tripStoreLocation,
            price: itemPrice,
            quantity_text: item.qty,
            source_type: tripReceiptText.trim() ? "receipt_scan" : "manual",
            source_label: tripReceiptText.trim() ? "Grocery trip receipt" : "Manual grocery trip entry",
            observed_at: tripObservedAt,
            confidence: tripReceiptText.trim() ? 0.95 : 0.75,
          },
          mode
        );
      }

      const next = await clearBought(items, mode);
      setItems(next);
      if (next.length === 0) {
        setPriceMemories(new Map());
        setBudgetError(null);
      }
      setTripReviewOpen(false);
      stopReceiptCamera();
      setPurchasedOpen(false);
      setTripMessage(null);
    } catch (error) {
      setTripError(error instanceof Error ? error.message : "Grocery trip could not be completed.");
    } finally {
      setTripBusy(false);
    }
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

          <div className="monolith-progress-track mt-4 h-2.5 overflow-hidden rounded-full bg-gray-900">
            <div
              className="monolith-progress-fill h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all duration-300"
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
                {budgetSummary.totalCount === 0
                  ? "Budget estimates appear after you add list items."
                  : `${budgetSummary.knownCount} priced · ${budgetSummary.missingCount} unknown`}
              </div>
            </div>
            <span className="rounded-full border border-cyan-200/20 bg-cyan-200/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-100">
              Est. {formatCurrency(budgetSummary.knownTotal)}
            </span>
          </div>

          {budgetError ? (
            <div className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              {budgetError}
            </div>
          ) : null}

          {tripReady ? (
            <div className="mt-3 rounded-2xl border border-cyan-200/25 bg-cyan-200/10 p-3 shadow-[0_0_24px_rgba(186,240,255,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">Complete grocery trip?</div>
                  <div className="mt-1 text-xs text-gray-400">
                    Confirm receipt prices for {bought.length} purchased item{bought.length === 1 ? "" : "s"} and update budget memory.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openTripReview}
                  className="shrink-0 rounded-xl bg-cyan-100 px-3 py-2 text-xs font-bold text-black hover:bg-cyan-200"
                >
                  Complete
                </button>
              </div>
            </div>
          ) : null}

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

          <div className="mt-4 flex gap-2">
            <div className="min-w-0 flex-1">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Add grocery item..."
                aria-label="Grocery item name"
                autoComplete="off"
                className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <button
              type="submit"
              disabled={!name.trim()}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
            </button>
          </div>

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

          <div className="mt-3 grid grid-cols-[1fr_1.25fr] gap-2">
            <div className="rounded-xl border border-gray-700 bg-gray-900 p-1.5 focus-within:border-blue-500">
              <label className="px-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                Price / {formatPriceUnit(priceUnit)}
              </label>
              <input
                value={formatCentsInput(priceCents)}
                onChange={(e) => setPriceCents(centsFromDigits(e.target.value))}
                onKeyDown={(e) => {
                  if (/^\d$/.test(e.key)) {
                    e.preventDefault();
                    setPriceCents((current) => Math.min(current * 10 + Number(e.key), 9999999));
                    return;
                  }

                  if (e.key === "Backspace" || e.key === "Delete") {
                    e.preventDefault();
                    setPriceCents(0);
                  }
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  setPriceCents(centsFromDigits(e.clipboardData.getData("text")));
                }}
                inputMode="numeric"
                aria-label="Optional item price"
                className="w-full bg-transparent px-1.5 pb-0.5 pt-1 text-sm font-bold text-white outline-none"
              />
            </div>
            <input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="Store, e.g. Costco"
              aria-label="Optional store name"
              className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white outline-none placeholder:text-gray-500 focus:border-blue-500"
            />
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              ["each", "1"],
              ["lb", "lb"],
              ["kg", "kg"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPriceUnit(value as GroceryPriceUnit)}
                aria-pressed={priceUnit === value}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  priceUnit === value
                    ? "border-cyan-200/40 bg-cyan-100 text-black shadow-[0_0_18px_rgba(186,240,255,0.12)]"
                    : "border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800"
                }`}
              >
                Per {label}
              </button>
            ))}
          </div>

          <div className="mt-2">
            <input
              value={storeLocation}
              onChange={(e) => setStoreLocation(e.target.value)}
              placeholder="Optional location, e.g. Toronto or Store #123"
              aria-label="Optional store location"
              className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white outline-none placeholder:text-gray-500 focus:border-blue-500"
            />
            <div className="mt-2 text-[11px] text-gray-500">
              Prices are saved as estimates for this {mode === "household" ? "household" : "personal"} list. Receipt scans will be able to verify these later.
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
                      priceMemory={priceMemories.get(normalizeGroceryPriceName(item.name))}
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
                                priceMemory={priceMemories.get(normalizeGroceryPriceName(item.name))}
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

      {tripReviewOpen ? (
        <div className="fixed inset-0 z-[90] overflow-y-auto bg-black/75 px-4 py-6 backdrop-blur-sm">
          <div className="mx-auto max-w-md rounded-3xl border border-cyan-200/25 bg-gray-950 p-4 shadow-[0_0_45px_rgba(186,240,255,0.12)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/80">
                  Grocery Trip
                </div>
                <h2 className="mt-2 text-xl font-bold text-white">Confirm Receipt Prices</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Scan or enter your receipt, then confirm the prices Macro OS should remember.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopReceiptCamera();
                  setTripReviewOpen(false);
                }}
                className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-800"
              >
                Close
              </button>
            </div>

            {tripError ? (
              <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                {tripError}
              </div>
            ) : null}

            {tripMessage ? (
              <div className="mt-4 rounded-2xl border border-cyan-200/25 bg-cyan-200/10 p-3 text-sm text-cyan-100">
                {tripMessage}
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void openReceiptCamera()}
                disabled={receiptCameraStarting || receiptScanning}
                className="rounded-2xl border border-cyan-200/25 bg-cyan-100 px-3 py-3 text-center text-sm font-bold text-black hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {receiptCameraStarting ? "Opening..." : "Open Camera"}
              </button>
              <button
                type="button"
                onClick={() => applyReceiptText(tripReceiptText)}
                className="rounded-2xl border border-gray-700 bg-gray-900 px-3 py-3 text-sm font-semibold text-white hover:bg-gray-800"
              >
                Parse Text
              </button>
            </div>

            {receiptCameraOpen ? (
              <div className="mt-3 overflow-hidden rounded-3xl border border-cyan-200/20 bg-gray-900">
                <div className="relative">
                  <video
                    ref={receiptVideoRef}
                    muted
                    playsInline
                    autoPlay
                    className="aspect-[3/4] w-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-5">
                    <div className="h-[74%] w-[82%] rounded-2xl border-2 border-cyan-100/70 shadow-[0_0_0_9999px_rgba(3,7,18,0.36)]" />
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-gray-950 via-gray-950/80 to-transparent px-4 pb-4 pt-14 text-center">
                    <div className="text-sm font-semibold text-white">Fill the frame with the receipt</div>
                    <div className="mt-1 text-xs text-gray-400">
                      {receiptCameraStarting ? "Starting camera..." : "Capture when the text is readable"}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 p-3">
                  <button
                    type="button"
                    onClick={stopReceiptCamera}
                    className="rounded-2xl border border-gray-700 bg-gray-950 px-3 py-3 text-sm font-semibold text-gray-200 hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void captureReceiptPhoto()}
                    disabled={receiptScanning || receiptCameraStarting}
                    className="rounded-2xl bg-cyan-100 px-3 py-3 text-sm font-bold text-black hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {receiptScanning ? "Reading..." : "Capture Receipt"}
                  </button>
                </div>
              </div>
            ) : null}

            <label className="mt-3 block cursor-pointer rounded-2xl border border-gray-700 bg-gray-900 px-3 py-3 text-center text-xs font-semibold text-gray-300 hover:bg-gray-800">
              Upload receipt image instead
              <input
                type="file"
                accept="image/*"
                disabled={receiptScanning}
                onChange={(event) => void onReceiptImageSelected(event.target.files?.[0] ?? null)}
                className="sr-only"
              />
            </label>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <input
                value={tripStoreName}
                onChange={(event) => setTripStoreName(event.target.value)}
                placeholder="Store, e.g. Costco"
                className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white outline-none placeholder:text-gray-500 focus:border-blue-500"
              />
              <input
                value={tripObservedAt}
                onChange={(event) => setTripObservedAt(event.target.value)}
                type="date"
                className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white outline-none placeholder:text-gray-500 focus:border-blue-500"
              />
            </div>

            <input
              value={tripStoreLocation}
              onChange={(event) => setTripStoreLocation(event.target.value)}
              placeholder="Optional location, e.g. Toronto or Store #123"
              className="mt-2 w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white outline-none placeholder:text-gray-500 focus:border-blue-500"
            />

            <textarea
              value={tripReceiptText}
              onChange={(event) => setTripReceiptText(event.target.value)}
              placeholder="Receipt text can be pasted here if scan misses anything."
              rows={4}
              className="mt-3 w-full rounded-2xl border border-gray-700 bg-gray-900 px-3 py-3 text-xs text-white outline-none placeholder:text-gray-500 focus:border-blue-500"
            />

            <div className="mt-4 space-y-2">
              {bought.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-gray-700 bg-gray-900 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{item.name}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {CATEGORY_LABELS[item.category]}
                        {item.qty ? ` · ${item.qty}` : ""}
                      </div>
                    </div>
                    <input
                      value={tripPrices[item.id] ?? ""}
                      onChange={(event) =>
                        setTripPrices((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))
                      }
                      inputMode="decimal"
                      placeholder="$"
                      aria-label={`Receipt price for ${item.name}`}
                      className="w-24 rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-right text-sm font-semibold text-white outline-none placeholder:text-gray-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-[0.8fr_1.2fr] gap-2">
              <button
                type="button"
                onClick={() => {
                  stopReceiptCamera();
                  setTripReviewOpen(false);
                }}
                className="rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm font-semibold text-gray-200 hover:bg-gray-800"
              >
                Later
              </button>
              <button
                type="button"
                onClick={() => void completeGroceryTrip()}
                disabled={tripBusy}
                className="rounded-2xl bg-cyan-100 px-4 py-3 text-sm font-bold text-black hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {tripBusy ? "Saving..." : "Save Prices & Clear Trip"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
