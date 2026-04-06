import { supabase } from "./supabase/client";
import type { GroceryCategory } from "./grocery";

export type GroceryItemRow = {
  id: string;
  user_id: string;
  household_id?: string | null;
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

async function getCurrentUser() {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  const user = data.session?.user;
  if (!user) throw new Error("User not signed in");

  return user;
}

export async function getGroceryItems() {
  const user = await getCurrentUser();

  const { data, error } = await supabase
    .from("grocery_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []) as GroceryItemRow[];
}

export async function createGroceryItem(input: CreateGroceryItemInput) {
  const user = await getCurrentUser();

  const { data, error } = await supabase
    .from("grocery_items")
    .insert({
      user_id: user.id,
      household_id: null,
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
  const user = await getCurrentUser();

  const { data, error } = await supabase
    .from("grocery_items")
    .update({
      bought,
      bought_at: bought ? new Date().toISOString() : null,
    })
    .eq("id", itemId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) throw error;

  return data as GroceryItemRow;
}

export async function deleteGroceryItem(itemId: string) {
  const user = await getCurrentUser();

  const { error } = await supabase
    .from("grocery_items")
    .delete()
    .eq("id", itemId)
    .eq("user_id", user.id);

  if (error) throw error;
}

export async function clearBoughtGroceryItems() {
  const user = await getCurrentUser();

  const { error } = await supabase
    .from("grocery_items")
    .delete()
    .eq("user_id", user.id)
    .eq("bought", true);

  if (error) throw error;
}

export async function clearAllGroceryItems() {
  const user = await getCurrentUser();

  const { error } = await supabase
    .from("grocery_items")
    .delete()
    .eq("user_id", user.id);

  if (error) throw error;
}