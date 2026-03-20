"use client";

import AppShell from "../components/AppShell";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { GroceryCategory, GroceryItem } from "../lib/grocery";
import { loadGroceryList } from "../lib/grocery";
import { addIngredientsToGrocery, scaleQty } from "../lib/mealplan";
import type { Ingredient, Recipe } from "../lib/recipes";
import { saveGroceryList } from "../lib/grocery";
import { addLogEntry, loadLog, sumMacros, todayISO } from "../lib/macroLog";
import type { MacroLogEntry } from "../lib/macroLog";
import {
  TEMPLATE_RECIPES,
  addRecipe,
  deleteRecipe,
  loadRecipes,
  exportRecipeShareCode,
  importRecipeShareCode,
  mergeImportedRecipe,
} from "../lib/recipes";

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
  const [defaultServings, setDefaultServings] = useState(2);
  const [totalCalories, setTotalCalories] = useState("");
  const [totalProtein, setTotalProtein] = useState("");
  const [totalCarbs, setTotalCarbs] = useState("");
  const [totalFat, setTotalFat] = useState("");
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);
  const [recipeShareCode, setRecipeShareCode] = useState("");
  const [recipeShareMsg, setRecipeShareMsg] = useState<string | null>(null);
  const [recipeShareErr, setRecipeShareErr] = useState<string | null>(null);



  // Create recipe form state
  const [recipeName, setRecipeName] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([emptyIngredient()]);
  const [steps, setSteps] = useState<string[]>([""]);

  useEffect(() => {
    setMyRecipes(loadRecipes());
    setGrocery(loadGroceryList());
  }, []);
const selectedMacros = useMemo(() => {
  return selected.reduce((acc, s) => addMacros(acc, macrosForSelectedMeal(s.recipe, s.servings)), {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });
}, [selected]);
const [todayEntries, setTodayEntries] = useState<MacroLogEntry[]>([]);
useEffect(() => {
  setTodayEntries(loadLog(todayISO()));
}, []);
function logSelectedToToday() {
  if (selected.length === 0) return;

  const mealNames = selected
    .map(({ recipe, servings }) => `${recipe.name}${servings > 1 ? ` x${servings}` : ""}`)
    .join(", ");

  addLogEntry(mealNames, selectedMacros);
  setTodayEntries(loadLog(todayISO()));
  setSelected([]);
}
const todayTotals = useMemo(() => sumMacros(todayEntries), [todayEntries]);
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
function macrosForSelectedMeal(recipe: Recipe, servings: number) {
  const base = recipe.defaultServings || 1;
  const factor = servings / base;

  return {
    calories: Math.round((recipe.totalMacros.calories || 0) * factor),
    protein: Math.round((recipe.totalMacros.protein || 0) * factor),
    carbs: Math.round((recipe.totalMacros.carbs || 0) * factor),
    fat: Math.round((recipe.totalMacros.fat || 0) * factor),
  };
}

