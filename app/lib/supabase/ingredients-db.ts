// app/lib/supabase/ingredients-db.ts

import { supabase } from "./client"

export type IngredientVisibility = "public" | "private"
export type IngredientVerificationStatus = "verified" | "custom" | "pending"
export type IngredientType = "raw" | "packaged" | "custom"

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
  ingredient_type?: IngredientType
  brand_name?: string | null
  food_category?: string | null
  serving_size_g?: number | null
  serving_label?: string | null
  package_size?: string | null
  data_source?: string | null
  external_source_id?: string | null
  source_confidence?: number | null
  dietary_tags?: string[]
  allergen_tags?: string[]
  ingredient_notes?: string | null
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
  ingredient_type: IngredientType
  brand_name: string | null
  food_category: string | null
  serving_size_g: number | null
  serving_label: string | null
  package_size: string | null
  data_source: string | null
  external_source_id: string | null
  source_confidence: number | null
  dietary_tags: string[]
  allergen_tags: string[]
  ingredient_notes: string | null
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
  ingredient_type,
  brand_name,
  food_category,
  serving_size_g,
  serving_label,
  package_size,
  data_source,
  external_source_id,
  source_confidence,
  dietary_tags,
  allergen_tags,
  ingredient_notes,
  source_note,
  created_at,
  updated_at
`

function describeSupabaseError(error: { message?: string; details?: string | null; hint?: string | null; code?: string | null }) {
  return [error.message, error.details, error.hint, error.code ? `Code: ${error.code}` : null]
    .filter(Boolean)
    .join(" ");
}

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

function missingSchemaColumn(error: { code?: string | null; message?: string }) {
  return error.code === "PGRST204" || /schema cache|column .*not found|could not find .* column/i.test(error.message ?? "")
}

function buildCoreIngredientPayload(userId: string, input: IngredientInsert) {
  return {
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
  }
}

function buildEnrichedIngredientPayload(userId: string, input: IngredientInsert) {
  return {
    ...buildCoreIngredientPayload(userId, input),
    ingredient_type: input.ingredient_type ?? "raw",
    brand_name: input.brand_name?.trim() || null,
    food_category: input.food_category?.trim() || null,
    serving_size_g: input.serving_size_g == null ? null : normalizeNumber(input.serving_size_g),
    serving_label: input.serving_label?.trim() || null,
    package_size: input.package_size?.trim() || null,
    data_source: input.data_source?.trim() || null,
    external_source_id: input.external_source_id?.trim() || null,
    source_confidence:
      input.source_confidence == null ? null : normalizeNumber(input.source_confidence),
    dietary_tags: input.dietary_tags ?? [],
    allergen_tags: input.allergen_tags ?? [],
    ingredient_notes: input.ingredient_notes?.trim() || null,
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
    .insert(buildEnrichedIngredientPayload(userId, input))
    .select(INGREDIENT_SELECT)
    .single()

  if (error && missingSchemaColumn(error)) {
    const fallbackSelect = INGREDIENT_SELECT
      .split("\n")
      .filter(
        (line) =>
          ![
            "brand_name,",
            "ingredient_type,",
            "food_category,",
            "serving_size_g,",
            "serving_label,",
            "package_size,",
            "data_source,",
            "external_source_id,",
            "source_confidence,",
            "dietary_tags,",
            "allergen_tags,",
            "ingredient_notes,",
          ].includes(line.trim())
      )
      .join("\n")

    const fallback = await supabase
      .from("ingredients")
      .insert(buildCoreIngredientPayload(userId, input))
      .select(fallbackSelect)
      .single()

    if (fallback.error) throw new Error(describeSupabaseError(fallback.error))

    const fallbackRow = fallback.data as unknown as Omit<
      IngredientRecord,
      | "ingredient_type"
      | "brand_name"
      | "food_category"
      | "serving_size_g"
      | "serving_label"
      | "package_size"
      | "data_source"
      | "external_source_id"
      | "source_confidence"
      | "dietary_tags"
      | "allergen_tags"
      | "ingredient_notes"
    >

    return {
      ...fallbackRow,
      ingredient_type: input.ingredient_type ?? "raw",
      brand_name: null,
      food_category: null,
      serving_size_g: null,
      serving_label: null,
      package_size: null,
      data_source: null,
      external_source_id: null,
      source_confidence: null,
      dietary_tags: [],
      allergen_tags: [],
      ingredient_notes: null,
    } as IngredientRecord
  }

  if (error) throw new Error(describeSupabaseError(error))
  return data as IngredientRecord
}

export async function createPackagedIngredientPlaceholder(
  userId: string,
  input: {
    name: string
    visibility?: IngredientVisibility
    verification_status?: IngredientVerificationStatus
    source_note?: string | null
  }
) {
  return createIngredient(userId, {
    name: input.name,
    reference_amount_g: 100,
    reference_calories: 0,
    reference_protein_g: 0,
    reference_carbs_g: 0,
    reference_fat_g: 0,
    visibility: input.visibility ?? "private",
    verification_status: input.verification_status ?? "custom",
    ingredient_type: "packaged",
    source_note:
      input.source_note?.trim() ||
      "Canonical packaged item placeholder. Nutrition currently lives on the linked barcode record.",
  })
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
      ingredient_type: input.ingredient_type ?? "raw",
      brand_name: input.brand_name?.trim() || null,
      food_category: input.food_category?.trim() || null,
      serving_size_g: input.serving_size_g == null ? null : normalizeNumber(input.serving_size_g),
      serving_label: input.serving_label?.trim() || null,
      package_size: input.package_size?.trim() || null,
      data_source: input.data_source?.trim() || null,
      external_source_id: input.external_source_id?.trim() || null,
      source_confidence:
        input.source_confidence == null ? null : normalizeNumber(input.source_confidence),
      dietary_tags: input.dietary_tags ?? [],
      allergen_tags: input.allergen_tags ?? [],
      ingredient_notes: input.ingredient_notes?.trim() || null,
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
      ingredient_type: input.ingredient_type ?? "raw",
      brand_name: input.brand_name?.trim() || null,
      food_category: input.food_category?.trim() || null,
      serving_size_g: input.serving_size_g == null ? null : normalizeNumber(input.serving_size_g),
      serving_label: input.serving_label?.trim() || null,
      package_size: input.package_size?.trim() || null,
      data_source: input.data_source?.trim() || null,
      external_source_id: input.external_source_id?.trim() || null,
      source_confidence:
        input.source_confidence == null ? null : normalizeNumber(input.source_confidence),
      dietary_tags: input.dietary_tags ?? [],
      allergen_tags: input.allergen_tags ?? [],
      ingredient_notes: input.ingredient_notes?.trim() || null,
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
