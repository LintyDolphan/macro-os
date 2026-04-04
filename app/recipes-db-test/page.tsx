'use client'

import { useEffect, useState } from 'react'
import { getRecipes } from '../lib/recipes-db'

export default function RecipesDbTestPage() {
  const [status, setStatus] = useState('Loading...')
  const [recipes, setRecipes] = useState<any[]>([])

  useEffect(() => {
    async function loadRecipes() {
      try {
        const data = await getRecipes()
        setRecipes(data ?? [])
        setStatus('Loaded')
      } catch (error: any) {
        setStatus(error.message ?? 'Failed to load recipes')
      }
    }

    loadRecipes()
  }, [])

  return (
    <div style={{ padding: 16 }}>
      <h1>Recipes DB test</h1>
      <p>Status: {status}</p>

      {recipes.map((recipe) => (
        <div key={recipe.id} style={{ marginBottom: 16 }}>
          <h2>{recipe.name}</h2>
          <p>Protein: {recipe.protein_g}g</p>
          <p>Ingredients: {recipe.recipe_ingredients?.length ?? 0}</p>
        </div>
      ))}
    </div>
  )
}