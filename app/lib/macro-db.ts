import { supabase } from "./supabase/client";

export type MacroLogEntryRow = {
  id: string;
  user_id: string;
  date_key: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  created_at: string;
};

export type MacroTargetRow = {
  id: string;
  user_id: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sex: "male" | "female" | null;
  age: number | null;
  activity: "sedentary" | "light" | "moderate" | "very" | "athlete" | null;
  weight_lbs: number | null;
  height_in: number | null;
  goal: "cut" | "maintain" | "bulk" | null;
  is_current: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateMacroLogEntryInput = {
  date_key: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type SaveMacroTargetInput = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sex?: "male" | "female" | null;
  age?: number | null;
  activity?: "sedentary" | "light" | "moderate" | "very" | "athlete" | null;
  weight_lbs?: number | null;
  height_in?: number | null;
  goal?: "cut" | "maintain" | "bulk" | null;
  is_current?: boolean;
};

async function getCurrentUser() {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  const user = data.session?.user;
  if (!user) throw new Error("User not signed in");

  return user;
}

export async function getMacroLogEntries(date_key: string) {
  const user = await getCurrentUser();

  const { data, error } = await supabase
    .from("macro_log_entries")
    .select("*")
    .eq("user_id", user.id)
    .eq("date_key", date_key)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []) as MacroLogEntryRow[];
}

export async function createMacroLogEntry(input: CreateMacroLogEntryInput) {
  const user = await getCurrentUser();

  const { data, error } = await supabase
    .from("macro_log_entries")
    .insert({
      user_id: user.id,
      date_key: input.date_key,
      name: input.name,
      calories: input.calories,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
    })
    .select()
    .single();

  if (error) throw error;

  return data as MacroLogEntryRow;
}

export async function deleteMacroLogEntry(entryId: string) {
  const user = await getCurrentUser();

  const { error } = await supabase
    .from("macro_log_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) throw error;
}

export async function getMacroTargets() {
  const user = await getCurrentUser();

  const { data, error } = await supabase
    .from("macro_targets")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return (data ?? []) as MacroTargetRow[];
}

export async function getCurrentMacroTarget() {
  const user = await getCurrentUser();

  const { data, error } = await supabase
    .from("macro_targets")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_current", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return data as MacroTargetRow | null;
}

export async function saveMacroTarget(input: SaveMacroTargetInput) {
  const user = await getCurrentUser();
  const makeCurrent = input.is_current ?? true;

  if (makeCurrent) {
    const { error: clearError } = await supabase
      .from("macro_targets")
      .update({ is_current: false })
      .eq("user_id", user.id)
      .eq("is_current", true);

    if (clearError) throw clearError;
  }

  const { data, error } = await supabase
    .from("macro_targets")
    .insert({
      user_id: user.id,
      calories: input.calories,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
      sex: input.sex ?? null,
      age: input.age ?? null,
      activity: input.activity ?? null,
      weight_lbs: input.weight_lbs ?? null,
      height_in: input.height_in ?? null,
      goal: input.goal ?? null,
      is_current: makeCurrent,
    })
    .select()
    .single();

  if (error) throw error;

  return data as MacroTargetRow;
}

export async function deleteMacroTarget(targetId: string) {
  const user = await getCurrentUser();

  const { error } = await supabase
    .from("macro_targets")
    .delete()
    .eq("id", targetId)
    .eq("user_id", user.id);

  if (error) throw error;
}