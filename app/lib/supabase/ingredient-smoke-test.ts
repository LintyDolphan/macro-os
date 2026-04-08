import { createIngredient } from "./ingredients-db"
import {
  addLinkedRecipeIngredient,
  getRecipeIngredients,
  getRecipeIngredientTotals,
} from "./recipe-ingredients"

export async function runIngredientSmokeTest(userId: string, recipeId: string) {
  const ingredient = await createIngredient(userId, {
    name: "Chicken Breast Smoke Test",
    reference_amount_g: 240,
    reference_calories: 260,
    reference_protein_g: 50,
    reference_carbs_g: 0,
    reference_fat_g: 6,
  })

  const recipeRow = await addLinkedRecipeIngredient({
    recipe_id: recipeId,
    ingredient_id: ingredient.id,
    quantity_g: 180,
    sort_order: 999,
    name: ingredient.name,
    notes: "Smoke test",
  })

  const rows = await getRecipeIngredients(recipeId)
  const totals = await getRecipeIngredientTotals(recipeId)

  return {
    ingredient,
    recipeRow,
    rows,
    totals,
  }
}