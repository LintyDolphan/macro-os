import { supabase } from './supabase/client'

export type RecipeIngredientInput = {
  name: string
  amount?: number | null
  unit?: string | null
  notes?: string | null
  sort_order: number
  ingredient_id?: string | null
  quantity_g?: number | null
}

export type RecipeInput = {
  name: string
  description?: string | null
  instructions?: string
  servings: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  ingredients: RecipeIngredientInput[]
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getSession()

  if (error) throwSupabaseError(error, 'User session could not be loaded.')

  return data.session?.user ?? null
}

type SupabaseLikeError = {
  message?: unknown
  details?: unknown
  hint?: unknown
  code?: unknown
  error_description?: unknown
}

function describeSupabaseError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error

  if (error && typeof error === 'object') {
    const supabaseError = error as SupabaseLikeError
    const parts = [
      supabaseError.message,
      supabaseError.details,
      supabaseError.hint,
      supabaseError.error_description,
      supabaseError.code ? `Code: ${supabaseError.code}` : null,
    ]
      .filter((part): part is string | number => typeof part === 'string' || typeof part === 'number')
      .map(String)

    if (parts.length > 0) return parts.join(' ')

    try {
      return JSON.stringify(error)
    } catch {
      return ''
    }
  }

  return ''
}

function throwSupabaseError(error: unknown, fallback: string): never {
  const message = describeSupabaseError(error)
  throw new Error(message || fallback)
}

function missingSchemaColumn(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : ''
  const message = describeSupabaseError(error)
  return code === 'PGRST204' || /schema cache|column .*not found|could not find .* column/i.test(message)
}

function roundInteger(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed) : 0
}

function buildRecipePayload(userId: string, input: RecipeInput) {
  return {
    user_id: userId,
    name: input.name,
    description: input.description ?? null,
    instructions: input.instructions ?? '',
    servings: input.servings,
    calories: roundInteger(input.calories),
    protein_g: input.protein_g,
    carbs_g: input.carbs_g,
    fat_g: input.fat_g,
  }
}

function buildLegacyRecipePayload(userId: string, input: RecipeInput) {
  return {
    user_id: userId,
    name: input.name,
    calories: roundInteger(input.calories),
    protein_g: input.protein_g,
  }
}

async function insertRecipe(userId: string, input: RecipeInput) {
  const { data, error } = await supabase
    .from('recipes')
    .insert(buildRecipePayload(userId, input))
    .select('id')
    .single()

  if (error && missingSchemaColumn(error)) {
    const fallback = await supabase
      .from('recipes')
      .insert(buildLegacyRecipePayload(userId, input))
      .select('id')
      .single()

    if (fallback.error) {
      throwSupabaseError(fallback.error, 'Recipe row could not be created.')
    }

    return fallback.data
  }

  if (error) throwSupabaseError(error, 'Recipe row could not be created.')
  return data
}

function buildRecipeIngredientRows(recipeId: string, ingredients: RecipeIngredientInput[]) {
  return ingredients.map((ingredient) => ({
    recipe_id: recipeId,
    name: ingredient.name,
    amount: ingredient.amount ?? null,
    unit: ingredient.unit ?? null,
    notes: ingredient.notes ?? null,
    sort_order: ingredient.sort_order,
    ingredient_id: ingredient.ingredient_id ?? null,
    quantity_g: ingredient.quantity_g ?? null,
  }))
}

function buildLegacyRecipeIngredientRows(recipeId: string, ingredients: RecipeIngredientInput[]) {
  return ingredients.map((ingredient) => ({
    recipe_id: recipeId,
    name: ingredient.name,
    amount: ingredient.amount ?? null,
    unit: ingredient.unit ?? null,
    notes: ingredient.notes ?? null,
    sort_order: ingredient.sort_order,
  }))
}

async function insertRecipeIngredients(recipeId: string, ingredients: RecipeIngredientInput[]) {
  if (ingredients.length === 0) return

  const { error } = await supabase
    .from('recipe_ingredients')
    .insert(buildRecipeIngredientRows(recipeId, ingredients))

  if (error && missingSchemaColumn(error)) {
    const fallback = await supabase
      .from('recipe_ingredients')
      .insert(buildLegacyRecipeIngredientRows(recipeId, ingredients))

    if (fallback.error) throwSupabaseError(fallback.error, 'Recipe ingredients could not be saved.')
    return
  }

  if (error) throwSupabaseError(error, 'Recipe ingredients could not be saved.')
}

export async function getRecipes() {
  const enhancedQuery = supabase
    .from('recipes')
    .select(`
      *,
      recipe_ingredients (
        id,
        recipe_id,
        name,
        amount,
        unit,
        notes,
        sort_order,
        ingredient_id,
        quantity_g,
        ingredient:ingredients (
          id,
          name,
          calories_per_100g,
          protein_per_100g,
          carbs_per_100g,
          fat_per_100g,
          visibility,
          verification_status
        )
      )
    `)
    .order('created_at', { ascending: false })
    .order('sort_order', { foreignTable: 'recipe_ingredients', ascending: true })

  const { data, error } = await enhancedQuery

  if (!error) {
    return data
  }

  console.warn("Falling back to legacy recipe query.", describeSupabaseError(error))

  const { data: legacyData, error: legacyError } = await supabase
    .from('recipes')
    .select(`
      *,
      recipe_ingredients (
        id,
        recipe_id,
        name,
        amount,
        unit,
        notes,
        sort_order
      )
    `)
    .order('created_at', { ascending: false })
    .order('sort_order', { foreignTable: 'recipe_ingredients', ascending: true })

  if (legacyError) throwSupabaseError(legacyError, 'Recipes could not be loaded.')

  return legacyData
}

export async function createRecipe(input: RecipeInput) {
  const user = await getCurrentUser()

  if (!user) {
    throw new Error('User not signed in')
  }

  const recipe = await insertRecipe(user.id, input)

  if (input.ingredients.length > 0) {
    await insertRecipeIngredients(recipe.id, input.ingredients)
  }

  return recipe
}

export async function updateRecipe(recipeId: string, input: RecipeInput) {
  const { error: recipeError } = await supabase
    .from('recipes')
    .update({
      name: input.name,
      description: input.description ?? null,
      instructions: input.instructions ?? '',
      servings: input.servings,
      calories: roundInteger(input.calories),
      protein_g: input.protein_g,
      carbs_g: input.carbs_g,
      fat_g: input.fat_g,
    })
    .eq('id', recipeId)

  if (recipeError) throwSupabaseError(recipeError, 'Recipe could not be updated.')

  const { error: deleteError } = await supabase
    .from('recipe_ingredients')
    .delete()
    .eq('recipe_id', recipeId)

  if (deleteError) throwSupabaseError(deleteError, 'Old recipe ingredients could not be cleared.')

  if (input.ingredients.length > 0) {
    await insertRecipeIngredients(recipeId, input.ingredients)
  }
}

export async function deleteRecipe(recipeId: string) {
  const { error } = await supabase
    .from('recipes')
    .delete()
    .eq('id', recipeId)

  if (error) throwSupabaseError(error, 'Recipe could not be deleted.')
}
