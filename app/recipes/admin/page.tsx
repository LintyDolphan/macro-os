"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import { getCurrentUser } from "../../lib/supabase/inventory-db";
import {
  deleteVerifiedIngredientForAdmin,
  listVerifiedIngredientsForAdmin,
  updateVerifiedIngredientForAdmin,
  type IngredientRecord,
} from "../../lib/supabase/ingredients-db";

function formatNumberInput(value: number | null) {
  return value == null ? "" : String(Number(value));
}

function optionalPositiveNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.NaN;
}

export default function RecipeIngredientAdminPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<IngredientRecord[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [referenceAmount, setReferenceAmount] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [cupGrams, setCupGrams] = useState("");
  const [tablespoonGrams, setTablespoonGrams] = useState("");
  const [teaspoonGrams, setTeaspoonGrams] = useState("");
  const [pieceGrams, setPieceGrams] = useState("");
  const [pieceLabel, setPieceLabel] = useState("");
  const [sourceNote, setSourceNote] = useState("");

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const user = await getCurrentUser();

        if (!user) {
          if (!active) return;
          setRedirecting(true);
          window.location.replace("/auth");
          return;
        }

        const verifiedIngredients = await listVerifiedIngredientsForAdmin(user.id);

        if (!active) return;
        setCurrentUserId(user.id);
        setIngredients(verifiedIngredients);
      } catch (loadError) {
        if (!active) return;
        console.error("Failed to load ingredient admin page:", loadError);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Verified ingredient manager could not be loaded."
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

  const filteredIngredients = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return ingredients;

    return ingredients.filter((ingredient) => {
      return (
        ingredient.name.toLowerCase().includes(query) ||
        (ingredient.source_note?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [ingredients, search]);

  function resetEditor() {
    setEditingId(null);
    setName("");
    setReferenceAmount("");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFat("");
    setCupGrams("");
    setTablespoonGrams("");
    setTeaspoonGrams("");
    setPieceGrams("");
    setPieceLabel("");
    setSourceNote("");
  }

  function startEditing(ingredient: IngredientRecord) {
    setEditingId(ingredient.id);
    setError(null);
    setMessage(null);
    setName(ingredient.name);
    setReferenceAmount(formatNumberInput(Number(ingredient.reference_amount_g)));
    setCalories(formatNumberInput(Number(ingredient.reference_calories)));
    setProtein(formatNumberInput(Number(ingredient.reference_protein_g)));
    setCarbs(formatNumberInput(Number(ingredient.reference_carbs_g)));
    setFat(formatNumberInput(Number(ingredient.reference_fat_g)));
    setCupGrams(formatNumberInput(ingredient.cup_g != null ? Number(ingredient.cup_g) : null));
    setTablespoonGrams(
      formatNumberInput(ingredient.tbsp_g != null ? Number(ingredient.tbsp_g) : null)
    );
    setTeaspoonGrams(
      formatNumberInput(ingredient.tsp_g != null ? Number(ingredient.tsp_g) : null)
    );
    setPieceGrams(formatNumberInput(ingredient.piece_g != null ? Number(ingredient.piece_g) : null));
    setPieceLabel(ingredient.piece_label ?? "");
    setSourceNote(ingredient.source_note ?? "");
  }

  async function saveVerifiedIngredient(ingredientId: string) {
    if (!currentUserId) return;

    const trimmedName = name.trim();
    const referenceAmountValue = Number(referenceAmount);
    const caloriesValue = Number(calories);
    const proteinValue = Number(protein);
    const carbsValue = Number(carbs);
    const fatValue = Number(fat);
    const cupValue = optionalPositiveNumber(cupGrams);
    const tablespoonValue = optionalPositiveNumber(tablespoonGrams);
    const teaspoonValue = optionalPositiveNumber(teaspoonGrams);
    const pieceValue = optionalPositiveNumber(pieceGrams);
    const pieceLabelValue = pieceLabel.trim();

    if (!trimmedName) {
      setError("Ingredient name is required.");
      return;
    }

    if (!Number.isFinite(referenceAmountValue) || referenceAmountValue <= 0) {
      setError("Reference amount must be greater than 0 grams.");
      return;
    }

    if (
      [caloriesValue, proteinValue, carbsValue, fatValue].some(
        (value) => !Number.isFinite(value) || value < 0
      )
    ) {
      setError("Macro values must be 0 or greater.");
      return;
    }

    if (
      [cupValue, tablespoonValue, teaspoonValue, pieceValue].some((value) =>
        Number.isNaN(value)
      )
    ) {
      setError("Conversion values must be blank or greater than 0.");
      return;
    }

    if ((pieceValue != null && !pieceLabelValue) || (pieceLabelValue && pieceValue == null)) {
      setError("Piece conversions need both a label and a gram value.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const updated = await updateVerifiedIngredientForAdmin(ingredientId, currentUserId, {
        name: trimmedName,
        reference_amount_g: referenceAmountValue,
        reference_calories: caloriesValue,
        reference_protein_g: proteinValue,
        reference_carbs_g: carbsValue,
        reference_fat_g: fatValue,
        cup_g: cupValue,
        tbsp_g: tablespoonValue,
        tsp_g: teaspoonValue,
        piece_g: pieceValue,
        piece_label: pieceLabelValue || null,
        source_note: sourceNote.trim() || null,
      });

      setIngredients((prev) =>
        prev
          .map((ingredient) => (ingredient.id === ingredientId ? updated : ingredient))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      resetEditor();
      setMessage(`Updated "${updated.name}".`);
    } catch (saveError) {
      console.error("Failed to update verified ingredient:", saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Verified ingredient could not be updated."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteVerifiedIngredient(ingredient: IngredientRecord) {
    if (!currentUserId) return;

    const confirmed = window.confirm(
      `Delete "${ingredient.name}" from the verified ingredient library? Linked recipes may become unlinked.`
    );

    if (!confirmed) return;

    try {
      setSaving(true);
      setError(null);
      setMessage(null);
      await deleteVerifiedIngredientForAdmin(ingredient.id, currentUserId);
      setIngredients((prev) => prev.filter((item) => item.id !== ingredient.id));
      if (editingId === ingredient.id) {
        resetEditor();
      }
      setMessage(`Deleted "${ingredient.name}".`);
    } catch (deleteError) {
      console.error("Failed to delete verified ingredient:", deleteError);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Verified ingredient could not be deleted."
      );
    } finally {
      setSaving(false);
    }
  }

  if (redirecting || !authChecked) {
    return (
      <AppShell
        title="Verified Manager"
        subtitle="Temporary admin tools for the ingredient library"
        backHref="/recipes"
        backLabel="Recipes"
      >
        <div className="text-sm text-gray-400">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Verified Manager"
      subtitle="Temporary admin tools for the ingredient library"
      backHref="/recipes"
      backLabel="Recipes"
    >
      <div className="space-y-4 pb-16">
        <section className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-5 shadow-sm">
          <div className="text-xs uppercase tracking-[0.18em] text-amber-200/80">Temporary Admin</div>
          <h2 className="mt-2 text-xl font-bold text-white">Verified Ingredient Manager</h2>
          <p className="mt-2 text-sm text-gray-300">
            Use this page while you bulk-build the verified database, then remove it later if you want to go back to direct SQL-only maintenance.
          </p>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {message}
          </div>
        ) : null}

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-white">Verified Ingredients</div>
            <div className="text-xs text-gray-500">{ingredients.length} tracked</div>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search verified ingredients..."
            className="mt-3 w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder:text-gray-500"
          />
        </section>

        <div className="space-y-3">
          {filteredIngredients.length > 0 ? (
            filteredIngredients.map((ingredient) => {
              const isEditing = editingId === ingredient.id;

              return (
                <section
                  key={ingredient.id}
                  className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm"
                >
                  {!isEditing ? (
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold text-white">{ingredient.name}</h3>
                          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
                            Verified
                          </span>
                          {ingredient.user_id ? (
                            <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold text-blue-200">
                              Test-owned
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-xs text-gray-400">
                          Ref {ingredient.reference_amount_g}g • {ingredient.reference_calories} kcal • P{" "}
                          {ingredient.reference_protein_g} • C {ingredient.reference_carbs_g} • F{" "}
                          {ingredient.reference_fat_g}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Per 100g: {ingredient.calories_per_100g} kcal • P {ingredient.protein_per_100g} • C{" "}
                          {ingredient.carbs_per_100g} • F {ingredient.fat_per_100g}
                        </p>
                        {ingredient.source_note ? (
                          <p className="mt-2 text-xs text-blue-200">Source: {ingredient.source_note}</p>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEditing(ingredient)}
                          disabled={saving}
                          className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteVerifiedIngredient(ingredient)}
                          disabled={saving}
                          className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-base font-semibold text-white">Edit Verified Ingredient</div>
                        <button
                          type="button"
                          onClick={resetEditor}
                          disabled={saving}
                          className="rounded-2xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="mb-1 block text-sm text-gray-300">Ingredient name</label>
                          <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="mb-1 block text-sm text-gray-300">Reference amount (g)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={referenceAmount}
                            onChange={(e) => setReferenceAmount(e.target.value)}
                            className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm text-gray-300">Calories</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={calories}
                            onChange={(e) => setCalories(e.target.value)}
                            className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm text-gray-300">Protein (g)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={protein}
                            onChange={(e) => setProtein(e.target.value)}
                            className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm text-gray-300">Carbs (g)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={carbs}
                            onChange={(e) => setCarbs(e.target.value)}
                            className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm text-gray-300">Fat (g)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={fat}
                            onChange={(e) => setFat(e.target.value)}
                            className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm text-gray-300">Cup (g)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={cupGrams}
                            onChange={(e) => setCupGrams(e.target.value)}
                            className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm text-gray-300">Tbsp (g)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={tablespoonGrams}
                            onChange={(e) => setTablespoonGrams(e.target.value)}
                            className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm text-gray-300">Tsp (g)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={teaspoonGrams}
                            onChange={(e) => setTeaspoonGrams(e.target.value)}
                            className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm text-gray-300">Piece (g)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={pieceGrams}
                            onChange={(e) => setPieceGrams(e.target.value)}
                            className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="mb-1 block text-sm text-gray-300">Piece label</label>
                          <input
                            value={pieceLabel}
                            onChange={(e) => setPieceLabel(e.target.value)}
                            placeholder="e.g. scoop, slice, breast"
                            className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="mb-1 block text-sm text-gray-300">Source note</label>
                          <input
                            value={sourceNote}
                            onChange={(e) => setSourceNote(e.target.value)}
                            placeholder="e.g. USDA, label, manual research"
                            className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => saveVerifiedIngredient(ingredient.id)}
                        disabled={saving}
                        className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save Verified Ingredient"}
                      </button>
                    </div>
                  )}
                </section>
              );
            })
          ) : (
            <div className="rounded-3xl border border-dashed border-gray-700 bg-gray-800/40 p-5 text-sm text-gray-400">
              {ingredients.length === 0
                ? "No verified ingredients yet."
                : `No verified ingredients match "${search.trim()}".`}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
