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

function InventoryAddPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scannedBarcode = searchParams.get("scannedBarcode")?.trim() ?? "";
  const scannedFormat = searchParams.get("scannedFormat")?.trim() ?? "";

  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
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

        if (!active) return;
        setUserId(user.id);
      } catch (initError) {
        if (!active) return;
        console.error("Failed to initialize inventory add page:", initError);
        setError(
          initError instanceof Error
            ? initError.message
            : "Inventory add page could not be loaded."
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
        setName((current) => current.trim());
        setNotes((current) => {
          if (current.includes(scannedBarcode)) return current;
          return current.trim()
            ? `${current.trim()}\nBarcode: ${scannedBarcode}`
            : `Barcode: ${scannedBarcode}`;
        });
        setScanMessage(
          `No saved barcode product was found for ${scannedBarcode}. You can still finish this item manually.`
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
  }, [addMatchedProductToInventory, lastAppliedBarcode, scannedBarcode, userId]);

  async function onSaveItem() {
    if (!userId) return;

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const parsedQuantity = Number(quantity);
      const finalNotes = [
        notes.trim() || null,
        matchedProduct ? `Linked barcode product: ${matchedProduct.name}` : null,
        !matchedProduct && scannedBarcode ? `Scanned barcode: ${scannedBarcode}` : null,
        scannedFormat ? `Barcode format: ${scannedFormat}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      let savedBarcodeProduct = matchedProduct;

      if (scannedBarcode && !matchedProduct) {
        savedBarcodeProduct = await createBarcodeProduct(userId, {
          barcode: scannedBarcode,
          name,
          serving_amount: 1,
          serving_unit: unit || "count",
          package_amount:
            Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : null,
          package_unit:
            Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? unit || "count" : null,
          source_type: "barcode_scan",
          notes: finalNotes || "Created from inventory barcode scan.",
          visibility: "private",
          verification_status: "custom",
        });
      }

      const item = await createInventoryItem(userId, {
        name,
        quantity: Number.isFinite(parsedQuantity) ? parsedQuantity : 0,
        unit,
        location,
        notes: finalNotes,
      });

      await createInventoryEvent(userId, {
        inventory_item_id: item.id,
        source_type: savedBarcodeProduct || scannedBarcode ? "barcode_scan" : "manual_add",
        event_type: "add",
        quantity_delta: Number(item.quantity),
        quantity_after: Number(item.quantity),
        unit: item.unit,
        source_label: savedBarcodeProduct
          ? `Barcode add • ${savedBarcodeProduct.name}`
          : scannedBarcode
            ? "Barcode add"
            : "Manual inventory add",
        notes: item.notes,
      });

      setName("");
      setQuantity("1");
      setUnit("count");
      setLocation("pantry");
      setNotes("");
      setMatchedProduct(null);
      setScanMessage(null);
      setLastAppliedBarcode(null);
      setMessage(
        savedBarcodeProduct && !matchedProduct
          ? `Added ${item.name} to ${formatLocationLabel(item.location)} inventory and saved its barcode for next time.`
          : `Added ${item.name} to ${formatLocationLabel(item.location)} inventory.`
      );
      router.replace("/inventory/add");
      window.setTimeout(() => setMessage(null), 2200);
    } catch (saveError) {
      console.error("Failed to save inventory item:", saveError);
      setError(
        saveError instanceof Error ? saveError.message : "Inventory item could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }

  if (redirecting || !authChecked) {
    return (
      <AppShell
        title="Add Item"
        subtitle="Manually add or adjust inventory"
        backHref="/inventory"
        backLabel="Inventory"
      >
        <div className="text-sm text-gray-400">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Add Item"
      subtitle="Manually add or adjust inventory"
      backHref="/inventory"
      backLabel="Inventory"
    >
      <div className="space-y-4">
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
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-white">Scan Or Add Manually</div>
              <div className="mt-1 text-sm text-gray-400">
                Scan a packaged item first, then review and save it into inventory.
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
              <div className="mt-1 text-xs text-emerald-100/80">
                {formatProductSummary(matchedProduct)}
              </div>
              <div className="mt-2 text-xs text-emerald-100/70">
                Barcode: {matchedProduct.barcode}
                {scannedFormat ? ` • ${scannedFormat}` : ""}
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-sm text-gray-300">Item name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
              />
            </div>

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
                  className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                  placeholder="count, g, ml..."
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

            <div>
              <label className="mb-1 block text-sm text-gray-300">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
              />
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onSaveItem}
            disabled={saving || autoAddingMatch}
            className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Item"}
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
          title="Add Item"
          subtitle="Manually add or adjust inventory"
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
