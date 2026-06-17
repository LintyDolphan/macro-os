import { supabase } from "./client"
import { upsertIngredientBarcode, normalizeBarcodeValue } from "./ingredient-barcodes-db"
import { createPackagedIngredientPlaceholder } from "./ingredients-db"

export type BarcodeProductSourceType =
  | "manual"
  | "barcode_scan"
  | "label_scan"
  | "import"
  | "community"

export type BarcodeProductVisibility = "public" | "private"
export type BarcodeProductVerificationStatus = "verified" | "custom" | "pending"

export type BarcodeProductRecord = {
  id: string
  created_at: string
  updated_at: string
  user_id: string | null
  linked_ingredient_id: string | null
  barcode: string
  normalized_barcode: string
  name: string
  brand: string | null
  serving_amount: number
  serving_unit: string
  package_amount: number | null
  package_unit: string | null
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  source_type: BarcodeProductSourceType
  nutrition_source: string | null
  label_image_url: string | null
  notes: string | null
  visibility: BarcodeProductVisibility
  verification_status: BarcodeProductVerificationStatus
}

export type BarcodeProductInsert = {
  linked_ingredient_id?: string | null
  barcode: string
  name: string
  brand?: string | null
  serving_amount?: number
  serving_unit?: string
  package_amount?: number | null
  package_unit?: string | null
  calories?: number
  protein_g?: number
  carbs_g?: number
  fat_g?: number
  source_type?: BarcodeProductSourceType
  nutrition_source?: string | null
  label_image_url?: string | null
  notes?: string | null
  visibility?: BarcodeProductVisibility
  verification_status?: BarcodeProductVerificationStatus
}

export type BarcodeProductUpdate = Partial<BarcodeProductInsert>

const BARCODE_PRODUCT_SELECT = `
  id,
  created_at,
  updated_at,
  user_id,
  linked_ingredient_id,
  barcode,
  normalized_barcode,
  name,
  brand,
  serving_amount,
  serving_unit,
  package_amount,
  package_unit,
  calories,
  protein_g,
  carbs_g,
  fat_g,
  source_type,
  nutrition_source,
  label_image_url,
  notes,
  visibility,
  verification_status
`

function normalizeOptionalString(value?: string | null) {
  return value?.trim() || null
}

function normalizeRequiredString(value: string, field: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${field} is required`)
  return trimmed
}

function normalizeNonNegativeNumber(value: unknown, field: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${field} must be 0 or greater`)
  }
  return parsed
}

