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

  if (error) throw error

  return data.session?.user ?? null
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

  console.warn("Falling back to legacy recipe query.", error.message)

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

  if (legacyError) throw legacyError

  return legacyData
}

export async function createRecipe(input: RecipeInput) {
  const user = await getCurrentUser()

  if (!user) {
    throw new Error('User not signed in')
  }

  const { data: recipe, error: recipeError } = await supabase
    .from('recipes')
    .insert({
      user_id: user.id,
      name: input.name,
      description: input.description ?? null,
      instructions: input.instructions ?? '',
      servings: input.servings,
      calories: input.calories,
      protein_g: input.protein_g,
      carbs_g: input.carbs_g,
      fat_g: input.fat_g,
    })
    .select()
    .single()

  if (recipeError) throw recipeError

  if (input.ingredients.length > 0) {
    const { error: ingredientsError } = await supabase
      .from('recipe_ingredients')
      .insert(
        input.ingredients.map((ingredient) => ({
          recipe_id: recipe.id,
          name: ingredient.name,
          amount: ingredient.amount ?? null,
          unit: ingredient.unit ?? null,
          notes: ingredient.notes ?? null,
          sort_order: ingredient.sort_order,
          ingredient_id: ingredient.ingredient_id ?? null,
          quantity_g: ingredient.quantity_g ?? null,
        }))
      )

    if (ingredientsError) throw ingredientsError
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
      calories: input.calories,
      protein_g: input.protein_g,
      carbs_g: input.carbs_g,
      fat_g: input.fat_g,
    })
    .eq('id', recipeId)

  if (recipeError) throw recipeError

  const { error: deleteError } = await supabase
    .from('recipe_ingredients')
    .delete()
    .eq('recipe_id', recipeId)

  if (deleteError) throw deleteError

  if (input.ingredients.length > 0) {
    const { error: insertError } = await supabase
      .from('recipe_ingredients')
      .insert(
        input.ingredients.map((ingredient) => ({
          recipe_id: recipeId,
          name: ingredient.name,
          amount: ingredient.amount ?? null,
          unit: ingredient.unit ?? null,
          notes: ingredient.notes ?? null,
          sort_order: ingredient.sort_order,
          ingredient_id: ingredient.ingredient_id ?? null,
          quantity_g: ingredient.quantity_g ?? null,
        }))
      )

    if (insertError) throw insertError
  }
}

export async function deleteRecipe(recipeId: string) {
  const { error } = await supabase
    .from('recipes')
    .delete()
    .eq('id', recipeId)

  if (error) throw error
}
