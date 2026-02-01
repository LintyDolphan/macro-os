"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { GroceryCategory, GroceryItem } from "../lib/grocery";
import { loadGroceryList } from "../lib/grocery";
import { addIngredientsToGrocery, scaleQty } from "../lib/mealplan";
import type { Ingredient, Recipe } from "../lib/recipes";
import { TEMPLATE_RECIPES, addRecipe, deleteRecipe, loadRecipes } from "../lib/recipes";
import { saveGroceryList } from "../lib/grocery";

type SelectedMeal = {
  recipe: Recipe;
  servings: number;
};

const CATEGORY_LABELS: Record<GroceryCategory, string> = {
  produce: "Produce",
  dairy: "Dairy",
  meat: "Meat",
  pantry: "Pantry",
  frozen: "Frozen",
  snacks: "Snacks",
  other: "Other",
};

function emptyIngredient(): Ingredient {
  return { name: "", qty: "", category: "produce" };
}

export default function MealsPage() {
  const [tab, setTab] = useState<"pick" | "mine">("pick");

  const [myRecipes, setMyRecipes] = useState<Recipe[]>([]);
  const [grocery, setGrocery] = useState<GroceryItem[]>([]);
  const [selected, setSelected] = useState<SelectedMeal[]>([]);
  const [addedMsg, setAddedMsg] = useState<string | null>(null);



  // Create recipe form state
  const [recipeName, setRecipeName] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([emptyIngredient()]);

  useEffect(() => {
    setMyRecipes(loadRecipes());
    setGrocery(loadGroceryList());
  }, []);

  const allPickable = useMemo(() => {
    // show templates + my recipes
    return [...TEMPLATE_RECIPES, ...myRecipes];
  }, [myRecipes]);

 function toggleSelect(recipe: Recipe) {
  setSelected((prev) => {
    const exists = prev.some((s) => s.recipe.id === recipe.id);
    if (exists) return prev.filter((s) => s.recipe.id !== recipe.id);
    return [{ recipe, servings: 1 }, ...prev];
  });
}
function setServings(recipeId: string, servings: number) {
  const clamped = Math.max(1, Math.min(20, servings)); // keep sane bounds
  setSelected((prev) =>
    prev.map((s) => (s.recipe.id === recipeId ? { ...s, servings: clamped } : s))
  );
}

function bumpServings(recipeId: string, delta: number) {
  setSelected((prev) =>
    prev.map((s) => {
      if (s.recipe.id !== recipeId) return s;
      const next = Math.max(1, Math.min(20, s.servings + delta));
      return { ...s, servings: next };
    })
  );
}


function addSelectedToGrocery() {
  const scaledIngredients = selected.flatMap(({ recipe, servings }) =>
    recipe.ingredients.map((ing) => ({
      ...ing,
      qty: scaleQty(ing.qty, servings),
    }))
  );

  const next = addIngredientsToGrocery(grocery, scaledIngredients);
  setGrocery(next);
  saveGroceryList(next);

  // ✅ UX: show confirmation + reset selection
  setAddedMsg(`Added ${scaledIngredients.length} ingredient lines to grocery ✅`);
  setSelected([]); // clears servings + selection

  // auto-hide message
  window.setTimeout(() => setAddedMsg(null), 1500);
}





  function updateIngredient(i: number, patch: Partial<Ingredient>) {
    setIngredients((prev) =>
      prev.map((ing, idx) => (idx === i ? { ...ing, ...patch } : ing))
    );
  }

  function addIngredientRow() {
    setIngredients((prev) => [...prev, emptyIngredient()]);
  }

  function removeIngredientRow(i: number) {
    setIngredients((prev) => prev.filter((_, idx) => idx !== i));
  }

  function onCreateRecipe(e: React.FormEvent) {
    e.preventDefault();

    const cleanedName = recipeName.trim();
    const cleanedIngredients = ingredients
      .map((ing) => ({
        name: ing.name.trim(),
        qty: ing.qty?.trim() || undefined,
        category: ing.category,
      }))
      .filter((ing) => ing.name.length > 0);

    if (!cleanedName || cleanedIngredients.length === 0) return;

    setMyRecipes((prev) =>
      addRecipe(prev, { name: cleanedName, ingredients: cleanedIngredients })
    );

    setRecipeName("");
    setIngredients([emptyIngredient()]);
    setTab("pick");
  }

 function onDeleteRecipe(id: string) {
  setMyRecipes((prev) => deleteRecipe(prev, id));
  setSelected((prev) => prev.filter((s) => s.recipe.id !== id));
}

  return (
    <main className="min-h-screen p-6 bg-gray-900 text-white">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Meals</h1>
          <Link href="/" className="text-sm text-gray-300 hover:text-white">
            ← Back
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab("pick")}
            className={`flex-1 py-2 rounded font-semibold border ${
              tab === "pick"
                ? "bg-gray-800 border-gray-700"
                : "bg-gray-900 border-gray-800 text-gray-300"
            }`}
          >
            Pick Meals
          </button>
          <button
            onClick={() => setTab("mine")}
            className={`flex-1 py-2 rounded font-semibold border ${
              tab === "mine"
                ? "bg-gray-800 border-gray-700"
                : "bg-gray-900 border-gray-800 text-gray-300"
            }`}
          >
            Make Recipe
          </button>
        </div>

        {/* Selected cart */}
        <div className="bg-gray-800 p-4 rounded-lg shadow-lg mb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Selected</h2>
            <span className="text-sm text-gray-300">{selected.length}</span>
          </div>
{addedMsg && (
  <div className="mt-3 flex items-center justify-between gap-3 rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
    <span>{addedMsg}</span>

    <Link
      href="/grocery"
      className="whitespace-nowrap rounded bg-emerald-600/20 px-3 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-600/30"
    >
      View Grocery →
    </Link>
  </div>
)}


          {selected.length === 0 ? (
            <p className="text-sm text-gray-400 mt-2">
              Pick meals below to build your plan, then add ingredients to your grocery list.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {selected.map(({ recipe, servings }) => (
  <li key={recipe.id} className="rounded border border-gray-700 bg-gray-900 p-3">
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <div className="font-semibold">{recipe.name}</div>
        <div className="text-xs text-gray-400">{recipe.ingredients.length} ingredients</div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => bumpServings(recipe.id, -1)}
          className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 font-semibold"
          title="Decrease servings"
        >
          –
        </button>

        <input
          value={servings}
          onChange={(e) => setServings(recipe.id, Number(e.target.value))}
          className="w-14 text-center p-2 rounded bg-gray-900 border border-gray-700"
          inputMode="numeric"
        />

        <button
          type="button"
          onClick={() => bumpServings(recipe.id, 1)}
          className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 font-semibold"
          title="Increase servings"
        >
          +
        </button>
      </div>
    </div>
  </li>
))}

            </ul>
          )}

          <button
            onClick={addSelectedToGrocery}
            disabled={selected.length === 0}
            className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 py-2 rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Selected Ingredients to Grocery List
          </button>

          <Link
            href="/grocery"
            className="mt-2 w-full bg-gray-700 hover:bg-gray-600 py-2 rounded font-semibold text-center block"
          >
            Go to Grocery List
          </Link>
        </div>

        {/* Tab content */}
        {tab === "pick" ? (
          <div className="space-y-3">
            {allPickable.map((r) => {
                 const isSelected = selected.some((s) => s.recipe.id === r.id);


              return (
                <div
                  key={r.id}
                  className="bg-gray-800 p-4 rounded-lg border border-gray-700"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="font-semibold">{r.name}</div>
                      <div className="text-xs text-gray-400">
                        {r.isTemplate ? "Template" : "My recipe"} •{" "}
                        {r.ingredients.length} ingredients
                      </div>
                    </div>

                    <button
                      onClick={() => toggleSelect(r)}
                      className={`px-3 py-2 rounded font-semibold ${
                        isSelected
                          ? "bg-gray-700 hover:bg-gray-600"
                          : "bg-blue-600 hover:bg-blue-700"
                      }`}
                    >
                      {isSelected ? "Remove" : "Select"}
                    </button>
                  </div>

                  {!r.isTemplate && (
                    <button
                      onClick={() => onDeleteRecipe(r.id)}
                      className="mt-3 text-sm text-gray-300 hover:text-white"
                    >
                      Delete recipe
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <form onSubmit={onCreateRecipe} className="bg-gray-800 p-4 rounded-lg shadow-lg">
            <h2 className="text-lg font-semibold mb-3">Make your own recipe</h2>

            <div className="mb-3">
              <label className="block text-sm text-gray-300 mb-1">Recipe name</label>
              <input
                value={recipeName}
                onChange={(e) => setRecipeName(e.target.value)}
                placeholder="e.g., Turkey chili"
                className="w-full p-3 rounded bg-gray-900 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="space-y-3">
              {ingredients.map((ing, idx) => (
                <div key={idx} className="rounded border border-gray-700 bg-gray-900 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className="block text-sm text-gray-300 mb-1">Ingredient</label>
                      <input
                        value={ing.name}
                        onChange={(e) => updateIngredient(idx, { name: e.target.value })}
                        placeholder="e.g., Ground turkey"
                        className="w-full p-3 rounded bg-gray-900 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-300 mb-1">Qty</label>
                      <input
                        value={ing.qty ?? ""}
                        onChange={(e) => updateIngredient(idx, { qty: e.target.value })}
                        placeholder="e.g., 1 lb"
                        className="w-full p-3 rounded bg-gray-900 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-300 mb-1">Category</label>
                      <select
                        value={ing.category}
                        onChange={(e) =>
                          updateIngredient(idx, { category: e.target.value as GroceryCategory })
                        }
                        className="w-full p-3 rounded bg-gray-900 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {ingredients.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeIngredientRow(idx)}
                      className="mt-2 text-sm text-gray-300 hover:text-white"
                    >
                      Remove ingredient
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addIngredientRow}
              className="mt-3 w-full bg-gray-700 hover:bg-gray-600 py-2 rounded font-semibold"
            >
              + Add Ingredient
            </button>

            <button
              type="submit"
              className="mt-3 w-full bg-blue-600 hover:bg-blue-700 py-2 rounded font-semibold"
            >
              Save Recipe
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
