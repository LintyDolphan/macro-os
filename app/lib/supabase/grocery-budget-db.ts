import type { GroceryCategory, GroceryMode } from "../grocery";
import { getMyHousehold } from "../households-db";
import { supabase } from "./client";

export type GroceryPriceSourceType = "manual" | "receipt_scan" | "api" | "import";
export type GroceryPriceUnit = "each" | "lb" | "kg";

export type GroceryPriceMemoryRecord = {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  household_id: string | null;
  item_name: string;
  normalized_name: string;
  category: GroceryCategory | null;
  store_name: string | null;
  store_location: string | null;
  currency: string;
  price: number | string;
  price_unit: GroceryPriceUnit;
  quantity_text: string | null;
  source_type: GroceryPriceSourceType;
  source_label: string | null;
  observed_at: string;
  confidence: number | string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
};

export type GroceryPriceMemoryInput = {
  item_name: string;
  category?: GroceryCategory | null;
  store_name?: string | null;
  store_location?: string | null;
  currency?: string | null;
  price: number;
  price_unit?: GroceryPriceUnit;
  quantity_text?: string | null;
  source_type?: GroceryPriceSourceType;
  source_label?: string | null;
  observed_at?: string | null;
  confidence?: number | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
};

async function getCurrentUser() {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  const user = data.session?.user;
  if (!user) throw new Error("User not signed in");

  return user;
}

async function getBudgetContext(mode: GroceryMode) {
  const user = await getCurrentUser();

  if (mode === "personal") {
    return {
      userId: user.id,
      householdId: null as string | null,
    };
  }

  const household = await getMyHousehold();
  if (!household) throw new Error("You are not in a household");

  return {
    userId: null as string | null,
    householdId: household.id,
  };
}

export function normalizeGroceryPriceName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value?: string | null) {
  return value?.trim() || null;
}

function cleanCurrency(value?: string | null) {
  const next = value?.trim().toUpperCase() || "USD";
  return next.length === 3 ? next : "USD";
}

export async function recordGroceryPriceMemory(
  input: GroceryPriceMemoryInput,
  mode: GroceryMode = "personal"
) {
  const context = await getBudgetContext(mode);
  const normalizedName = normalizeGroceryPriceName(input.item_name);

  if (!normalizedName) throw new Error("Item name is required");
  if (!Number.isFinite(input.price) || input.price < 0) {
    throw new Error("Price must be zero or higher");
  }

  const { data, error } = await supabase
    .from("grocery_price_memories")
    .insert({
      user_id: context.userId,
      household_id: context.householdId,
      item_name: input.item_name.trim(),
      normalized_name: normalizedName,
      category: input.category ?? null,
      store_name: cleanText(input.store_name),
      store_location: cleanText(input.store_location),
      currency: cleanCurrency(input.currency),
      price: Number(input.price.toFixed(2)),
      price_unit: input.price_unit ?? "each",
      quantity_text: cleanText(input.quantity_text),
      source_type: input.source_type ?? "manual",
      source_label: cleanText(input.source_label),
      observed_at: input.observed_at ?? new Date().toISOString().slice(0, 10),
      confidence: input.confidence ?? (input.source_type === "receipt_scan" ? 0.95 : 0.65),
      notes: cleanText(input.notes),
      metadata: input.metadata ?? {},
    })
    .select()
    .single();

  if (error) throw error;

  return data as GroceryPriceMemoryRecord;
}

export async function getLatestGroceryPriceMemories(
  itemNames: string[],
  mode: GroceryMode = "personal"
) {
  const normalizedNames = [
    ...new Set(itemNames.map(normalizeGroceryPriceName).filter(Boolean)),
  ];
  if (normalizedNames.length === 0) return new Map<string, GroceryPriceMemoryRecord>();

  const context = await getBudgetContext(mode);

  let query = supabase
    .from("grocery_price_memories")
    .select("*")
    .in("normalized_name", normalizedNames)
    .order("observed_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (context.householdId) {
    query = query.eq("household_id", context.householdId).is("user_id", null);
  } else {
    query = query.eq("user_id", context.userId).is("household_id", null);
  }

  const { data, error } = await query;

  if (error) throw error;

  const latestByName = new Map<string, GroceryPriceMemoryRecord>();
  for (const row of (data ?? []) as GroceryPriceMemoryRecord[]) {
    if (!latestByName.has(row.normalized_name)) {
      latestByName.set(row.normalized_name, row);
    }
  }

  return latestByName;
}
