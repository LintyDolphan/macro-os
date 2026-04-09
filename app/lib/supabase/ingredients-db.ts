// app/lib/supabase/ingredients-db.ts

import { supabase } from "./client"

export type IngredientVisibility = "public" | "private"
export type IngredientVerificationStatus = "verified" | "custom" | "pending"

export type IngredientInsert = {
  name: string
  reference_amount_g: number
  reference_calories?: number
  reference_protein_g?: number
  reference_carbs_g?: number
  reference_fat_g?: number
  cup_g?: number | null
  tbsp_g?: number | null
  tsp_g?: number | null
  piece_g?: number | null
  piece_label?: string | null
  visibility?: IngredientVisibility
  verification_status?: IngredientVerificationStatus
  source_note?: string | null
}

export type IngredientRecord = {
  id: string
  user_id: string | null
  name: string
  reference_amount_g: number
  reference_calories: number
  reference_protein_g: number
  reference_carbs_g: number
  reference_fat_g: number
  calories_per_100g: number
  protein_per_100g: number
  carbs_per_100g: number
  fat_per_100g: number
  cup_g: number | null
  tbsp_g: number | null
  tsp_g: number | null
  piece_g: number | null
  piece_label: string | null
  visibility: IngredientVisibility
  verification_status: IngredientVerificationStatus
  source_note: string | null
  created_at: string
  updated_at: string
}

const INGREDIENT_SELECT = `
  id,
  user_id,
  name,
  reference_amount_g,
  reference_calories,
  reference_protein_g,
  reference_carbs_g,
  reference_fat_g,
  calories_per_100g,
  protein_per_100g,
  carbs_per_100g,
  fat_per_100g,
  cup_g,
  tbsp_g,
  tsp_g,
  piece_g,
  piece_label,
  visibility,
  verification_status,
  source_note,
  created_at,
  updated_at
`

function normalizeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function validateIngredientInput(input: IngredientInsert) {
  if (!input.name?.trim()) {
    throw new Error("Ingredient name is required")
  }

  if (!Number.isFinite(Number(input.reference_amount_g)) || Number(input.reference_amount_g) <= 0) {
    throw new Error("Reference amount must be greater than 0 grams")
  }

  const numericFields = [
    input.reference_calories,
    input.reference_protein_g,
    input.reference_carbs_g,
    input.reference_fat_g,
  ]

  for (const value of numericFields) {
    if (value != null && Number(value) < 0) {
      throw new Error("Macro values cannot be negative")
    }
  }
}

export async function listIngredients(userId: string) {
  const { data, error } = await supabase
    .from("ingredients")
    .select(INGREDIENT_SELECT)
    .eq("user_id", userId)
    .order("name", { ascending: true })

  if (error) throw error
  return (data ?? []) as IngredientRecord[]
}

export async function listVerifiedIngredientsForAdmin(userId: string) {
  const { data, error } = await supabase
    .from("ingredients")
    .select(INGREDIENT_SELECT)
    .eq("visibility", "public")
    .eq("verification_status", "verified")
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .order("name", { ascending: true })

  if (error) throw error
  return (data ?? []) as IngredientRecord[]
}

export async function listVisibleIngredients(userId: string) {
  const [publicResult, privateResult] = await Promise.all([
    supabase
      .from("ingredients")
      .select(INGREDIENT_SELECT)
      .eq("visibility", "public")
      .eq("verification_status", "verified")
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .order("name", { ascending: true }),
    supabase
      .from("ingredients")
      .select(INGREDIENT_SELECT)
      .eq("user_id", userId)
      .eq("visibility", "private")
      .order("name", { ascending: true }),
  ])

  if (publicResult.error || privateResult.error) {
    console.warn("Ingredient library unavailable, continuing without it.", {
      publicError: publicResult.error?.message,
      privateError: privateResult.error?.message,
    })
    return []
  }

  const deduped = new Map<string, IngredientRecord>()

  for (const row of publicResult.data ?? []) {
    deduped.set(row.id, row as IngredientRecord)
  }

  for (const row of privateResult.data ?? []) {
    deduped.set(row.id, row as IngredientRecord)
  }

  return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name))
}

export async function getIngredientById(ingredientId: string, userId: string) {
  const { data, error } = await supabase
    .from("ingredients")
    .select(INGREDIENT_SELECT)
    .eq("id", ingredientId)
    .or(`user_id.eq.${userId},and(visibility.eq.public,verification_status.eq.verified)`)
    .single()

  if (error) throw error
  return data as IngredientRecord
}

