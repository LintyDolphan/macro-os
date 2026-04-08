// app/lib/supabase/calculate.ts

export type MacroTotals = {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export type IngredientRecord = {
  id: string
  name: string
  calories_per_100g: number | string | null
  protein_per_100g: number | string | null
  carbs_per_100g: number | string | null
  fat_per_100g: number | string | null
}

export type RecipeIngredientRow = {
  id: string
  recipe_id: string
  ingredient_id: string | null
  quantity_g: number | string | null

  // existing descriptive fields
  name?: string | null
  amount?: number | string | null
  unit?: string | null
  notes?: string | null
  sort_order?: number | null

  ingredient?: IngredientRecord | null
}

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function emptyMacros(): MacroTotals {
  return {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  }
}

export function roundTo(value: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function roundMacroTotals(totals: MacroTotals): MacroTotals {
  return {
    calories: roundTo(totals.calories, 2),
    protein: roundTo(totals.protein, 2),
    carbs: roundTo(totals.carbs, 2),
    fat: roundTo(totals.fat, 2),
  }
}

export function calculateLinkedIngredientMacros(
  ingredient: IngredientRecord,
  quantityG: number
): MacroTotals {
  const caloriesPer100g = toNumber(ingredient.calories_per_100g)
  const proteinPer100g = toNumber(ingredient.protein_per_100g)
  const carbsPer100g = toNumber(ingredient.carbs_per_100g)
  const fatPer100g = toNumber(ingredient.fat_per_100g)

  return {
    calories: (caloriesPer100g * quantityG) / 100,
    protein: (proteinPer100g * quantityG) / 100,
    carbs: (carbsPer100g * quantityG) / 100,
    fat: (fatPer100g * quantityG) / 100,
  }
}

export function calculateRecipeIngredientRowMacros(
  row: RecipeIngredientRow
): MacroTotals {
  const quantityG = toNumber(row.quantity_g)

  if (row.ingredient_id && quantityG > 0 && row.ingredient) {
    return calculateLinkedIngredientMacros(row.ingredient, quantityG)
  }

  // legacy descriptive/manual rows do not store macros
  return emptyMacros()
}

export function calculateRecipeTotals(rows: RecipeIngredientRow[]): MacroTotals {
  return rows.reduce<MacroTotals>((totals, row) => {
    const rowTotals = calculateRecipeIngredientRowMacros(row)

    totals.calories += rowTotals.calories
    totals.protein += rowTotals.protein
    totals.carbs += rowTotals.carbs
    totals.fat += rowTotals.fat

    return totals
  }, emptyMacros())
}

export function calculateAndRoundRecipeTotals(
  rows: RecipeIngredientRow[]
): MacroTotals {
  return roundMacroTotals(calculateRecipeTotals(rows))
}