"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "../components/AppShell";
import { TEMPLATE_RECIPES, deleteRecipe, loadRecipes, type Recipe } from "../lib/recipes";
import {
  filterLabel,
  inferRecipeDietaryTags,
  readFavoriteRecipeIds,
  recipeMatchesFilter,
  type RecipeFilterValue,
  writeFavoriteRecipeIds,
} from "../lib/recipe-browser";
import {
  listVisibleIngredients,
  type IngredientRecord as IngredientLibraryItem,
} from "../lib/supabase/ingredients-db";
import {
  listInventoryItems,
  type InventoryItemRecord,
} from "../lib/supabase/inventory-db";
import { supabase } from "../lib/supabase/client";

type PageTab = "book" | "libraries";
type LibraryTab = "verified" | "private";

const FILTER_OPTIONS: RecipeFilterValue[] = [
  "all",
  "favorites",
  "high-protein",
  "low-fat",
  "low-calories",
  "keto",
  "vegan",
  "vegetarian",
  "dairy-free",
  "gluten-free",
];

const MULTI_FILTER_OPTIONS = FILTER_OPTIONS.filter((filter) => filter !== "all");

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
        active
          ? "bg-blue-600 text-white shadow-[0_10px_30px_rgba(37,99,235,0.28)]"
          : "bg-gray-800 text-gray-300 hover:bg-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function perServing(recipe: Recipe) {
  const servings = Math.max(recipe.defaultServings || 1, 1);
  return {
    calories: Math.round(recipe.totalMacros.calories / servings),
    protein: Math.round(recipe.totalMacros.protein / servings),
    carbs: Math.round(recipe.totalMacros.carbs / servings),
    fat: Math.round(recipe.totalMacros.fat / servings),
  };
}

function normalizeInventoryName(value: string) {
  return value.trim().toLowerCase();
}

function formatIngredientSummary(ingredient: IngredientLibraryItem) {
  const parts = [
    ingredient.cup_g ? `cup ${ingredient.cup_g}g` : null,
    ingredient.tbsp_g ? `tbsp ${ingredient.tbsp_g}g` : null,
    ingredient.tsp_g ? `tsp ${ingredient.tsp_g}g` : null,
    ingredient.piece_g && ingredient.piece_label
      ? `${ingredient.piece_label} ${ingredient.piece_g}g`
      : null,
  ].filter(Boolean);

  return parts.join(" • ");
}

