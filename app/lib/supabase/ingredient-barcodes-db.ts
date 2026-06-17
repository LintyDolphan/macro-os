import { supabase } from "./client"

export type IngredientBarcodeSourceType =
  | "manual"
  | "barcode_scan"
  | "label_scan"
  | "import"
  | "community"

export type IngredientBarcodeVisibility = "public" | "private"
export type IngredientBarcodeVerificationStatus = "verified" | "custom" | "pending"

export type IngredientBarcodeRecord = {
  id: string
  created_at: string
  updated_at: string
  user_id: string | null
  ingredient_id: string
  barcode: string
  normalized_barcode: string
  source_type: IngredientBarcodeSourceType
  notes: string | null
  visibility: IngredientBarcodeVisibility
  verification_status: IngredientBarcodeVerificationStatus
}

export type IngredientBarcodeInsert = {
  ingredient_id: string
  barcode: string
  source_type?: IngredientBarcodeSourceType
  notes?: string | null
  visibility?: IngredientBarcodeVisibility
  verification_status?: IngredientBarcodeVerificationStatus
}

const INGREDIENT_BARCODE_SELECT = `
  id,
  created_at,
  updated_at,
  user_id,
  ingredient_id,
  barcode,
  normalized_barcode,
  source_type,
  notes,
  visibility,
  verification_status
`

function normalizeOptionalString(value?: string | null) {
  return value?.trim() || null
}

export function normalizeBarcodeValue(value: string) {
  return value.replace(/\s+/g, "").trim()
}

function normalizeRequiredString(value: string, field: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${field} is required`)
  return trimmed
}

export async function findIngredientBarcodeByBarcode(barcode: string, userId?: string) {
  const normalized = normalizeBarcodeValue(barcode)
  if (!normalized) return null

  let query = supabase
    .from("ingredient_barcodes")
    .select(INGREDIENT_BARCODE_SELECT)
    .eq("normalized_barcode", normalized)
    .order("visibility", { ascending: true })
    .limit(1)

  if (userId) {
    query = query.or(
      `and(user_id.eq.${userId},visibility.eq.private),and(visibility.eq.public,verification_status.eq.verified)`
    )
  }

  const { data, error } = await query

  if (error) throw error
  return ((data ?? [])[0] as IngredientBarcodeRecord | undefined) ?? null
}

export async function upsertIngredientBarcode(
  userId: string,
  input: IngredientBarcodeInsert
) {
  const barcode = normalizeRequiredString(normalizeBarcodeValue(input.barcode), "Barcode")

  const { data: existing, error: lookupError } = await supabase
    .from("ingredient_barcodes")
    .select("id")
    .eq("user_id", userId)
    .eq("normalized_barcode", barcode)
    .eq("visibility", input.visibility ?? "private")
    .maybeSingle()

  if (lookupError) throw lookupError

  if (existing) {
    const { data, error } = await supabase
      .from("ingredient_barcodes")
      .update({
        ingredient_id: input.ingredient_id,
        barcode,
        normalized_barcode: barcode,
        source_type: input.source_type ?? "manual",
        notes: normalizeOptionalString(input.notes),
        visibility: input.visibility ?? "private",
        verification_status: input.verification_status ?? "custom",
      })
      .eq("id", existing.id)
      .select(INGREDIENT_BARCODE_SELECT)
      .single()

    if (error) throw error
    return data as IngredientBarcodeRecord
  }

  const { data, error } = await supabase
    .from("ingredient_barcodes")
    .insert({
      user_id: userId,
      ingredient_id: input.ingredient_id,
      barcode,
      normalized_barcode: barcode,
      source_type: input.source_type ?? "manual",
      notes: normalizeOptionalString(input.notes),
      visibility: input.visibility ?? "private",
      verification_status: input.verification_status ?? "custom",
    })
    .select(INGREDIENT_BARCODE_SELECT)
    .single()

  if (error) throw error
  return data as IngredientBarcodeRecord
}
