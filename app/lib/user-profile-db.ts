import { supabase } from "./supabase/client";

export type OnboardingGender = "male" | "female" | "other" | "prefer_not_to_say";
export type OnboardingGoal = "cut" | "maintain" | "bulk" | "recomp";
export type OnboardingActivity = "sedentary" | "light" | "moderate" | "very" | "athlete";
export type BudgetPriority = "low" | "balanced" | "flexible";
export type TrainingGoal = "strength" | "muscle" | "fat_loss" | "endurance" | "general";
export type ProfileVisibility = "private" | "household" | "public";
export type ProfileRoleLabel = "member" | "coach" | "trainer";

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
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  profile_visibility: ProfileVisibility;
  role_label: ProfileRoleLabel;
  bio: string | null;
};

export type UserProfileCard = Pick<
  UserProfileRow,
  "user_id" | "display_name" | "username" | "avatar_url" | "profile_visibility" | "role_label"
>;

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
  display_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  profile_visibility?: ProfileVisibility;
  role_label?: ProfileRoleLabel;
  bio?: string | null;
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

function normalizeOptionalText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value?.trim() || null;
}

function hasOwnInput<Key extends keyof SaveUserProfileInput>(
  input: SaveUserProfileInput,
  key: Key
) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function profilePayload(
  userId: string,
  input: SaveUserProfileInput,
  existing?: UserProfileRow | null
) {
  const onboardingCompleted = input.onboarding_completed ?? existing?.onboarding_completed ?? false;

  const payload: Record<string, unknown> = {
    user_id: userId,
    age: input.age ?? existing?.age ?? null,
    gender: input.gender ?? existing?.gender ?? null,
    height_cm: input.height_cm ?? (existing?.height_cm == null ? null : Number(existing.height_cm)),
    weight_kg: input.weight_kg ?? (existing?.weight_kg == null ? null : Number(existing.weight_kg)),
    target_weight_kg:
      input.target_weight_kg ??
      (existing?.target_weight_kg == null ? null : Number(existing.target_weight_kg)),
    goal_type: input.goal_type ?? existing?.goal_type ?? null,
    activity_level: input.activity_level ?? existing?.activity_level ?? null,
    dietary_restrictions:
      input.dietary_restrictions === undefined
        ? existing?.dietary_restrictions ?? []
        : cleanTextList(input.dietary_restrictions),
    food_preferences:
      input.food_preferences === undefined
        ? existing?.food_preferences ?? []
        : cleanTextList(input.food_preferences),
    budget_priority: input.budget_priority ?? existing?.budget_priority ?? null,
    training_goal: input.training_goal ?? existing?.training_goal ?? null,
    training_days_per_week: input.training_days_per_week ?? existing?.training_days_per_week ?? null,
    equipment_access:
      input.equipment_access === undefined
        ? existing?.equipment_access ?? []
        : cleanTextList(input.equipment_access),
    health_limitations:
      input.health_limitations === undefined
        ? existing?.health_limitations ?? null
        : input.health_limitations?.trim() || null,
    workout_preferences:
      input.workout_preferences === undefined
        ? existing?.workout_preferences ?? []
        : cleanTextList(input.workout_preferences),
    intelligence_notes: input.intelligence_notes ?? existing?.intelligence_notes ?? {},
    onboarding_completed: onboardingCompleted,
    onboarding_completed_at:
      onboardingCompleted && !existing?.onboarding_completed_at
        ? new Date().toISOString()
        : existing?.onboarding_completed_at ?? null,
  };

  if (hasOwnInput(input, "display_name") || existing?.display_name !== undefined) {
    payload.display_name =
      normalizeOptionalText(input.display_name) !== undefined
        ? normalizeOptionalText(input.display_name)
        : existing?.display_name ?? null;
  }

  if (hasOwnInput(input, "username") || existing?.username !== undefined) {
    payload.username =
      normalizeOptionalText(input.username) !== undefined
        ? normalizeOptionalText(input.username)
        : existing?.username ?? null;
  }

  if (hasOwnInput(input, "avatar_url") || existing?.avatar_url !== undefined) {
    payload.avatar_url =
      normalizeOptionalText(input.avatar_url) !== undefined
        ? normalizeOptionalText(input.avatar_url)
        : existing?.avatar_url ?? null;
  }

  if (hasOwnInput(input, "profile_visibility") || existing?.profile_visibility !== undefined) {
    payload.profile_visibility = input.profile_visibility ?? existing?.profile_visibility ?? "household";
  }

  if (hasOwnInput(input, "role_label") || existing?.role_label !== undefined) {
    payload.role_label = input.role_label ?? existing?.role_label ?? "member";
  }

  if (hasOwnInput(input, "bio") || existing?.bio !== undefined) {
    payload.bio =
      normalizeOptionalText(input.bio) !== undefined
        ? normalizeOptionalText(input.bio)
        : existing?.bio ?? null;
  }

  return payload;
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
  const existing = await getUserProfile(user.id);

  const { data, error } = await supabase
    .from("user_profiles")
    .upsert(profilePayload(user.id, input, existing), { onConflict: "user_id" })
    .select()
    .single();

  if (error) throw error;

  return data as UserProfileRow;
}

export async function updateUserIdentity(input: Pick<
  SaveUserProfileInput,
  "display_name" | "username" | "avatar_url" | "profile_visibility" | "role_label" | "bio"
>) {
  return saveUserProfile(input);
}

export async function listUserProfilesByIds(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .in("user_id", uniqueIds);

  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }

  return (data ?? []) as UserProfileRow[];
}

export async function listHouseholdProfileCardsByIds(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const { data, error } = await supabase.rpc("get_household_profile_cards", {
    target_user_ids: uniqueIds,
  });

  if (error) {
    const code = "code" in error ? String(error.code ?? "") : "";
    const message = "message" in error ? String(error.message ?? "") : "";

    if (code === "42883" || /get_household_profile_cards/i.test(message)) {
      const profiles = await listUserProfilesByIds(uniqueIds);

      return profiles.map((profile) => ({
        user_id: profile.user_id,
        display_name: profile.display_name,
        username: profile.username,
        avatar_url: profile.avatar_url,
        profile_visibility: profile.profile_visibility,
        role_label: profile.role_label,
      })) as UserProfileCard[];
    }

    throw error;
  }

  return (data ?? []) as UserProfileCard[];
}
