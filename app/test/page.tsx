// app/meals/test-ingredient/page.tsx

"use client"

import { useState } from "react"
import { runIngredientSmokeTest } from "@/app/lib/supabase/ingredient-smoke-test"
import { supabase } from "@/app/lib/supabase/client"

export default function TestIngredientPage() {
  const [recipeId, setRecipeId] = useState("")
  const [output, setOutput] = useState<string>("")
  const [loading, setLoading] = useState(false)

  async function handleRunTest() {
    try {
      setLoading(true)
      setOutput("Running test...")

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) throw userError
      if (!user) throw new Error("No authenticated user found")
      if (!recipeId.trim()) throw new Error("Recipe ID is required")

      const result = await runIngredientSmokeTest(user.id, recipeId.trim())

      setOutput(JSON.stringify(result, null, 2))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred"
      setOutput(`Error: ${message}`)
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Ingredient Smoke Test</h1>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Recipe ID</label>
          <input
            value={recipeId}
            onChange={(e) => setRecipeId(e.target.value)}
            placeholder="Paste a recipe UUID"
            className="w-full rounded-lg border px-3 py-2"
          />
        </div>

        <button
          onClick={handleRunTest}
          disabled={loading}
          className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Running..." : "Run Smoke Test"}
        </button>

        <pre className="overflow-auto rounded-lg border p-4 text-sm whitespace-pre-wrap">
          {output || "No output yet"}
        </pre>
      </div>
    </main>
  )
}