export async function createIngredient(userId: string, input: IngredientInsert) {
  validateIngredientInput(input)

  const { data, error } = await supabase
    .from("ingredients")
    .insert({
      user_id: userId,
      name: input.name.trim(),
      reference_amount_g: normalizeNumber(input.reference_amount_g),
      reference_calories: normalizeNumber(input.reference_calories),
      reference_protein_g: normalizeNumber(input.reference_protein_g),
      reference_carbs_g: normalizeNumber(input.reference_carbs_g),
      reference_fat_g: normalizeNumber(input.reference_fat_g),
      cup_g: input.cup_g == null ? null : normalizeNumber(input.cup_g),
      tbsp_g: input.tbsp_g == null ? null : normalizeNumber(input.tbsp_g),
      tsp_g: input.tsp_g == null ? null : normalizeNumber(input.tsp_g),
      piece_g: input.piece_g == null ? null : normalizeNumber(input.piece_g),
      piece_label: input.piece_label?.trim() || null,
      visibility: input.visibility ?? "private",
      verification_status: input.verification_status ?? "custom",
      source_note: input.source_note?.trim() || null,
    })
    .select(INGREDIENT_SELECT)
    .single()

  if (error) throw error
  return data as IngredientRecord
}

export async function updateIngredient(
  ingredientId: string,
  userId: string,
  input: IngredientInsert
) {
  validateIngredientInput(input)

  const { data, error } = await supabase
    .from("ingredients")
    .update({
      name: input.name.trim(),
      reference_amount_g: normalizeNumber(input.reference_amount_g),
      reference_calories: normalizeNumber(input.reference_calories),
      reference_protein_g: normalizeNumber(input.reference_protein_g),
      reference_carbs_g: normalizeNumber(input.reference_carbs_g),
      reference_fat_g: normalizeNumber(input.reference_fat_g),
      cup_g: input.cup_g == null ? null : normalizeNumber(input.cup_g),
      tbsp_g: input.tbsp_g == null ? null : normalizeNumber(input.tbsp_g),
      tsp_g: input.tsp_g == null ? null : normalizeNumber(input.tsp_g),
      piece_g: input.piece_g == null ? null : normalizeNumber(input.piece_g),
      piece_label: input.piece_label?.trim() || null,
      visibility: input.visibility ?? "private",
      verification_status: input.verification_status ?? "custom",
      source_note: input.source_note?.trim() || null,
    })
    .eq("id", ingredientId)
    .eq("user_id", userId)
    .select(INGREDIENT_SELECT)
    .single()

  if (error) throw error
  return data as IngredientRecord
}

export async function promoteIngredientToVerifiedForTesting(
  ingredientId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from("ingredients")
    .update({
      visibility: "public",
      verification_status: "verified",
      source_note: "Temporary test promotion",
    })
    .eq("id", ingredientId)
    .eq("user_id", userId)
    .select(INGREDIENT_SELECT)
    .single()

  if (error) throw error
  return data as IngredientRecord
}

export async function updateVerifiedIngredientForAdmin(
  ingredientId: string,
  userId: string,
  input: IngredientInsert
) {
  validateIngredientInput(input)

  const { data, error } = await supabase
    .from("ingredients")
    .update({
      name: input.name.trim(),
      reference_amount_g: normalizeNumber(input.reference_amount_g),
      reference_calories: normalizeNumber(input.reference_calories),
      reference_protein_g: normalizeNumber(input.reference_protein_g),
      reference_carbs_g: normalizeNumber(input.reference_carbs_g),
      reference_fat_g: normalizeNumber(input.reference_fat_g),
      cup_g: input.cup_g == null ? null : normalizeNumber(input.cup_g),
      tbsp_g: input.tbsp_g == null ? null : normalizeNumber(input.tbsp_g),
      tsp_g: input.tsp_g == null ? null : normalizeNumber(input.tsp_g),
      piece_g: input.piece_g == null ? null : normalizeNumber(input.piece_g),
      piece_label: input.piece_label?.trim() || null,
      visibility: "public",
      verification_status: "verified",
      source_note: input.source_note?.trim() || null,
    })
    .eq("id", ingredientId)
    .eq("visibility", "public")
    .eq("verification_status", "verified")
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .select(INGREDIENT_SELECT)
    .single()

  if (error) throw error
  return data as IngredientRecord
}

export async function deleteVerifiedIngredientForAdmin(
  ingredientId: string,
  userId: string
) {
  const { error } = await supabase
    .from("ingredients")
    .delete()
    .eq("id", ingredientId)
    .eq("visibility", "public")
    .eq("verification_status", "verified")
    .or(`user_id.is.null,user_id.eq.${userId}`)

  if (error) throw error
}

export async function deleteIngredient(ingredientId: string, userId: string) {
  const { error } = await supabase
    .from("ingredients")
    .delete()
    .eq("id", ingredientId)
    .eq("user_id", userId)

  if (error) throw error
}
