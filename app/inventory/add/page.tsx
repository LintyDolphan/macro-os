"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "../../components/AppShell";
import {
  createBarcodeProduct,
  findBarcodeProductByBarcode,
  type BarcodeProductRecord,
} from "../../lib/supabase/barcode-products-db";
import {
  createIngredient,
  listVisibleIngredients,
  type IngredientRecord,
  type IngredientType,
} from "../../lib/supabase/ingredients-db";
import {
  createInventoryEvent,
  createInventoryItem,
  getCurrentUser,
  type InventoryLocation,
} from "../../lib/supabase/inventory-db";

const LOCATION_OPTIONS: InventoryLocation[] = [
  "pantry",
  "fridge",
  "freezer",
  "snacks",
  "supplements",
  "other",
];

const INTAKE_MODES = [
  {
    key: "existing",
    label: "Existing",
    title: "Use Existing Ingredient",
    description: "Pick something already in your ingredient library and add it into inventory.",
  },
  {
    key: "manual",
    label: "Manual",
    title: "Create Ingredient",
    description: "Enter nutrition once so recipes, inventory, and future suggestions all use it.",
  },
  {
    key: "barcode",
    label: "Barcode",
    title: "Barcode Intake",
    description: "Scan a packaged food, then save the barcode and ingredient together.",
  },
] as const;

type IntakeMode = (typeof INTAKE_MODES)[number]["key"];

function formatLocationLabel(location: InventoryLocation) {
  return location.charAt(0).toUpperCase() + location.slice(1);
}

function formatProductSummary(product: BarcodeProductRecord) {
  const parts = [
    product.brand?.trim(),
    `${Number(product.serving_amount)} ${product.serving_unit}`.trim(),
    `${Number(product.calories)} kcal`,
    `P ${Number(product.protein_g)} • C ${Number(product.carbs_g)} • F ${Number(product.fat_g)}`,
  ].filter(Boolean);

  return parts.join(" • ");
}

function buildScannerHref() {
  const params = new URLSearchParams({
    context: "inventory-add",
    returnTo: "/inventory/add",
  });

  return `/scan?${params.toString()}`;
}

