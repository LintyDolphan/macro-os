"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import BackButton from "../../components/BackButton";
import { TEMPLATE_RECIPES, loadRecipes, type Recipe } from "../../lib/recipes";
import {
  filterLabel,
  inferRecipeDietaryTags,
  readFavoriteRecipeIds,
  writeFavoriteRecipeIds,
} from "../../lib/recipe-browser";
import { supabase } from "../../lib/supabase/client";

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function perServing(recipe: Recipe) {
  const servings = Math.max(recipe.defaultServings || 1, 1);
  return {
    calories: round(recipe.totalMacros.calories / servings),
    protein: round(recipe.totalMacros.protein / servings),
    carbs: round(recipe.totalMacros.carbs / servings),
    fat: round(recipe.totalMacros.fat / servings),
  };
}

function RecipeDetailPageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const recipeId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const pickerDay = searchParams.get("day");
  const pickerSlotType = searchParams.get("slotType");
  const pickerSlotKey = searchParams.get("slotKey");
  const pickerSlotLabel = searchParams.get("slotLabel");
  const pickerReturnHref = searchParams.get("pickerReturn") === "macros" ? "/macros" : "/meals";
  const plannerPickerMode =
    searchParams.get("pickForPlanner") === "1" &&
    !!pickerDay &&
    !!pickerSlotType &&
    !!pickerSlotKey;
  const recipeBookHref = plannerPickerMode ? `/recipes?${searchParams.toString()}` : "/recipes";

  useEffect(() => {
    setFavoriteIds(readFavoriteRecipeIds());
  }, []);

  useEffect(() => {
    writeFavoriteRecipeIds(favoriteIds);
  }, [favoriteIds]);

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) throw error;

        if (!session?.user) {
          if (!active) return;
          setRedirecting(true);
          window.location.replace("/auth");
          return;
        }

        const loadedRecipes = await loadRecipes();
        const allRecipes = [...loadedRecipes, ...TEMPLATE_RECIPES];
        const match = allRecipes.find((item) => item.id === recipeId) ?? null;

        if (!active) return;

        if (!match) {
          setError("Recipe not found.");
        } else {
          setRecipe(match);
          setError(null);
        }
      } catch (error) {
        if (!active) return;
        console.error("Failed to load recipe detail:", error);
        setError(error instanceof Error ? error.message : "Recipe could not be loaded.");
      } finally {
        if (active) setAuthChecked(true);
      }
    }

    if (recipeId) {
      void init();
    } else {
      setError("Recipe not found.");
      setAuthChecked(true);
    }

    return () => {
      active = false;
    };
  }, [recipeId]);

  const favorite = recipe ? favoriteIds.has(recipe.id) : false;
  const dietaryTags = useMemo(
    () =>
      recipe
        ? Object.entries(inferRecipeDietaryTags(recipe))
            .filter(([, value]) => value)
            .map(([key]) => filterLabel(key as never))
        : [],
    [recipe]
  );

  function toggleFavorite() {
    if (!recipe) return;
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(recipe.id)) {
        next.delete(recipe.id);
      } else {
        next.add(recipe.id);
      }
      return next;
    });
  }

  function chooseRecipeForPlanner() {
    if (!recipe || !plannerPickerMode || !pickerDay || !pickerSlotType || !pickerSlotKey) return;

    const nextParams = new URLSearchParams({
      pickedRecipe: recipe.id,
      pickedTemplate: recipe.isTemplate ? "1" : "0",
      day: pickerDay,
      slotType: pickerSlotType,
      slotKey: pickerSlotKey,
    });

    if (pickerSlotLabel) {
      nextParams.set("slotLabel", pickerSlotLabel);
    }

    router.push(`${pickerReturnHref}?${nextParams.toString()}`);
  }

  if (redirecting || !authChecked) {
    return (
      <AppShell title="Recipe" subtitle="Loading recipe..." backHref={recipeBookHref} backLabel="Recipes">
        <div className="text-sm text-gray-400">Loading...</div>
      </AppShell>
    );
  }

  if (!recipe) {
    return (
      <AppShell title="Recipe" subtitle="Recipe details" backHref={recipeBookHref} backLabel="Recipes">
        <div className="rounded-3xl border border-dashed border-gray-700 bg-gray-800/50 p-5 text-sm text-gray-400">
          {error ?? "Recipe not found."}
        </div>
      </AppShell>
    );
  }

  const macros = perServing(recipe);

  return (
    <AppShell
      title={recipe.name}
      subtitle={plannerPickerMode ? `Choosing for ${pickerSlotLabel ?? "your meal"}` : "Recipe details"}
      backHref={recipeBookHref}
      backLabel={plannerPickerMode ? "Recipe results" : "Recipes"}
    >
      <div className="space-y-4">
        {plannerPickerMode ? (
          <section className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">
                  Use this recipe for {pickerSlotLabel ?? "your meal"}?
                </div>
                <p className="mt-1 text-xs text-emerald-100/75">
                  Review the ingredients and steps, then send it back to your planner.
                </p>
              </div>
              <BackButton
                fallbackHref={recipeBookHref}
                className="rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
              >
                Results
              </BackButton>
            </div>
            <button
              type="button"
              onClick={chooseRecipeForPlanner}
              className="mt-4 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Use In {pickerSlotLabel ?? "Meal"}
            </button>
          </section>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">{recipe.name}</h1>
              <p className="mt-1 text-sm text-gray-400">
                {recipe.ingredients.length} ingredients • {recipe.steps?.length ?? 0} steps
              </p>
            </div>
            <button
              type="button"
              onClick={toggleFavorite}
              aria-label={favorite ? "Remove favorite" : "Add favorite"}
              className={`rounded-full bg-gray-900 px-2.5 py-1.5 text-base leading-none transition ${
                favorite ? "text-amber-300" : "text-gray-500"
              }`}
            >
              {favorite ? "★" : "☆"}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-2xl bg-gray-900 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wide text-gray-500">Calories</div>
              <div className="mt-1 text-base font-semibold text-white">{macros.calories}</div>
              <div className="text-xs text-gray-500">per serving</div>
            </div>
            <div className="rounded-2xl bg-gray-900 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wide text-gray-500">Protein</div>
              <div className="mt-1 text-base font-semibold text-white">{macros.protein}g</div>
              <div className="text-xs text-gray-500">per serving</div>
            </div>
            <div className="rounded-2xl bg-gray-900 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wide text-gray-500">Carbs</div>
              <div className="mt-1 text-base font-semibold text-white">{macros.carbs}g</div>
              <div className="text-xs text-gray-500">per serving</div>
            </div>
            <div className="rounded-2xl bg-gray-900 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wide text-gray-500">Fat</div>
              <div className="mt-1 text-base font-semibold text-white">{macros.fat}g</div>
              <div className="text-xs text-gray-500">per serving</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-gray-900 px-3 py-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">Servings</div>
              <div className="mt-1 text-sm font-semibold text-white">{recipe.defaultServings}</div>
            </div>
            <div className="rounded-2xl bg-gray-900 px-3 py-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">Prep Time</div>
              <div className="mt-1 text-sm font-semibold text-white">Not set yet</div>
            </div>
            <div className="col-span-2 rounded-2xl bg-gray-900 px-3 py-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">Dietary Filters</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {dietaryTags.length > 0 ? (
                  dietaryTags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-blue-500/10 px-3 py-1.5 text-[11px] font-semibold text-blue-200"
                    >
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-gray-500">No dietary hints saved yet.</span>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Ingredients</h2>
          <ul className="mt-3 space-y-2">
            {recipe.ingredients.map((ingredient, index) => (
              <li
                key={`${ingredient.name}-${index}`}
                className="flex items-start justify-between gap-3 rounded-2xl bg-gray-900 px-3 py-3"
              >
                <div>
                  <div className="text-sm font-medium text-white">{ingredient.name}</div>
                  <div className="mt-1 text-xs text-gray-500">{ingredient.category}</div>
                </div>
                <div className="text-sm text-gray-300">{ingredient.qty ?? "As needed"}</div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Steps</h2>
          {recipe.steps && recipe.steps.length > 0 ? (
            <ol className="mt-3 space-y-3">
              {recipe.steps.map((step, index) => (
                <li key={index} className="flex gap-3 rounded-2xl bg-gray-900 px-3 py-3">
                  <span className="mt-0.5 text-sm font-semibold text-blue-300">{index + 1}</span>
                  <span className="text-sm leading-6 text-gray-200">{step}</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="mt-3 rounded-2xl bg-gray-900 px-4 py-4 text-sm text-gray-400">
              No steps saved for this recipe yet.
            </div>
          )}
        </section>

        {plannerPickerMode ? (
          <button
            type="button"
            onClick={chooseRecipeForPlanner}
            className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-[0_10px_30px_rgba(5,150,105,0.2)] hover:bg-emerald-700"
          >
            Use In {pickerSlotLabel ?? "Meal"}
          </button>
        ) : (
          <Link
            href="/recipes/create"
            className="block rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-[0_10px_30px_rgba(37,99,235,0.28)] hover:bg-blue-700"
          >
            Create Another Recipe
          </Link>
        )}
      </div>
    </AppShell>
  );
}

export default function RecipeDetailPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Recipe" subtitle="Loading recipe..." backHref="/recipes" backLabel="Recipes">
          <div className="text-sm text-gray-400">Loading...</div>
        </AppShell>
      }
    >
      <RecipeDetailPageContent />
    </Suspense>
  );
}
