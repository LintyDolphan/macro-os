'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabase/client'

export default function RecipeTestPage() {
  const [status, setStatus] = useState('Ready')

  async function handleCreateRecipe() {
    setStatus('Creating recipe...')

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      setStatus(`Session error: ${sessionError.message}`)
      return
    }

    const user = sessionData.session?.user

    if (!user) {
      setStatus('No signed-in user found')
      return
    }

    const { data: recipe, error: recipeError } = await supabase
      .from('recipes')
      .insert({
        user_id: user.id,
        name: 'Test Chicken Rice Bowl',
        description: 'Simple test recipe',
        instructions: 'Cook chicken. Cook rice. Combine.',
        servings: 1,
        calories: 650,
        protein_g: 55,
        carbs_g: 50,
        fat_g: 18,
      })
      .select()
      .single()

    if (recipeError) {
      setStatus(`Recipe insert error: ${recipeError.message}`)
      return
    }

    const { error: ingredientError } = await supabase
      .from('recipe_ingredients')
      .insert([
        {
          recipe_id: recipe.id,
          name: 'Chicken breast',
          amount: 200,
          unit: 'g',
          notes: '',
          sort_order: 0,
        },
        {
          recipe_id: recipe.id,
          name: 'Rice',
          amount: 150,
          unit: 'g',
          notes: 'cooked',
          sort_order: 1,
        },
      ])

    if (ingredientError) {
      setStatus(`Ingredient insert error: ${ingredientError.message}`)
      return
    }

    setStatus(`Recipe created: ${recipe.id}`)
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>Recipe test</h1>
      <button onClick={handleCreateRecipe}>Create test recipe</button>
      <p>Status: {status}</p>
    </div>
  )
}