function normalizePositiveNumber(value: unknown, field: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${field} must be greater than 0`)
  }
  return parsed
}

function validateBarcodeProductInput(input: BarcodeProductInsert) {
  normalizeRequiredString(input.name, "Product name")
  normalizeRequiredString(input.barcode, "Barcode")
  normalizePositiveNumber(input.serving_amount ?? 1, "Serving amount")
  normalizeRequiredString(input.serving_unit ?? "serving", "Serving unit")
  normalizeNonNegativeNumber(input.calories ?? 0, "Calories")
  normalizeNonNegativeNumber(input.protein_g ?? 0, "Protein")
  normalizeNonNegativeNumber(input.carbs_g ?? 0, "Carbs")
  normalizeNonNegativeNumber(input.fat_g ?? 0, "Fat")

  if (input.package_amount != null) {
    normalizePositiveNumber(input.package_amount, "Package amount")
  }

  if ((input.package_amount != null && !input.package_unit?.trim()) ||
      (input.package_unit?.trim() && input.package_amount == null)) {
    throw new Error("Package amount and package unit must be provided together")
  }
}

export async function listVisibleBarcodeProducts(userId: string) {
  const [publicResult, privateResult] = await Promise.all([
    supabase
      .from("barcode_products")
      .select(BARCODE_PRODUCT_SELECT)
      .eq("visibility", "public")
      .eq("verification_status", "verified")
      .order("name", { ascending: true }),
    supabase
      .from("barcode_products")
      .select(BARCODE_PRODUCT_SELECT)
      .eq("user_id", userId)
      .eq("visibility", "private")
      .order("name", { ascending: true }),
  ])

  if (publicResult.error) throw publicResult.error
  if (privateResult.error) throw privateResult.error

  const deduped = new Map<string, BarcodeProductRecord>()

  for (const row of publicResult.data ?? []) {
    deduped.set(row.id, row as BarcodeProductRecord)
  }

  for (const row of privateResult.data ?? []) {
    deduped.set(row.id, row as BarcodeProductRecord)
  }

  return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name))
}

export async function listMyBarcodeProducts(userId: string) {
  const { data, error } = await supabase
    .from("barcode_products")
    .select(BARCODE_PRODUCT_SELECT)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })

  if (error) throw error
  return (data ?? []) as BarcodeProductRecord[]
}

export async function getBarcodeProductById(productId: string) {
  const { data, error } = await supabase
    .from("barcode_products")
    .select(BARCODE_PRODUCT_SELECT)
    .eq("id", productId)
    .single()

  if (error) throw error
  return data as BarcodeProductRecord
}

export async function findBarcodeProductByBarcode(barcode: string, userId?: string) {
  const normalized = normalizeBarcodeValue(barcode)
  if (!normalized) return null

  let query = supabase
    .from("barcode_products")
    .select(BARCODE_PRODUCT_SELECT)
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
  return ((data ?? [])[0] as BarcodeProductRecord | undefined) ?? null
}

export async function createBarcodeProduct(userId: string, input: BarcodeProductInsert) {
  validateBarcodeProductInput(input)

  const barcode = normalizeRequiredString(normalizeBarcodeValue(input.barcode), "Barcode")
  const name = normalizeRequiredString(input.name, "Product name")
  const servingAmount = normalizePositiveNumber(input.serving_amount ?? 1, "Serving amount")
  const servingUnit = normalizeRequiredString(input.serving_unit ?? "serving", "Serving unit")
  const linkedIngredientId =
    input.linked_ingredient_id ??
    (
      await createPackagedIngredientPlaceholder(userId, {
        name,
        visibility: input.visibility ?? "private",
        verification_status: input.verification_status ?? "custom",
        source_note:
          "Created automatically from a barcode product. Nutrition remains on the barcode record until packaged-food nutrition is fully unified.",
      })
    ).id

  const { data, error } = await supabase
    .from("barcode_products")
    .insert({
      user_id: userId,
      linked_ingredient_id: linkedIngredientId,
      barcode,
      normalized_barcode: barcode,
      name,
      brand: normalizeOptionalString(input.brand),
      serving_amount: servingAmount,
      serving_unit: servingUnit,
      package_amount:
        input.package_amount == null
          ? null
          : normalizePositiveNumber(input.package_amount, "Package amount"),
      package_unit: normalizeOptionalString(input.package_unit),
      calories: normalizeNonNegativeNumber(input.calories ?? 0, "Calories"),
      protein_g: normalizeNonNegativeNumber(input.protein_g ?? 0, "Protein"),
      carbs_g: normalizeNonNegativeNumber(input.carbs_g ?? 0, "Carbs"),
      fat_g: normalizeNonNegativeNumber(input.fat_g ?? 0, "Fat"),
      source_type: input.source_type ?? "manual",
      nutrition_source: normalizeOptionalString(input.nutrition_source),
      label_image_url: normalizeOptionalString(input.label_image_url),
      notes: normalizeOptionalString(input.notes),
      visibility: input.visibility ?? "private",
      verification_status: input.verification_status ?? "custom",
    })
    .select(BARCODE_PRODUCT_SELECT)
    .single()

  if (error) throw error
  await upsertIngredientBarcode(userId, {
    ingredient_id: linkedIngredientId,
    barcode,
    source_type: input.source_type ?? "manual",
    notes: normalizeOptionalString(input.notes),
    visibility: input.visibility ?? "private",
    verification_status: input.verification_status ?? "custom",
  })
  return data as BarcodeProductRecord
}

export async function updateBarcodeProduct(
  productId: string,
  userId: string,
  input: BarcodeProductUpdate
) {
  const current = await getBarcodeProductById(productId)

  const barcode =
    input.barcode != null
      ? normalizeRequiredString(normalizeBarcodeValue(input.barcode), "Barcode")
      : current.barcode
  const name =
    input.name != null ? normalizeRequiredString(input.name, "Product name") : current.name
  const servingAmount =
    input.serving_amount != null
      ? normalizePositiveNumber(input.serving_amount, "Serving amount")
      : Number(current.serving_amount)
  const servingUnit =
    input.serving_unit != null
      ? normalizeRequiredString(input.serving_unit, "Serving unit")
      : current.serving_unit
  const packageAmount =
    input.package_amount === undefined
      ? current.package_amount
      : input.package_amount == null
        ? null
        : normalizePositiveNumber(input.package_amount, "Package amount")
  const packageUnit =
    input.package_unit === undefined
      ? current.package_unit
      : normalizeOptionalString(input.package_unit)

  if ((packageAmount != null && !packageUnit) || (packageUnit && packageAmount == null)) {
    throw new Error("Package amount and package unit must be provided together")
  }

  const linkedIngredientId =
    input.linked_ingredient_id === undefined
      ? current.linked_ingredient_id ??
        (
          await createPackagedIngredientPlaceholder(userId, {
            name,
            visibility: input.visibility ?? current.visibility,
            verification_status: input.verification_status ?? current.verification_status,
            source_note:
              "Created automatically from a barcode product update. Nutrition remains on the barcode record until packaged-food nutrition is fully unified.",
          })
        ).id
      : input.linked_ingredient_id

  const { data, error } = await supabase
    .from("barcode_products")
    .update({
      linked_ingredient_id: linkedIngredientId,
      barcode,
      normalized_barcode: barcode,
      name,
      brand: input.brand === undefined ? current.brand : normalizeOptionalString(input.brand),
      serving_amount: servingAmount,
      serving_unit: servingUnit,
      package_amount: packageAmount,
      package_unit: packageUnit,
      calories:
        input.calories === undefined
          ? current.calories
          : normalizeNonNegativeNumber(input.calories, "Calories"),
      protein_g:
        input.protein_g === undefined
          ? current.protein_g
          : normalizeNonNegativeNumber(input.protein_g, "Protein"),
      carbs_g:
        input.carbs_g === undefined
          ? current.carbs_g
          : normalizeNonNegativeNumber(input.carbs_g, "Carbs"),
      fat_g:
        input.fat_g === undefined
          ? current.fat_g
          : normalizeNonNegativeNumber(input.fat_g, "Fat"),
      source_type: input.source_type ?? current.source_type,
      nutrition_source:
        input.nutrition_source === undefined
          ? current.nutrition_source
          : normalizeOptionalString(input.nutrition_source),
      label_image_url:
        input.label_image_url === undefined
          ? current.label_image_url
          : normalizeOptionalString(input.label_image_url),
      notes: input.notes === undefined ? current.notes : normalizeOptionalString(input.notes),
      visibility: input.visibility ?? current.visibility,
      verification_status: input.verification_status ?? current.verification_status,
    })
    .eq("id", productId)
    .eq("user_id", userId)
    .select(BARCODE_PRODUCT_SELECT)
    .single()

  if (error) throw error
  if (linkedIngredientId) {
    await upsertIngredientBarcode(userId, {
      ingredient_id: linkedIngredientId,
      barcode,
      source_type: input.source_type ?? current.source_type,
      notes:
        input.notes === undefined ? current.notes : normalizeOptionalString(input.notes),
      visibility: input.visibility ?? current.visibility,
      verification_status: input.verification_status ?? current.verification_status,
    })
  }
  return data as BarcodeProductRecord
}

export async function deleteBarcodeProduct(productId: string, userId: string) {
  const { error } = await supabase
    .from("barcode_products")
    .delete()
    .eq("id", productId)
    .eq("user_id", userId)

  if (error) throw error
}