function addMacros(a: any, b: any) {
  return {
    calories: a.calories + b.calories,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
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



function updateStep(i: number, value: string) {
  setSteps((prev) => prev.map((step, idx) => (idx === i ? value : step)));
}

function addStepRow() {
  setSteps((prev) => [...prev, ""]);
}

function removeStepRow(i: number) {
  setSteps((prev) => prev.filter((_, idx) => idx !== i));
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
      const cleanedSteps = steps
      .map((step) => step.trim())
     .filter((step) => step.length > 0);
const servingsNum = Number(defaultServings) || 1;

const macros = {
  calories: Number(totalCalories) || 0,
  protein: Number(totalProtein) || 0,
  carbs: Number(totalCarbs) || 0,
  fat: Number(totalFat) || 0,
};
    if (!cleanedName || cleanedIngredients.length === 0) return;

    setMyRecipes((prev) =>
  addRecipe(prev, {
    name: cleanedName,
    ingredients: cleanedIngredients,
    defaultServings: servingsNum,
    totalMacros: macros,
    steps: cleanedSteps,
  })
  
);

    setRecipeName("");
    setIngredients([emptyIngredient()]);
    setSteps([""]);
    setTab("pick");
  }

 function onDeleteRecipe(id: string) {
  setMyRecipes((prev) => deleteRecipe(prev, id));
  setSelected((prev) => prev.filter((s) => s.recipe.id !== id));
}
function toggleRecipeSteps(recipeId: string) {
  setExpandedRecipeId((prev) => (prev === recipeId ? null : recipeId));
}
async function onShareRecipe(recipe: Recipe) {
  try {
    const code = exportRecipeShareCode(recipe);
    await navigator.clipboard.writeText(code);
    setRecipeShareMsg("Recipe code copied ✅");
    setRecipeShareErr(null);
    window.setTimeout(() => setRecipeShareMsg(null), 1500);
  } catch {
    setRecipeShareErr("Couldn’t copy recipe code.");
    setRecipeShareMsg(null);
  }
}

function onImportRecipe() {
  try {
    const imported = importRecipeShareCode(recipeShareCode);
    setMyRecipes((prev) => mergeImportedRecipe(prev, imported));
    setRecipeShareMsg("Recipe imported ✅");
    setRecipeShareErr(null);
    setRecipeShareCode("");
    window.setTimeout(() => setRecipeShareMsg(null), 1500);
  } catch {
    setRecipeShareErr("Invalid recipe code.");
    setRecipeShareMsg(null);
  }
}

  return (
    <AppShell title="Meals" subtitle="Plan meals and log macros">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Meals</h1>
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
<div className="mb-4 rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
  <h2 className="text-lg font-semibold">Share Recipe</h2>
  <p className="mt-1 text-sm text-gray-300">
    Paste a recipe code to import it into your recipes.
  </p>

  {recipeShareMsg && (
    <div className="mt-3 rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
      {recipeShareMsg}
    </div>
  )}

  {recipeShareErr && (
    <div className="mt-3 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
      {recipeShareErr}
    </div>
  )}

  <textarea
    value={recipeShareCode}
    onChange={(e) => setRecipeShareCode(e.target.value)}
    placeholder="Paste recipe code here..."
    className="mt-3 w-full rounded bg-gray-900 border border-gray-700 p-3 text-sm"
    rows={3}
  />

  <button
    type="button"
    onClick={onImportRecipe}
    disabled={!recipeShareCode.trim()}
    className="mt-3 w-full rounded bg-emerald-600 py-2 font-semibold hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
  >
    Import Recipe
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
             {selected.map(({ recipe, servings }) => {
  const perPlanMacros = macrosForSelectedMeal(recipe, servings);
  return (
    
    <li
      key={recipe.id}
      className="rounded-2xl border border-gray-700 bg-gray-900 p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">{recipe.name}</div>
          <div className="mt-1 text-xs text-gray-400">
            {recipe.ingredients.length} ingredients
            {recipe.steps?.length ? ` • ${recipe.steps.length} steps` : ""}
          </div>
          <div className="mt-2 text-xs text-gray-300">
            {perPlanMacros.calories} kcal • P {perPlanMacros.protein} • C{" "}
            {perPlanMacros.carbs} • F {perPlanMacros.fat}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => bumpServings(recipe.id, -1)}
            className="rounded bg-gray-700 px-3 py-2 font-semibold hover:bg-gray-600"
            title="Decrease servings"
          >
            –
          </button>

          <input
            value={servings}
            onChange={(e) => setServings(recipe.id, Number(e.target.value))}
            className="w-14 rounded border border-gray-700 bg-gray-900 p-2 text-center"
            inputMode="numeric"
          />

          <button
            type="button"
            onClick={() => bumpServings(recipe.id, 1)}
            className="rounded bg-gray-700 px-3 py-2 font-semibold hover:bg-gray-600"
            title="Increase servings"
          >
            +
          </button>
        </div>
        
      </div>
    </li>
  );
})}
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
<div className="mt-3 rounded border border-gray-700 bg-gray-900 p-3 text-sm">
  <div className="font-semibold mb-1">Selected macros</div>
  <div className="grid grid-cols-2 gap-2 text-gray-200">
    <div>Calories: {selectedMacros.calories}</div>
    <div>Protein: {selectedMacros.protein}g</div>
    <div>Carbs: {selectedMacros.carbs}g</div>
    <div>Fat: {selectedMacros.fat}g</div>
  </div>
<div className="bg-gray-800 p-4 rounded-lg shadow-lg mb-4">
  <div className="flex items-center justify-between">
    <h2 className="text-lg font-semibold">Today so far</h2>
    <span className="text-sm text-gray-300">{todayISO()}</span>
  </div>

  <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-gray-200">
    <div>Calories: {todayTotals.calories}</div>
    <div>Protein: {todayTotals.protein}g</div>
    <div>Carbs: {todayTotals.carbs}g</div>
    <div>Fat: {todayTotals.fat}g</div>
  </div>
</div>
  <button
    type="button"
    onClick={logSelectedToToday}
    disabled={selected.length === 0}
    className="mt-3 w-full bg-blue-600 hover:bg-blue-700 py-2 rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
  >
    Log Selected to Today
  </button>
</div>
        {/* Tab content */}
        {tab === "pick" ? (
          <div className="space-y-3">
{allPickable.map((r) => {
  const isSelected = selected.some((s) => s.recipe.id === r.id);

  return (
    <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-sm font-semibold text-white">{r.name}</div>
          <div className="mt-1 text-xs text-gray-400">
            {r.isTemplate ? "Template" : "My recipe"} • {r.ingredients.length} ingredients
            {r.steps?.length ? ` • ${r.steps.length} steps` : ""}
          </div>
          <div className="mt-2 text-xs text-gray-300">
            {r.totalMacros.calories} kcal total • P {r.totalMacros.protein} • C{" "}
            {r.totalMacros.carbs} • F {r.totalMacros.fat}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Default servings: {r.defaultServings}
          </div>
        </div>

        <button
          onClick={() => toggleSelect(r)}
          className={`rounded-xl px-3 py-2 text-sm font-semibold ${
            isSelected
              ? "bg-gray-700 hover:bg-gray-600"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {isSelected ? "Remove" : "Select"}
        </button>
      </div>

      {r.steps && r.steps.length > 0 && (
        <button
          type="button"
          onClick={() => toggleRecipeSteps(r.id)}
          className="mt-3 text-sm text-blue-400 hover:text-blue-300"
        >
          {expandedRecipeId === r.id ? "Hide Steps" : "View Steps"}
        </button>
      )}

      {expandedRecipeId === r.id && r.steps && r.steps.length > 0 && (
        <div className="mt-3 rounded-xl border border-gray-700 bg-gray-900 p-3">
          <h4 className="mb-2 text-sm font-semibold text-gray-200">Steps</h4>
          <ol className="space-y-2 text-sm text-gray-300">
            {r.steps.map((step, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="font-semibold text-gray-400">{idx + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {!r.isTemplate && (
  <div className="mt-3 flex gap-3">
    <button
      type="button"
      onClick={() => onShareRecipe(r)}
      className="text-sm text-blue-400 hover:text-blue-300"
    >
      Share Recipe
    </button>

    <button
      type="button"
      onClick={() => onDeleteRecipe(r.id)}
      className="text-sm text-gray-300 hover:text-white"
    >
      Delete Recipe
    </button>
  </div>
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
<div className="grid grid-cols-2 gap-3 mb-3">
  <div className="col-span-2">
    <label className="block text-sm text-gray-300 mb-1">Default servings</label>
    <input
      type="number"
      min={1}
      value={defaultServings}
      onChange={(e) => setDefaultServings(Number(e.target.value))}
      className="w-full p-3 rounded bg-gray-900 border border-gray-700"
    />
  </div>

  <div>
    <label className="block text-sm text-gray-300 mb-1">Total calories</label>
    <input
      type="number"
      value={totalCalories}
      onChange={(e) => setTotalCalories(e.target.value)}
      className="w-full p-3 rounded bg-gray-900 border border-gray-700"
    />
  </div>

  <div>
    <label className="block text-sm text-gray-300 mb-1">Total protein (g)</label>
    <input
      type="number"
      value={totalProtein}
      onChange={(e) => setTotalProtein(e.target.value)}
      className="w-full p-3 rounded bg-gray-900 border border-gray-700"
      
    />
  </div>

  <div>
    <label className="block text-sm text-gray-300 mb-1">Total carbs (g)</label>
    <input
      type="number"
      value={totalCarbs}
      onChange={(e) => setTotalCarbs(e.target.value)}
      className="w-full p-3 rounded bg-gray-900 border border-gray-700"
    />
  </div>

  <div>
    <label className="block text-sm text-gray-300 mb-1">Total fat (g)</label>
    <input
      type="number"
      value={totalFat}
      onChange={(e) => setTotalFat(e.target.value)}
      className="w-full p-3 rounded bg-gray-900 border border-gray-700"
    />
  </div>
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
<div className="mt-4">
  <h3 className="mb-2 text-sm font-semibold text-gray-300">
    Recipe Steps (optional)
  </h3>

  <div className="space-y-3">
    {steps.map((step, idx) => (
      <div
        key={idx}
        className="rounded border border-gray-700 bg-gray-900 p-3"
      >
        <label className="block text-sm text-gray-300 mb-1">
          Step {idx + 1}
        </label>
        <textarea
          value={step}
          onChange={(e) => updateStep(idx, e.target.value)}
          placeholder="e.g., Brown the turkey in a pan..."
          className="w-full rounded bg-gray-900 border border-gray-700 p-3 focus:outline-none focus:ring-2 focus:ring-blue-600"
          rows={2}
        />

        {steps.length > 1 && (
          <button
            type="button"
            onClick={() => removeStepRow(idx)}
            className="mt-2 text-sm text-gray-300 hover:text-white"
          >
            Remove step
          </button>
        )}
      </div>
    ))}
  </div>

  <button
    type="button"
    onClick={addStepRow}
    className="mt-3 w-full rounded bg-gray-700 py-2 font-semibold hover:bg-gray-600"
  >
    + Add Step
  </button>
</div>
            <button
              type="submit"
              className="mt-3 w-full bg-blue-600 hover:bg-blue-700 py-2 rounded font-semibold"
            >
              Save Recipe
            </button>
          </form>
        )}
      </div>
    </AppShell>
  );
}
