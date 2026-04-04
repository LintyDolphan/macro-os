import { supabase } from "./supabase/client";

export type PlannerDayKey = "today" | "tomorrow" | "day3";
export type PlannerSlotType = "meal" | "snack";

export type PlannedMealRow = {
  id: string;
  user_id: string;
  recipe_id: string | null;
  template_id: string | null;
  day_key: PlannerDayKey;
  slot_type: PlannerSlotType;
  slot_key: string;
  sort_order: number;
  servings: number;
  logged: boolean;
  created_at: string;
  updated_at: string;
};

export type UpsertPlannedMealInput = {
  recipe_id: string | null;
  template_id?: string | null;
  day_key: PlannerDayKey;
  slot_type: PlannerSlotType;
  slot_key: string;
  sort_order?: number;
  servings?: number;
  logged?: boolean;
};


export async function setPlannedMealLogged(
    
  day_key: PlannerDayKey,
  slot_type: PlannerSlotType,
  slot_key: string,
  logged: boolean
) {
  try {
    console.log("SET LOGGED", { day_key, slot_type, slot_key, logged });
    const user = await getCurrentUser();

    const { data: existing, error: lookupError } = await supabase
      .from("planned_meals")
      .select("id, user_id, day_key, slot_type, slot_key, logged")
      .eq("user_id", user.id)
      .eq("day_key", day_key)
      .eq("slot_type", slot_type)
      .eq("slot_key", slot_key)
      .maybeSingle();

    if (lookupError) {
      return {
        data: null,
        error: `lookup failed: ${lookupError.message}`,
      };
    }

    if (!existing) {
      return {
        data: null,
        error: `no matching row found for user=${user.id}, day=${day_key}, type=${slot_type}, slot=${slot_key}`,
      };
    }

    const { data, error } = await supabase
      .from("planned_meals")
      .update({ logged })
      .eq("id", existing.id)
      .select("id, logged, day_key, slot_type, slot_key")
      .single();

    if (error) {
      return {
        data: null,
        error: `update failed: ${error.message}`,
      };
    }

    return {
      data,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unknown logged update error",
    };
  }
}

async function getCurrentUser() {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  const user = data.session?.user;
  if (!user) throw new Error("User not signed in");

  return user;
}

export async function getPlannedMeals() {
  const user = await getCurrentUser();

  const { data, error } = await supabase
    .from("planned_meals")
    .select("*")
    .eq("user_id", user.id)
    .order("day_key", { ascending: true })
    .order("slot_type", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []) as PlannedMealRow[];
}

export async function upsertPlannedMeal(input: UpsertPlannedMealInput) {
  try {
    const user = await getCurrentUser();

    console.log("UPSERT planned meal", {
  day_key: input.day_key,
  slot_type: input.slot_type,
  slot_key: input.slot_key,
  recipe_id: input.recipe_id,
  template_id: input.template_id,
  servings: input.servings,
  logged: input.logged,
});

    const payload = {
      user_id: user.id,
      recipe_id: input.recipe_id,
      template_id: input.template_id ?? null,
      day_key: input.day_key,
      slot_type: input.slot_type,
      slot_key: input.slot_key,
      sort_order: input.sort_order ?? 0,
      servings: input.servings ?? 1,
      logged: input.logged ?? false,
    };

    const { data: existing, error: existingError } = await supabase
      .from("planned_meals")
      .select("id")
      .eq("user_id", user.id)
      .eq("day_key", input.day_key)
      .eq("slot_type", input.slot_type)
      .eq("slot_key", input.slot_key)
      .maybeSingle();

    if (existingError) {
      return {
        data: null,
        error: `planned_meals existing lookup failed: ${existingError.message} | code=${existingError.code ?? "none"} | details=${existingError.details ?? "none"} | hint=${existingError.hint ?? "none"}`,
      };
    }

    if (existing) {
      const { data, error } = await supabase
        .from("planned_meals")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        return {
          data: null,
          error: `planned_meals update failed: ${error.message} | code=${error.code ?? "none"} | details=${error.details ?? "none"} | hint=${error.hint ?? "none"}`,
        };
      }

      return { data, error: null };
    }

    const { data, error } = await supabase
      .from("planned_meals")
      .insert(payload)
      .select()
      .single();

    if (error) {
      return {
        data: null,
        error: `planned_meals insert failed: ${error.message} | code=${error.code ?? "none"} | details=${error.details ?? "none"} | hint=${error.hint ?? "none"}`,
      };
    }

    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unknown planner DB error",
    };
  }
}

export async function deletePlannedMealBySlot(
  day_key: PlannerDayKey,
  slot_type: PlannerSlotType,
  slot_key: string
) {
  const user = await getCurrentUser();

  const { error } = await supabase
    .from("planned_meals")
    .delete()
    .eq("user_id", user.id)
    .eq("day_key", day_key)
    .eq("slot_type", slot_type)
    .eq("slot_key", slot_key);

  if (error) throw error;
}

export async function clearPlannedMealsForDay(day_key: PlannerDayKey) {
  const user = await getCurrentUser();

  const { error } = await supabase
    .from("planned_meals")
    .delete()
    .eq("user_id", user.id)
    .eq("day_key", day_key);

  if (error) throw error;
}