export default function RecipesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [tab, setTab] = useState<PageTab>("book");
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("verified");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeError, setRecipeError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedFilters, setSelectedFilters] = useState<RecipeFilterValue[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [ingredients, setIngredients] = useState<IngredientLibraryItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemRecord[]>([]);
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [privateSort, setPrivateSort] = useState<"az" | "newest" | "updated">("az");
  const [ingredientError, setIngredientError] = useState<string | null>(null);
  const [deletingRecipeId, setDeletingRecipeId] = useState<string | null>(null);
  const pickerDay = searchParams.get("day");
  const pickerSlotType = searchParams.get("slotType");
  const pickerSlotKey = searchParams.get("slotKey");
  const pickerSlotLabel = searchParams.get("slotLabel");
  const plannerPickerMode =
    searchParams.get("pickForPlanner") === "1" &&
    !!pickerDay &&
    !!pickerSlotType &&
    !!pickerSlotKey;

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

        const [loadedRecipes, loadedIngredients, loadedInventory] = await Promise.all([
          loadRecipes(),
          listVisibleIngredients(session.user.id),
          listInventoryItems(),
        ]);

        if (!active) return;
        setRecipes(loadedRecipes);
        setIngredients(loadedIngredients);
        setInventoryItems(loadedInventory);
        setRecipeError(null);
        setIngredientError(null);
      } catch (error) {
        if (!active) return;
        console.error("Failed to initialize recipes page:", error);
        setRecipeError(error instanceof Error ? error.message : "Recipes could not be loaded.");
        setIngredientError(
          error instanceof Error ? error.message : "Ingredient library could not be loaded."
        );
      } finally {
        if (active) setAuthChecked(true);
      }
    }

    void init();

    return () => {
      active = false;
    };
  }, []);

  const allRecipes = useMemo(() => [...recipes, ...TEMPLATE_RECIPES], [recipes]);

  const filteredRecipes = useMemo(() => {
    const query = search.trim().toLowerCase();

    return allRecipes.filter((recipe) => {
      const matchesSearch =
        !query ||
        recipe.name.toLowerCase().includes(query) ||
        recipe.ingredients.some((ingredient) => ingredient.name.toLowerCase().includes(query));

      const matchesFilters =
        selectedFilters.length === 0 ||
        selectedFilters.every((filter) => recipeMatchesFilter(recipe, filter, favoriteIds));

      return matchesSearch && matchesFilters;
    });
  }, [allRecipes, favoriteIds, search, selectedFilters]);

  const publicIngredients = useMemo(
    () =>
      ingredients
        .filter(
          (ingredient) =>
            ingredient.visibility === "public" && ingredient.verification_status === "verified"
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [ingredients]
  );

  const privateIngredients = useMemo(
    () => ingredients.filter((ingredient) => ingredient.visibility === "private"),
    [ingredients]
  );

  const inventoryByIngredientId = useMemo(() => {
    const map = new Map<string, InventoryItemRecord[]>();

    inventoryItems.forEach((item) => {
      if (!item.linked_ingredient_id) return;
      const existing = map.get(item.linked_ingredient_id) ?? [];
      existing.push(item);
      map.set(item.linked_ingredient_id, existing);
    });

    return map;
  }, [inventoryItems]);

  const inventoryByName = useMemo(() => {
    const map = new Map<string, InventoryItemRecord[]>();

    inventoryItems.forEach((item) => {
      const key = normalizeInventoryName(item.name);
      const existing = map.get(key) ?? [];
      existing.push(item);
      map.set(key, existing);
    });

    return map;
  }, [inventoryItems]);

  const filteredPublicIngredients = useMemo(() => {
    const query = ingredientSearch.trim().toLowerCase();
    if (!query) return publicIngredients;
    return publicIngredients.filter((ingredient) => ingredient.name.toLowerCase().includes(query));
  }, [ingredientSearch, publicIngredients]);

  const filteredPrivateIngredients = useMemo(() => {
    const query = ingredientSearch.trim().toLowerCase();
    const items = !query
      ? [...privateIngredients]
      : privateIngredients.filter((ingredient) => ingredient.name.toLowerCase().includes(query));

    switch (privateSort) {
      case "newest":
        return items.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      case "updated":
        return items.sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
      default:
        return items.sort((a, b) => a.name.localeCompare(b.name));
    }
  }, [ingredientSearch, privateIngredients, privateSort]);

  async function removeRecipe(recipe: Recipe) {
    if (recipe.isTemplate) return;
    if (!window.confirm(`Delete "${recipe.name}" from your recipe book?`)) return;

    try {
      setDeletingRecipeId(recipe.id);
      const updated = await deleteRecipe(recipes, recipe.id);
      setRecipes(updated);
    } catch (error) {
      console.error("Failed to delete recipe:", error);
      setRecipeError(error instanceof Error ? error.message : "Recipe could not be deleted.");
    } finally {
      setDeletingRecipeId(null);
    }
  }

  function toggleFavorite(recipeId: string) {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(recipeId)) {
        next.delete(recipeId);
      } else {
        next.add(recipeId);
      }
      return next;
    });
  }

  function toggleFilter(filter: RecipeFilterValue) {
    setSelectedFilters((prev) =>
      prev.includes(filter) ? prev.filter((item) => item !== filter) : [...prev, filter]
    );
  }

  function chooseRecipeForPlanner(recipe: Recipe) {
    if (!plannerPickerMode || !pickerDay || !pickerSlotType || !pickerSlotKey) return;

    const params = new URLSearchParams({
      pickedRecipe: recipe.id,
      pickedTemplate: recipe.isTemplate ? "1" : "0",
      day: pickerDay,
      slotType: pickerSlotType,
      slotKey: pickerSlotKey,
    });

    if (pickerSlotLabel) {
      params.set("slotLabel", pickerSlotLabel);
    }

    router.push(`/meals?${params.toString()}`);
  }

  function summarizeRecipeInventory(recipe: Recipe) {
    const matchedItemIds = new Set<string>();
    let lowStockCount = 0;

    recipe.ingredients.forEach((ingredient) => {
      const matches = ingredient.ingredientId
        ? inventoryByIngredientId.get(ingredient.ingredientId) ?? []
        : inventoryByName.get(normalizeInventoryName(ingredient.name)) ?? [];

      matches.forEach((item) => {
        if (matchedItemIds.has(item.id)) return;
        matchedItemIds.add(item.id);
        if (item.is_low_stock) lowStockCount += 1;
      });
    });

    return {
      onHandCount: matchedItemIds.size,
      lowStockCount,
    };
  }

  if (redirecting || !authChecked) {
    return (
      <AppShell title="Recipes" subtitle="Your recipe book and ingredient libraries">
        <div className="text-sm text-gray-400">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Recipes" subtitle="Your recipe book and ingredient libraries">
      <div className="space-y-5 pb-16">
        {plannerPickerMode ? (
          <div className="rounded-3xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-100">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-white">
                  Picking a recipe for {pickerSlotLabel ?? "your meal slot"}
                </div>
                <p className="mt-1 text-blue-100/80">
                  Browse your real recipe book here, then send one straight back to Meals.
                </p>
              </div>

              <Link
                href="/meals"
                className="rounded-2xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
              >
                Back
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <TabButton active={tab === "book"} onClick={() => setTab("book")}>
              Recipe Book
            </TabButton>
            <TabButton active={tab === "libraries"} onClick={() => setTab("libraries")}>
              Libraries
            </TabButton>
          </div>
        )}

        {(plannerPickerMode || tab === "book") && (
          <div className="space-y-4">
            {recipeError ? (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                {recipeError}
              </div>
            ) : null}

            <div className="rounded-3xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
              <div className="grid gap-3">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search recipes or ingredients..."
                  className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder:text-gray-500"
                />
              </div>

              <div className="mt-3 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [-webkit-overflow-scrolling:touch] touch-pan-x">
                <div className="flex min-w-max gap-2 pr-2 snap-x snap-mandatory">
                  <button
                    type="button"
                    onClick={() => setSelectedFilters([])}
                    className={`snap-start rounded-2xl px-3 py-2 text-sm font-semibold whitespace-nowrap transition ${
                      selectedFilters.length === 0
                        ? "bg-blue-600 text-white"
                        : "bg-gray-900 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    All
                  </button>
                  {MULTI_FILTER_OPTIONS.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => toggleFilter(filter)}
                    className={`snap-start rounded-2xl px-3 py-2 text-sm font-semibold whitespace-nowrap transition ${
                      selectedFilters.includes(filter)
                        ? "bg-blue-600 text-white"
                        : "bg-gray-900 text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      {filterLabel(filter)}
                    </button>
                  ))}
                </div>
              </div>

              <p className="mt-3 text-sm text-gray-400">
                You can stack multiple nutrition and dietary filters here. These are still inferred
                from recipe ingredients and per-serving macros, so they work best as quick discovery
                helpers.
              </p>
            </div>

            <div className="space-y-3">
              {filteredRecipes.map((recipe) => {
                const favorite = favoriteIds.has(recipe.id);
                const perServingMacros = perServing(recipe);
                const dietaryTags = inferRecipeDietaryTags(recipe);
                const inventorySummary = summarizeRecipeInventory(recipe);
                const tagList = Object.entries(dietaryTags)
                  .filter(([, value]) => value)
                  .slice(0, 3)
                  .map(([key]) => filterLabel(key as RecipeFilterValue));

                return (
                  <article
                    key={recipe.id}
                    className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-semibold text-white">{recipe.name}</h2>
                          {recipe.isTemplate ? (
                            <span className="rounded-full bg-gray-900 px-2.5 py-1 text-[11px] font-semibold text-gray-300">
                              Template
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-gray-400">
                          {recipe.ingredients.length} ingredients
                          {recipe.steps?.length ? ` • ${recipe.steps.length} steps` : ""}
                          {favorite ? " • Favorited" : ""}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleFavorite(recipe.id)}
                        aria-label={favorite ? "Remove favorite" : "Add favorite"}
                        className={`rounded-full bg-gray-900 px-3 py-2 text-lg leading-none transition ${
                          favorite
                            ? "text-amber-300 hover:text-amber-200"
                            : "text-gray-500 hover:text-gray-200"
                        }`}
                      >
                        {favorite ? "★" : "☆"}
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-2xl bg-gray-900 px-3 py-3 text-center">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500">
                          Calories
                        </div>
                        <div className="mt-1 text-base font-semibold text-white">
                          {perServingMacros.calories}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-gray-900 px-3 py-3 text-center">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500">
                          Protein
                        </div>
                        <div className="mt-1 text-base font-semibold text-white">
                          {perServingMacros.protein}g
                        </div>
                      </div>
                      <div className="rounded-2xl bg-gray-900 px-3 py-3 text-center">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500">
                          Carbs
                        </div>
                        <div className="mt-1 text-base font-semibold text-white">
                          {perServingMacros.carbs}g
                        </div>
                      </div>
                      <div className="rounded-2xl bg-gray-900 px-3 py-3 text-center">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500">Fat</div>
                        <div className="mt-1 text-base font-semibold text-white">
                          {perServingMacros.fat}g
                        </div>
                      </div>
                    </div>

                    {tagList.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {tagList.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-blue-500/10 px-3 py-1.5 text-[11px] font-semibold text-blue-200"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {inventorySummary.onHandCount > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-200">
                          On hand: {inventorySummary.onHandCount}
                        </span>
                        {inventorySummary.lowStockCount > 0 ? (
                          <span className="rounded-full bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold text-amber-200">
                            Low stock: {inventorySummary.lowStockCount}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-4 flex gap-2">
                      {plannerPickerMode ? (
                        <button
                          type="button"
                          onClick={() => chooseRecipeForPlanner(recipe)}
                          className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-700"
                        >
                          Use In {pickerSlotLabel ?? "Meal"}
                        </button>
                      ) : null}
                      <Link
                        href={`/recipes/${recipe.id}`}
                        className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        View Steps
                      </Link>
                      {!recipe.isTemplate ? (
                        <button
                          type="button"
                          onClick={() => removeRecipe(recipe)}
                          disabled={deletingRecipeId === recipe.id}
                          className="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingRecipeId === recipe.id ? "Deleting..." : "Delete"}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}

              {filteredRecipes.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-gray-700 bg-gray-800/40 p-5 text-sm text-gray-400">
                  No recipes match your search and filter yet.
                </div>
              ) : null}
            </div>
          </div>
        )}

        {!plannerPickerMode && tab === "libraries" && (
          <div className="space-y-4">
            {ingredientError ? (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                {ingredientError}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <TabButton active={libraryTab === "verified"} onClick={() => setLibraryTab("verified")}>
                Verified Library
              </TabButton>
              <TabButton active={libraryTab === "private"} onClick={() => setLibraryTab("private")}>
                My Ingredients
              </TabButton>
            </div>

            <div className="rounded-3xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                <input
                  value={ingredientSearch}
                  onChange={(e) => setIngredientSearch(e.target.value)}
                  placeholder={
                    libraryTab === "verified"
                      ? "Search verified ingredients..."
                      : "Search your private ingredients..."
                  }
                  className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder:text-gray-500"
                />

                {libraryTab === "private" ? (
                  <select
                    value={privateSort}
                    onChange={(e) =>
                      setPrivateSort(e.target.value as "az" | "newest" | "updated")
                    }
                    className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm font-semibold text-white"
                  >
                    <option value="az">Sort: A-Z</option>
                    <option value="newest">Sort: Newest</option>
                    <option value="updated">Sort: Recently Updated</option>
                  </select>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-gray-400">
                      {publicIngredients.length} verified
                    </div>
                    <Link
                      href="/recipes/admin"
                      className="rounded-2xl bg-gray-900 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-gray-700"
                    >
                      Admin
                    </Link>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {libraryTab === "verified" &&
                (filteredPublicIngredients.length > 0 ? (
                  filteredPublicIngredients.map((ingredient) => (
                    <article
                      key={ingredient.id}
                      className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2 className="text-sm font-semibold text-white">{ingredient.name}</h2>
                          <p className="mt-1 text-xs text-gray-400">
                            Ref {ingredient.reference_amount_g}g • {ingredient.reference_calories} kcal
                            • P {ingredient.reference_protein_g} • C {ingredient.reference_carbs_g}
                            • F {ingredient.reference_fat_g}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Per 100g: {ingredient.calories_per_100g} kcal • P{" "}
                            {ingredient.protein_per_100g} • C {ingredient.carbs_per_100g} • F{" "}
                            {ingredient.fat_per_100g}
                          </p>
                          {formatIngredientSummary(ingredient) ? (
                            <p className="mt-2 text-xs text-blue-200">
                              Saved helpers: {formatIngredientSummary(ingredient)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-gray-700 bg-gray-800/40 p-5 text-sm text-gray-400">
                    {publicIngredients.length === 0
                      ? "No verified ingredients are available yet."
                      : `No verified ingredients match "${ingredientSearch.trim()}".`}
                  </div>
                ))}

              {libraryTab === "private" &&
                (filteredPrivateIngredients.length > 0 ? (
                  filteredPrivateIngredients.map((ingredient) => (
                    <article
                      key={ingredient.id}
                      className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <h2 className="text-sm font-semibold text-white">{ingredient.name}</h2>
                          <p className="mt-1 text-xs text-gray-400">
                            Ref {ingredient.reference_amount_g}g • {ingredient.reference_calories} kcal • P{" "}
                            {ingredient.reference_protein_g} • C {ingredient.reference_carbs_g} • F{" "}
                            {ingredient.reference_fat_g}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Per 100g: {ingredient.calories_per_100g} kcal • P{" "}
                            {ingredient.protein_per_100g} • C {ingredient.carbs_per_100g} • F{" "}
                            {ingredient.fat_per_100g}
                          </p>
                          {formatIngredientSummary(ingredient) ? (
                            <p className="mt-2 text-xs text-blue-200">
                              Saved helpers: {formatIngredientSummary(ingredient)}
                            </p>
                          ) : null}
                        </div>

                        <Link
                          href="/recipes/create"
                          className="min-w-[96px] rounded-2xl bg-gray-900 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-gray-700"
                        >
                          Edit
                        </Link>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-gray-700 bg-gray-800/40 p-5 text-sm text-gray-400">
                    {privateIngredients.length === 0
                      ? "No private ingredients yet. Create one from the recipe builder to start your personal library."
                      : `No private ingredients match "${ingredientSearch.trim()}".`}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {!plannerPickerMode ? (
        <Link
          href="/recipes/create"
          className="fixed bottom-32 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-[20px] border-2 border-blue-300/45 bg-blue-600 text-3xl font-light text-white shadow-[0_18px_40px_rgba(37,99,235,0.35)] transition hover:bg-blue-700 sm:right-[calc(50%-12rem)]"
          aria-label="Create recipe"
        >
          +
        </Link>
      ) : null}
    </AppShell>
  );
}
