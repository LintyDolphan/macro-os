// app/lib/supabase/recipe-ingredients.ts

import { supabase } from "./client"
import {
  calculateAndRoundRecipeTotals,
  type IngredientRecord,
  type RecipeIngredientRow,
} from "./calculate"

export type LinkedRecipeIngredientInput = {
  recipe_id: string
  ingredient_id: string
  quantity_g: number
  sort_order?: number
  name?: string
  notes?: string
}

type RawIngredientRelation =
  | IngredientRecord
  | IngredientRecord[]
  | null
  | undefined

type RawRecipeIngredientRow = {
  id: string
  recipe_id: string
  ingredient_id: string | null
  quantity_g: number | string | null
  sort_order?: number | null
  name?: string | null
  amount?: number | string | null
  unit?: string | null
  notes?: string | null
  ingredient?: RawIngredientRelation
}

function normalizeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function validateLinkedRecipeIngredientInput(input: LinkedRecipeIngredientInput) {
  if (!input.recipe_id) {
    throw new Error("recipe_id is required")
  }

  if (!input.ingredient_id) {
    throw new Error("ingredient_id is required")
  }

  if (!Number.isFinite(Number(input.quantity_g)) || Number(input.quantity_g) <= 0) {
    throw new Error("Quantity must be greater than 0 grams")
  }
}

function normalizeIngredientRelation(
  ingredient: RawIngredientRelation
): IngredientRecord | null {
  if (!ingredient) return null
  if (Array.isArray(ingredient)) return ingredient[0] ?? null
  return ingredient
}

function normalizeRecipeIngredientRow(row: RawRecipeIngredientRow): RecipeIngredientRow {
  return {
    id: row.id,
    recipe_id: row.recipe_id,
    ingredient_id: row.ingredient_id,
    quantity_g: row.quantity_g ?? null,
    sort_order: row.sort_order ?? null,
    name: row.name ?? null,
    amount: row.amount ?? null,
    unit: row.unit ?? null,
    notes: row.notes ?? null,
    ingredient: normalizeIngredientRelation(row.ingredient),
  }
}

function normalizeRecipeIngredientRows(
  rows: RawRecipeIngredientRow[] | null | undefined
): RecipeIngredientRow[] {
  return (rows ?? []).map(normalizeRecipeIngredientRow)
}

const RECIPE_INGREDIENT_SELECT = `
  id,
  recipe_id,
  ingredient_id,
  quantity_g,
  sort_order,
  name,
  amount,
  unit,
  notes,
  ingredient:ingredients (
    id,
    name,
    calories_per_100g,
    protein_per_100g,
    carbs_per_100g,
    fat_per_100g
  )
`

export async function getRecipeIngredients(recipeId: string): Promise<RecipeIngredientRow[]> {
  const { data, error } = await supabase
    .from("recipe_ingredients")
    .select(RECIPE_INGREDIENT_SELECT)
    .eq("recipe_id", recipeId)
    .order("sort_order", { ascending: true })

  if (error) throw error

  return normalizeRecipeIngredientRows(data as RawRecipeIngredientRow[] | null)
}

export async function getRecipeIngredientTotals(recipeId: string) {
  const rows = await getRecipeIngredients(recipeId)
  return calculateAndRoundRecipeTotals(rows)
}

export async function addLinkedRecipeIngredient(
  input: LinkedRecipeIngredientInput
): Promise<RecipeIngredientRow> {
  validateLinkedRecipeIngredientInput(input)

  const { data, error } = await supabase
    .from("recipe_ingredients")
    .insert({
      recipe_id: input.recipe_id,
      ingredient_id: input.ingredient_id,
      quantity_g: normalizeNumber(input.quantity_g),
      sort_order: normalizeNumber(input.sort_order),
      name: input.name?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .select(RECIPE_INGREDIENT_SELECT)
    .single()

  if (error) throw error

  return normalizeRecipeIngredientRow(data as RawRecipeIngredientRow)
}

export async function updateLinkedRecipeIngredient(
  recipeIngredientId: string,
  input: {
    ingredient_id?: string
    quantity_g?: number
    sort_order?: number
    name?: string
    notes?: string
  }
): Promise<RecipeIngredientRow> {
  const updates: Record<string, number | string | null> = {}

  if (input.ingredient_id !== undefined) {
    if (!input.ingredient_id) {
      throw new Error("ingredient_id cannot be empty")
    }
    updates.ingredient_id = input.ingredient_id
  }

  if (input.quantity_g !== undefined) {
    if (!Number.isFinite(Number(input.quantity_g)) || Number(input.quantity_g) <= 0) {
      throw new Error("Quantity must be greater than 0 grams")
    }
    updates.quantity_g = normalizeNumber(input.quantity_g)
  }

  if (input.sort_order !== undefined) {
    updates.sort_order = normalizeNumber(input.sort_order)
  }

  if (input.name !== undefined) {
    updates.name = input.name.trim() || null
  }

  if (input.notes !== undefined) {
    updates.notes = input.notes.trim() || null
  }

  const { data, error } = await supabase
    .from("recipe_ingredients")
    .update(updates)
    .eq("id", recipeIngredientId)
    .select(RECIPE_INGREDIENT_SELECT)
    .single()

  if (error) throw error

  return normalizeRecipeIngredientRow(data as RawRecipeIngredientRow)
}

export async function deleteRecipeIngredient(recipeIngredientId: string) {
  const { error } = await supabase
    .from("recipe_ingredients")
    .delete()
    .eq("id", recipeIngredientId)

  if (error) throw error
}