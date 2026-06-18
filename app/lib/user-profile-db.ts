import { supabase } from "./supabase/client";

export type OnboardingGender = "male" | "female" | "other" | "prefer_not_to_say";
export type OnboardingGoal = "cut" | "maintain" | "bulk" | "recomp";
export type OnboardingActivity = "sedentary" | "light" | "moderate" | "very" | "athlete";
export type BudgetPriority = "low" | "balanced" | "flexible";
export type TrainingGoal = "strength" | "muscle" | "fat_loss" | "endurance" | "general";

export type UserProfileRow = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  onboarding_completed: boolean;
  onboarding_completed_at: string | null;
  age: number | null;
  gender: OnboardingGender | null;
  height_cm: number | string | null;
  weight_kg: number | string | null;
  target_weight_kg: number | string | null;
  goal_type: OnboardingGoal | null;
  activity_level: OnboardingActivity | null;
  dietary_restrictions: string[];
  food_preferences: string[];
  budget_priority: BudgetPriority | null;
  training_goal: TrainingGoal | null;
  training_days_per_week: number | null;
  equipment_access: string[];
  health_limitations: string | null;
  workout_preferences: string[];
  intelligence_notes: Record<string, unknown>;
};

export type SaveUserProfileInput = {
  age?: number | null;
  gender?: OnboardingGender | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  target_weight_kg?: number | null;
  goal_type?: OnboardingGoal | null;
  activity_level?: OnboardingActivity | null;
  dietary_restrictions?: string[];
  food_preferences?: string[];
  budget_priority?: BudgetPriority | null;
  training_goal?: TrainingGoal | null;
  training_days_per_week?: number | null;
  equipment_access?: string[];
  health_limitations?: string | null;
  workout_preferences?: string[];
  intelligence_notes?: Record<string, unknown>;
  onboarding_completed?: boolean;
};

async function getCurrentUser() {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  const user = data.session?.user;
  if (!user) throw new Error("User not signed in");

  return user;
}

function isMissingTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";

  return code === "42P01" || /relation .*user_profiles.* does not exist/i.test(message);
}

function cleanTextList(values?: string[]) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function profilePayload(userId: string, input: SaveUserProfileInput) {
  const onboardingCompleted = input.onboarding_completed ?? false;

  return {
    user_id: userId,
    age: input.age ?? null,
    gender: input.gender ?? null,
    height_cm: input.height_cm ?? null,
    weight_kg: input.weight_kg ?? null,
    target_weight_kg: input.target_weight_kg ?? null,
    goal_type: input.goal_type ?? null,
    activity_level: input.activity_level ?? null,
    dietary_restrictions: cleanTextList(input.dietary_restrictions),
    food_preferences: cleanTextList(input.food_preferences),
    budget_priority: input.budget_priority ?? null,
    training_goal: input.training_goal ?? null,
    training_days_per_week: input.training_days_per_week ?? null,
    equipment_access: cleanTextList(input.equipment_access),
    health_limitations: input.health_limitations?.trim() || null,
    workout_preferences: cleanTextList(input.workout_preferences),
    intelligence_notes: input.intelligence_notes ?? {},
    onboarding_completed: onboardingCompleted,
    onboarding_completed_at: onboardingCompleted ? new Date().toISOString() : null,
  };
}

export async function getUserProfile(userId?: string) {
  const user = userId ? { id: userId } : await getCurrentUser();

  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }

  return data as UserProfileRow | null;
}

export async function saveUserProfile(input: SaveUserProfileInput) {
  const user = await getCurrentUser();

  const { data, error } = await supabase
    .from("user_profiles")
    .upsert(profilePayload(user.id, input), { onConflict: "user_id" })
    .select()
    .single();

  if (error) throw error;

  return data as UserProfileRow;
}
