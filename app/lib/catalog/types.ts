export type CatalogSourceName = "usda_fdc" | "open_food_facts" | "api_ninjas"

export type NormalizedFoodCandidate = {
  sourceName: CatalogSourceName
  sourceId: string
  sourceUrl?: string | null
  name: string
  brandName?: string | null
  foodCategory?: string | null
  barcode?: string | null
  servingSizeG?: number | null
  servingLabel?: string | null
  packageSize?: string | null
  caloriesPer100g: number
  proteinPer100g: number
  carbsPer100g: number
  fatPer100g: number
  fiberPer100g?: number | null
  sugarPer100g?: number | null
  sodiumMgPer100g?: number | null
  dietaryTags: string[]
  allergenTags: string[]
  confidence: number
  raw: unknown
}

export type NormalizedExerciseCandidate = {
  sourceName: CatalogSourceName
  sourceId: string
  name: string
  aliases: string[]
  category: "strength" | "cardio" | "mobility" | "core"
  exerciseType?: string | null
  primaryMuscleGroup?: string | null
  secondaryMuscleGroups: string[]
  equipment: string[]
  difficulty?: "beginner" | "intermediate" | "advanced" | "expert" | null
  description?: string | null
  instructions?: string | null
  safetyCues: string[]
  confidence: number
  raw: unknown
}

export function normalizeBarcode(value: string) {
  return value.replace(/\D/g, "")
}

export function compactText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || null
}

export function numberOrNull(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function nonNegativeNumber(value: unknown) {
  const parsed = numberOrNull(value)
  return parsed != null && parsed >= 0 ? parsed : 0
}