function buildLabelScannerHref() {
  const params = new URLSearchParams({
    context: "ingredient",
    mode: "label",
    returnTo: "/inventory/add",
  });

  return `/scan?${params.toString()}`;
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function InventoryAddPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scannedBarcode = searchParams.get("scannedBarcode")?.trim() ?? "";
  const scannedFormat = searchParams.get("scannedFormat")?.trim() ?? "";
  const labelScanned = searchParams.get("labelScanned")?.trim() === "1";
  const labelCalories = searchParams.get("labelCalories")?.trim() ?? "";
  const labelProtein = searchParams.get("labelProtein")?.trim() ?? "";
  const labelCarbs = searchParams.get("labelCarbs")?.trim() ?? "";
  const labelFat = searchParams.get("labelFat")?.trim() ?? "";
  const prefillName = searchParams.get("prefillName")?.trim() ?? "";
  const returnTo = searchParams.get("returnTo")?.trim() || "/inventory";

  const initialMode: IntakeMode = scannedBarcode
    ? "barcode"
    : prefillName
      ? "manual"
      : "existing";

  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<IntakeMode>(initialMode);
  const [ingredients, setIngredients] = useState<IngredientRecord[]>([]);
  const [ingredientSearch, setIngredientSearch] = useState(prefillName);
  const [selectedIngredientId, setSelectedIngredientId] = useState<string | null>(null);
  const [name, setName] = useState(prefillName);
  const [referenceAmountG, setReferenceAmountG] = useState("100");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [ingredientType, setIngredientType] = useState<IngredientType>(
    scannedBarcode ? "packaged" : "raw"
  );
  const [sourceNote, setSourceNote] = useState("");
  const [addToInventory, setAddToInventory] = useState(prefillName ? false : true);
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("count");
  const [location, setLocation] = useState<InventoryLocation>("pantry");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [autoAddingMatch, setAutoAddingMatch] = useState(false);
  const [matchedProduct, setMatchedProduct] = useState<BarcodeProductRecord | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [lastAppliedBarcode, setLastAppliedBarcode] = useState<string | null>(null);

  const scannerHref = useMemo(() => buildScannerHref(), []);
  const labelScannerHref = useMemo(() => buildLabelScannerHref(), []);

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

        const library = await listVisibleIngredients(user.id);

        if (!active) return;
        setUserId(user.id);
        setIngredients(library);
      } catch (initError) {
        if (!active) return;
        console.error("Failed to initialize inventory intake page:", initError);
        setError(
          initError instanceof Error
            ? initError.message
            : "Inventory intake page could not be loaded."
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

  useEffect(() => {
    if (!prefillName) return;

    setName((current) => current.trim() || prefillName);
    setIngredientSearch((current) => current.trim() || prefillName);
    setMode((current) => (current === "barcode" ? current : "manual"));
    setAddToInventory(false);
  }, [prefillName]);

  useEffect(() => {
    if (!scannedBarcode) return;
    setMode("barcode");
    setIngredientType("packaged");
  }, [scannedBarcode]);

  useEffect(() => {
    if (!labelScanned) return;

    setMode((current) => (current === "existing" ? "manual" : current));
    setCalories((current) => current.trim() || labelCalories);
    setProtein((current) => current.trim() || labelProtein);
    setCarbs((current) => current.trim() || labelCarbs);
    setFat((current) => current.trim() || labelFat);
    setIngredientType("packaged");
    setMessage("Nutrition label parsed. Review the values, then save the ingredient.");
  }, [labelCalories, labelCarbs, labelFat, labelProtein, labelScanned]);

  const filteredIngredients = useMemo(() => {
    const query = ingredientSearch.trim().toLowerCase();
    const items = query
      ? ingredients.filter((ingredient) => ingredient.name.toLowerCase().includes(query))
      : ingredients;

    return items.slice(0, 8);
  }, [ingredientSearch, ingredients]);

  const selectedIngredient = useMemo(
    () => ingredients.find((ingredient) => ingredient.id === selectedIngredientId) ?? null,
    [ingredients, selectedIngredientId]
  );

  const addMatchedProductToInventory = useCallback(async (product: BarcodeProductRecord) => {
    if (!userId) return;

    const itemQuantity =
      product.package_amount != null && Number(product.package_amount) > 0
        ? Number(product.package_amount)
        : 1;
    const itemUnit = product.package_unit || product.serving_unit || "count";
    const itemLocation: InventoryLocation = "snacks";
    const itemNotes = [
      product.brand ? `Brand: ${product.brand}` : null,
      `Barcode: ${product.barcode}`,
      scannedFormat ? `Barcode format: ${scannedFormat}` : null,
      product.notes?.trim() || null,
    ]
      .filter(Boolean)
      .join("\n");

    const item = await createInventoryItem(userId, {
      name: product.name,
      linked_ingredient_id: product.linked_ingredient_id,
      quantity: itemQuantity,
      unit: itemUnit,
      location: itemLocation,
      notes: itemNotes,
    });

    await createInventoryEvent(userId, {
      inventory_item_id: item.id,
      source_type: "barcode_scan",
      event_type: "add",
      quantity_delta: Number(item.quantity),
      quantity_after: Number(item.quantity),
      unit: item.unit,
      source_label: `Barcode add • ${product.name}`,
      notes: item.notes,
    });

    setName("");
    setIngredientSearch("");
    setQuantity("1");
    setUnit("count");
    setLocation("pantry");
    setNotes("");
    setMatchedProduct(product);
    setScanMessage(null);
    setLastAppliedBarcode(product.barcode);
    setMessage(`Added ${product.name} to ${formatLocationLabel(item.location)} inventory from barcode scan.`);
    router.replace("/inventory/add");
    window.setTimeout(() => setMessage(null), 2200);
  }, [router, scannedFormat, userId]);

  useEffect(() => {
    if (!userId || !scannedBarcode || scannedBarcode === lastAppliedBarcode) return;

    let active = true;

    async function applyScannedBarcode() {
      try {
        setLookupBusy(true);
        setError(null);
        setMatchedProduct(null);
        setScanMessage(null);

        const product = await findBarcodeProductByBarcode(scannedBarcode, userId ?? undefined);

        if (!active) return;
        setLastAppliedBarcode(scannedBarcode);

        if (product) {
          setAutoAddingMatch(true);
          await addMatchedProductToInventory(product);
          return;
        }

        setMatchedProduct(null);
        setName((current) => current.trim() || prefillName);
        setIngredientType("packaged");
        setUnit((current) => current.trim() || "count");
        setLocation("snacks");
        setNotes((current) => {
          if (current.includes(scannedBarcode)) return current;
          return current.trim()
            ? `${current.trim()}\nBarcode: ${scannedBarcode}`
            : `Barcode: ${scannedBarcode}`;
        });
        setScanMessage(
          `No saved barcode product was found for ${scannedBarcode}. Finish the ingredient details below and Macro OS will save it for next time.`
        );
      } catch (lookupError) {
        if (!active) return;
        console.error("Failed to apply scanned barcode:", lookupError);
        setError(
          lookupError instanceof Error
            ? lookupError.message
            : "Scanned barcode could not be looked up."
        );
      } finally {
        if (active) {
          setLookupBusy(false);
          setAutoAddingMatch(false);
        }
      }
    }

    void applyScannedBarcode();

    return () => {
      active = false;
    };
  }, [addMatchedProductToInventory, lastAppliedBarcode, prefillName, scannedBarcode, userId]);

  function chooseExistingIngredient(ingredient: IngredientRecord) {
    setSelectedIngredientId(ingredient.id);
    setName(ingredient.name);
    setIngredientSearch(ingredient.name);
    setMode("existing");
    setAddToInventory(true);
    setError(null);
  }

  async function saveInventoryRecord(params: {
    ingredientId: string | null;
    inventoryName: string;
    sourceType: "manual_add" | "barcode_scan";
    sourceLabel: string;
    extraNotes?: string | null;
  }) {
    if (!userId || !addToInventory) return null;

    const parsedQuantity = parsePositiveNumber(quantity);
    if (parsedQuantity == null) {
      throw new Error("Quantity must be greater than 0 to add this into inventory.");
    }

    const trimmedUnit = unit.trim();
    if (!trimmedUnit) {
      throw new Error("Unit is required to add this into inventory.");
    }

    const finalNotes = [notes.trim() || null, params.extraNotes ?? null].filter(Boolean).join("\n");

    const item = await createInventoryItem(userId, {
      name: params.inventoryName,
      linked_ingredient_id: params.ingredientId,
      quantity: parsedQuantity,
      unit: trimmedUnit,
      location,
      notes: finalNotes || null,
    });

    await createInventoryEvent(userId, {
      inventory_item_id: item.id,
      source_type: params.sourceType,
      event_type: "add",
      quantity_delta: Number(item.quantity),
      quantity_after: Number(item.quantity),
      unit: item.unit,
      source_label: params.sourceLabel,
      notes: item.notes,
    });

    return item;
  }

  async function onSaveItem() {
    if (!userId) return;

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      if (mode === "existing") {
        if (!selectedIngredient) {
          throw new Error("Choose an ingredient from your library first.");
        }

        const item = await saveInventoryRecord({
          ingredientId: selectedIngredient.id,
          inventoryName: selectedIngredient.name,
          sourceType: scannedBarcode ? "barcode_scan" : "manual_add",
          sourceLabel: scannedBarcode
            ? `Barcode-linked add • ${selectedIngredient.name}`
            : `Library add • ${selectedIngredient.name}`,
          extraNotes: scannedBarcode ? `Barcode: ${scannedBarcode}` : null,
        });

        if (!item) {
          throw new Error("Existing ingredients need to be added into inventory from this screen.");
        }

        setMessage(`Added ${selectedIngredient.name} to ${formatLocationLabel(item.location)} inventory.`);
      } else {
        const trimmedName = name.trim();
        if (!trimmedName) {
          throw new Error("Ingredient name is required.");
        }

        const parsedReferenceAmount = parsePositiveNumber(referenceAmountG);
        if (parsedReferenceAmount == null) {
          throw new Error("Reference amount must be greater than 0 grams.");
        }

        const parsedCalories = parseNonNegativeNumber(calories);
        const parsedProtein = parseNonNegativeNumber(protein);
        const parsedCarbs = parseNonNegativeNumber(carbs);
        const parsedFat = parseNonNegativeNumber(fat);

        if (
          parsedCalories == null ||
          parsedProtein == null ||
          parsedCarbs == null ||
          parsedFat == null
        ) {
          throw new Error("Calories, protein, carbs, and fat must be 0 or greater.");
        }

        const ingredient = await createIngredient(userId, {
          name: trimmedName,
          reference_amount_g: parsedReferenceAmount,
          reference_calories: parsedCalories,
          reference_protein_g: parsedProtein,
          reference_carbs_g: parsedCarbs,
          reference_fat_g: parsedFat,
          ingredient_type: ingredientType,
          visibility: "private",
          verification_status: "custom",
          source_note:
            sourceNote.trim() ||
            (mode === "barcode"
              ? "Created from inventory barcode intake."
              : "Created from inventory manual intake."),
        });

        let savedBarcodeProduct: BarcodeProductRecord | null = null;

        if (mode === "barcode" && scannedBarcode) {
          savedBarcodeProduct = await createBarcodeProduct(userId, {
            linked_ingredient_id: ingredient.id,
            barcode: scannedBarcode,
            name: ingredient.name,
            serving_amount: parsedReferenceAmount,
            serving_unit: "g",
            package_amount: addToInventory ? parsePositiveNumber(quantity) : null,
            package_unit: addToInventory ? unit.trim() || null : null,
            calories: parsedCalories,
            protein_g: parsedProtein,
            carbs_g: parsedCarbs,
            fat_g: parsedFat,
            source_type: "barcode_scan",
            notes: [notes.trim() || null, sourceNote.trim() || null].filter(Boolean).join("\n") || null,
            visibility: "private",
            verification_status: "custom",
          });
        }

        const item = await saveInventoryRecord({
          ingredientId: ingredient.id,
          inventoryName: ingredient.name,
          sourceType: mode === "barcode" ? "barcode_scan" : "manual_add",
          sourceLabel:
            mode === "barcode"
              ? `Barcode intake • ${ingredient.name}`
              : `Ingredient intake • ${ingredient.name}`,
          extraNotes:
            mode === "barcode" && scannedBarcode
              ? `Barcode: ${scannedBarcode}`
              : null,
        });

        setIngredients((prev) => [...prev, ingredient].sort((a, b) => a.name.localeCompare(b.name)));
        setSelectedIngredientId(ingredient.id);
        setMessage(
          item
            ? savedBarcodeProduct
              ? `Saved ${ingredient.name} as an ingredient, stored its barcode, and added it to ${formatLocationLabel(item.location)} inventory.`
              : `Saved ${ingredient.name} as an ingredient and added it to ${formatLocationLabel(item.location)} inventory.`
            : savedBarcodeProduct
              ? `Saved ${ingredient.name} as an ingredient and barcode-linked product.`
              : `Saved ${ingredient.name} to your ingredient library.`
        );
      }

      setIngredientSearch("");
      setName("");
      setSelectedIngredientId(null);
      setReferenceAmountG("100");
      setCalories("");
      setProtein("");
      setCarbs("");
      setFat("");
      setSourceNote("");
      setQuantity("1");
      setUnit("count");
      setLocation("pantry");
      setNotes("");
      setMatchedProduct(null);
      setScanMessage(null);
      setLastAppliedBarcode(null);
      router.replace("/inventory/add");
      window.setTimeout(() => setMessage(null), 2600);
    } catch (saveError) {
      console.error("Failed to save inventory intake:", saveError);
      setError(
        saveError instanceof Error ? saveError.message : "Inventory intake could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }

  if (redirecting || !authChecked) {
    return (
      <AppShell
        title="Ingredient Intake"
        subtitle="Create ingredients and optionally stock them at home"
        backHref={returnTo}
        backLabel="Inventory"
      >
        <div className="text-sm text-gray-400">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Ingredient Intake"
      subtitle={
        prefillName
          ? "Create a reusable ingredient from your recipe handoff"
          : "Bring new foods into Macro OS from one place"
      }
      backHref={returnTo}
      backLabel="Inventory"
    >
      <div className="space-y-4">
        {prefillName ? (
          <section className="rounded-3xl border border-blue-500/30 bg-blue-500/10 p-4 shadow-sm">
            <div className="text-sm font-semibold text-blue-100">Recipe handoff</div>
            <div className="mt-1 text-sm text-blue-100/80">
              Save this as an ingredient here, then head back to the recipe builder and pick it from search.
            </div>
          </section>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <div className="text-xs uppercase tracking-[0.18em] text-emerald-300/80">Ingredient Intake</div>
          <h2 className="mt-2 text-xl font-bold text-white">Inventory is now the intake system</h2>
          <p className="mt-2 text-sm text-gray-400">
            Create ingredients here first, then optionally place them into your pantry, fridge, freezer, or snack inventory.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {INTAKE_MODES.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setMode(entry.key)}
                className={`rounded-2xl border px-3 py-3 text-left transition ${
                  mode === entry.key
                    ? "border-blue-400/50 bg-blue-500/15 text-white"
                    : "border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-850"
                }`}
              >
                <div className="text-sm font-semibold">{entry.label}</div>
                <div className="mt-1 text-[11px] leading-4 text-gray-400">{entry.description}</div>
              </button>
            ))}
          </div>
        </section>

        {mode === "existing" ? (
          <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">Choose Existing Ingredient</div>
                <div className="mt-1 text-sm text-gray-400">
                  Best for foods already in your verified or private ingredient library.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMode("manual")}
                className="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700"
              >
                New Ingredient
              </button>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-sm text-gray-300">Search ingredient library</label>
              <input
                value={ingredientSearch}
                onChange={(e) => setIngredientSearch(e.target.value)}
                placeholder="Chicken breast, rice, olive oil..."
                className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
              />
            </div>

            <div className="mt-4 space-y-2">
              {filteredIngredients.length > 0 ? (
                filteredIngredients.map((ingredient) => (
                  <button
                    key={ingredient.id}
                    type="button"
                    onClick={() => chooseExistingIngredient(ingredient)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedIngredientId === ingredient.id
                        ? "border-emerald-400/40 bg-emerald-500/10"
                        : "border-gray-700 bg-gray-900 hover:bg-gray-850"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">{ingredient.name}</div>
                      <div className="text-[11px] uppercase tracking-[0.16em] text-gray-500">
                        {ingredient.visibility}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-gray-400">
                      Ref {Number(ingredient.reference_amount_g)}g • {Number(ingredient.reference_calories)} kcal •
                      P {Number(ingredient.reference_protein_g)} • C {Number(ingredient.reference_carbs_g)} • F {Number(ingredient.reference_fat_g)}
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl bg-gray-900 p-4 text-sm text-gray-400">
                  No ingredient matches yet. Switch to Manual or Barcode to create one.
                </div>
              )}
            </div>
          </section>
        ) : null}

        {mode === "barcode" ? (
          <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">Barcode Intake</div>
                <div className="mt-1 text-sm text-gray-400">
                  Scan packaged foods first. If Macro OS knows the barcode already, it will add it immediately.
                </div>
              </div>
              <Link
                href={scannerHref}
                className="rounded-2xl border border-blue-400/40 bg-blue-500/15 px-4 py-3 text-sm font-semibold text-blue-100 transition hover:border-blue-300/60 hover:bg-blue-500/25"
              >
                Scan Barcode
              </Link>
            </div>

            {lookupBusy ? (
              <div className="mt-4 rounded-2xl border border-gray-700 bg-gray-900/80 p-4 text-sm text-gray-300">
                {autoAddingMatch ? "Match found. Adding it to inventory..." : "Looking up barcode..."}
              </div>
            ) : null}

            {scanMessage ? (
              <div className="mt-4 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-100">
                {scanMessage}
              </div>
            ) : null}

            {matchedProduct ? (
              <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="text-sm font-semibold text-white">{matchedProduct.name}</div>
                <div className="mt-1 text-xs text-emerald-100/80">{formatProductSummary(matchedProduct)}</div>
                <div className="mt-2 text-xs text-emerald-100/70">
                  Barcode: {matchedProduct.barcode}
                  {scannedFormat ? ` • ${scannedFormat}` : ""}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {mode !== "existing" ? (
          <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">
                  {mode === "barcode" ? "Create Canonical Ingredient" : "Ingredient Details"}
                </div>
                <div className="mt-1 text-sm text-gray-400">
                  These values become the reusable ingredient record recipes and future scans can rely on.
                </div>
              </div>
              <Link
                href={labelScannerHref}
                className="rounded-2xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/60 hover:bg-emerald-500/25"
              >
                Scan Label
              </Link>
            </div>

            <div className="mt-4 grid gap-3">
              <div>
                <label className="mb-1 block text-sm text-gray-300">Ingredient name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Reference amount (g)</label>
                  <input
                    value={referenceAmountG}
                    onChange={(e) => setReferenceAmountG(e.target.value)}
                    className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Ingredient type</label>
                  <select
                    value={ingredientType}
                    onChange={(e) => setIngredientType(e.target.value as IngredientType)}
                    className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                  >
                    <option value="raw">Raw ingredient</option>
                    <option value="packaged">Packaged item</option>
                    <option value="custom">Custom entry</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Calories</label>
                  <input
                    value={calories}
                    onChange={(e) => setCalories(e.target.value)}
                    className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Protein (g)</label>
                  <input
                    value={protein}
                    onChange={(e) => setProtein(e.target.value)}
                    className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Carbs (g)</label>
                  <input
                    value={carbs}
                    onChange={(e) => setCarbs(e.target.value)}
                    className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Fat (g)</label>
                  <input
                    value={fat}
                    onChange={(e) => setFat(e.target.value)}
                    className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm text-gray-300">Source note</label>
                <input
                  value={sourceNote}
                  onChange={(e) => setSourceNote(e.target.value)}
                  placeholder="USDA, package label, brand website..."
                  className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                />
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">Stock It At Home</div>
              <div className="mt-1 text-sm text-gray-400">
                Optional for new ingredients. Keep this off for recipe-only ingredients you do not want in inventory yet.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAddToInventory((current) => !current)}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                addToInventory
                  ? "bg-emerald-500 text-white hover:bg-emerald-400"
                  : "bg-gray-900 text-gray-200 hover:bg-gray-700"
              }`}
            >
              {addToInventory ? "Adding To Inventory" : "Ingredient Only"}
            </button>
          </div>

          {addToInventory ? (
            <div className="mt-4 grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Quantity</label>
                  <input
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm text-gray-300">Unit</label>
                  <input
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="count, g, ml..."
                    className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm text-gray-300">Location</label>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value as InventoryLocation)}
                  className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                >
                  {LOCATION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {formatLocationLabel(option)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <label className="mb-1 block text-sm text-gray-300">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
            />
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onSaveItem}
            disabled={saving || autoAddingMatch}
            className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : mode === "existing"
                ? "Add From Library"
                : addToInventory
                  ? "Save Ingredient And Stock"
                  : "Save Ingredient"}
          </button>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </AppShell>
  );
}

export default function InventoryAddPage() {
  return (
    <Suspense
      fallback={
        <AppShell
          title="Ingredient Intake"
          subtitle="Create ingredients and optionally stock them at home"
          backHref="/inventory"
          backLabel="Inventory"
        >
          <div className="text-sm text-gray-400">Loading...</div>
        </AppShell>
      }
    >
      <InventoryAddPageContent />
    </Suspense>
  );
}
