import { supabase } from "./supabase/client";
import type { GroceryCategory } from "./grocery";
import { getMyHousehold } from "./households-db";

export type GroceryMode = "personal" | "household";

export type GroceryItemRow = {
  id: string;
  user_id: string | null;
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

async function getCurrentHouseholdOptional() {
  return await getMyHousehold();
}

async function getGroceryContext(mode: GroceryMode) {
  const user = await getCurrentUser();

  if (mode === "personal") {
    return {
      mode,
      userId: user.id,
      householdId: null as string | null,
    };
  }

  const household = await getCurrentHouseholdOptional();

  if (!household) {
    throw new Error("You are not in a household");
  }

  return {
    mode,
    userId: null as string | null,
    householdId: household.id,
  };
}

export async function getGroceryItems(mode: GroceryMode = "personal") {
  const context = await getGroceryContext(mode);

  let query = supabase
    .from("grocery_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (context.mode === "personal") {
    query = query.eq("user_id", context.userId).is("household_id", null);
  } else {
    query = query.eq("household_id", context.householdId).is("user_id", null);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data ?? []) as GroceryItemRow[];
}

export async function createGroceryItem(
  input: CreateGroceryItemInput,
  mode: GroceryMode = "personal"
) {
  const context = await getGroceryContext(mode);

  const payload =
    context.mode === "personal"
      ? {
          user_id: context.userId,
          household_id: null,
          name: input.name.trim(),
          qty: input.qty?.trim() || null,
          category: input.category,
          bought: false,
          bought_at: null,
        }
      : {
          user_id: null,
          household_id: context.householdId,
          name: input.name.trim(),
          qty: input.qty?.trim() || null,
          category: input.category,
          bought: false,
          bought_at: null,
        };

  const { data, error } = await supabase
    .from("grocery_items")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;

  return data as GroceryItemRow;
}

export async function updateGroceryItemBought(
  itemId: string,
  bought: boolean,
  mode: GroceryMode = "personal"
) {
  const context = await getGroceryContext(mode);

  let query = supabase
    .from("grocery_items")
    .update({
      bought,
      bought_at: bought ? new Date().toISOString() : null,
    })
    .eq("id", itemId);

  if (context.mode === "personal") {
    query = query.eq("user_id", context.userId).is("household_id", null);
  } else {
    query = query.eq("household_id", context.householdId).is("user_id", null);
  }

  const { data, error } = await query.select().single();

  if (error) throw error;

  return data as GroceryItemRow;
}

export async function deleteGroceryItem(
  itemId: string,
  mode: GroceryMode = "personal"
) {
  const context = await getGroceryContext(mode);

  let query = supabase.from("grocery_items").delete().eq("id", itemId);

  if (context.mode === "personal") {
    query = query.eq("user_id", context.userId).is("household_id", null);
  } else {
    query = query.eq("household_id", context.householdId).is("user_id", null);
  }

  const { error } = await query;

  if (error) throw error;
}

export async function clearBoughtGroceryItems(mode: GroceryMode = "personal") {
  const context = await getGroceryContext(mode);

  let query = supabase.from("grocery_items").delete().eq("bought", true);

  if (context.mode === "personal") {
    query = query.eq("user_id", context.userId).is("household_id", null);
  } else {
    query = query.eq("household_id", context.householdId).is("user_id", null);
  }

  const { error } = await query;

  if (error) throw error;
}

export async function clearAllGroceryItems(mode: GroceryMode = "personal") {
  const context = await getGroceryContext(mode);

  let query = supabase.from("grocery_items").delete();

  if (context.mode === "personal") {
    query = query.eq("user_id", context.userId).is("household_id", null);
  } else {
    query = query.eq("household_id", context.householdId).is("user_id", null);
  }

  const { error } = await query;

  if (error) throw error;
}