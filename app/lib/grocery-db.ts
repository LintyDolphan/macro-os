import { supabase } from "./supabase/client";
import type { GroceryCategory } from "./grocery";
import { getMyHousehold } from "./households-db";

export type GroceryItemRow = {
  id: string;
  user_id: string;
  name: string;
  qty: string | null;
  category: GroceryCategory;
  bought: boolean;
  bought_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateGroceryItemInput = {
  name: string;
  qty?: string | null;
  category: GroceryCategory;
};

async function getCurrentHousehold() {
  const household = await getMyHousehold();
  if (!household) throw new Error("User is not in a household");
  return household;
}


export async function getGroceryItems() {
  const household = await getCurrentHousehold();

  const { data, error } = await supabase
    .from("grocery_items")
    .select("*")
    .eq("household_id", household.id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []) as GroceryItemRow[];
}

export async function createGroceryItem(input: CreateGroceryItemInput) {
  const household = await getCurrentHousehold();

  const { data, error } = await supabase
    .from("grocery_items")
    .insert({
      household_id: household.id,
      name: input.name.trim(),
      qty: input.qty?.trim() || null,
      category: input.category,
      bought: false,
      bought_at: null,
    })
    .select()
    .single();

  if (error) throw error;

  return data as GroceryItemRow;
}

export async function updateGroceryItemBought(itemId: string, bought: boolean) {
  const household = await getCurrentHousehold();

  const { data, error } = await supabase
    .from("grocery_items")
    .update({
      bought,
      bought_at: bought ? new Date().toISOString() : null,
    })
    .eq("id", itemId)
    .eq("household_id", household.id)
    .select()
    .single();

  if (error) throw error;

  return data as GroceryItemRow;
}

export async function deleteGroceryItem(itemId: string) {
  const household = await getCurrentHousehold();

  const { error } = await supabase
    .from("grocery_items")
    .delete()
    .eq("id", itemId)
    .eq("household_id", household.id);

  if (error) throw error;
}

export async function clearBoughtGroceryItems() {
  const household = await getCurrentHousehold();

  const { error } = await supabase
    .from("grocery_items")
    .delete()
    .eq("household_id", household.id)
    .eq("bought", true);

  if (error) throw error;
}

export async function clearAllGroceryItems() {
  const household = await getCurrentHousehold();

  const { error } = await supabase
    .from("grocery_items")
    .delete()
    .eq("household_id", household.id);

  if (error) throw error;
}