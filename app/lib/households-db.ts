import { supabase } from "./supabase/client";

export type HouseholdRow = {
  id: string;
  name: string;
  owner_user_id: string;
  join_code: string;
  created_at: string;
  updated_at: string;
};

export type HouseholdMemberRow = {
  id: string;
  household_id: string;
  user_id: string;
  role: "owner" | "member";
  created_at: string;
};

async function getCurrentUser() {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  const user = data.session?.user;
  if (!user) throw new Error("User not signed in");

  return user;
}

function generateJoinCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";

  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }

  return result;
}

export async function getMyHousehold() {
  const user = await getCurrentUser();

  const { data: member, error: memberError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (memberError) throw memberError;
  if (!member) return null;

  const { data: household, error: householdError } = await supabase
    .from("households")
    .select("*")
    .eq("id", member.household_id)
    .single();

  if (householdError) throw householdError;

  return household as HouseholdRow;
}

export async function getMyHouseholdMembers() {
  const household = await getMyHousehold();
  if (!household) return [];

  const { data, error } = await supabase
    .from("household_members")
    .select("*")
    .eq("household_id", household.id)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []) as HouseholdMemberRow[];
}

export async function createHousehold(name: string) {
  const user = await getCurrentUser();

  const existing = await getMyHousehold();
  if (existing) {
    throw new Error("User is already in a household");
  }

  let household: HouseholdRow | null = null;
  let lastError: unknown = null;

  for (let i = 0; i < 5; i++) {
    const joinCode = generateJoinCode();

    const { data, error } = await supabase
      .from("households")
      .insert({
        name: name.trim(),
        owner_user_id: user.id,
        join_code: joinCode,
      })
      .select()
      .single();

    if (!error) {
      household = data as HouseholdRow;
      break;
    }

    lastError = error;
  }

  if (!household) {
    if (lastError && typeof lastError === "object") {
      const err = lastError as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      };

      throw new Error(
        `Failed to create household row: ${err.message ?? "unknown"} | code=${err.code ?? "none"} | details=${err.details ?? "none"} | hint=${err.hint ?? "none"}`
      );
    }

    throw new Error("Failed to create household");
  }

  const { error: memberError } = await supabase
    .from("household_members")
    .insert({
      household_id: household.id,
      user_id: user.id,
      role: "owner",
    });

  if (memberError) {
    throw new Error(
      `Failed to create household member row: ${memberError.message ?? "unknown"} | code=${memberError.code ?? "none"} | details=${memberError.details ?? "none"} | hint=${memberError.hint ?? "none"}`
    );
  }

  return household;
}

export async function joinHouseholdByCode(code: string) {
  const user = await getCurrentUser();

  const existing = await getMyHousehold();
  if (existing) {
    throw new Error("User is already in a household");
  }

  const normalized = code.trim().toUpperCase();

  const { data: household, error: householdError } = await supabase
    .from("households")
    .select("*")
    .eq("join_code", normalized)
    .maybeSingle();

  if (householdError) throw householdError;
  if (!household) throw new Error("Invalid join code");

  const { error: memberError } = await supabase
    .from("household_members")
    .insert({
      household_id: household.id,
      user_id: user.id,
      role: "member",
    });

  if (memberError) throw memberError;

  return household as HouseholdRow;
}

export async function leaveMyHousehold() {
  const user = await getCurrentUser();

  const { data: member, error: memberError } = await supabase
    .from("household_members")
    .select("id, household_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (memberError) throw memberError;
  if (!member) {
    throw new Error("User is not in a household");
  }

  const { error: deleteError } = await supabase
    .from("household_members")
    .delete()
    .eq("id", member.id);

  if (deleteError) throw deleteError;

  return { success: true };
}

export async function leaveHousehold() {
  const user = await getCurrentUser();

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) {
    throw new Error("User is not in a household");
  }

  const { error: deleteError } = await supabase
    .from("household_members")
    .delete()
    .eq("id", membership.id);

  if (deleteError) throw deleteError;

  return true;
}
