"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import AppShell from "../../../components/AppShell";
import {
  adjustInventoryItemQuantity,
  getCurrentUser,
  getInventoryItem,
  listInventoryEvents,
  updateInventoryItem,
  type InventoryEventRecord,
  type InventoryItemRecord,
  type InventoryLocation,
} from "../../../lib/supabase/inventory-db";

const locationOptions: InventoryLocation[] = [
  "fridge",
  "freezer",
  "pantry",
  "snacks",
  "supplements",
  "other",
];

function formatLocationLabel(location: InventoryLocation) {
  return location.charAt(0).toUpperCase() + location.slice(1);
}

function formatEventTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function formatEventQuantity(event: InventoryEventRecord) {
  const delta = Number(event.quantity_delta);
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta} ${event.unit}`;
}

export default function InventoryItemDetailPage() {
  const params = useParams<{ id: string }>();
  const itemId = params.id;
  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [item, setItem] = useState<InventoryItemRecord | null>(null);
  const [events, setEvents] = useState<InventoryEventRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [location, setLocation] = useState<InventoryLocation>("pantry");
  const [minQuantity, setMinQuantity] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [notes, setNotes] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustMode, setAdjustMode] = useState<"add" | "use">("add");

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

        if (!itemId) {
          throw new Error("Inventory item could not be found.");
        }

        const [loadedItem, loadedEvents] = await Promise.all([
          getInventoryItem(itemId),
          listInventoryEvents({ itemId, limit: 12 }),
        ]);

        if (!active) return;

        setUserId(user.id);
        setItem(loadedItem);
        setEvents(loadedEvents);
        setName(loadedItem.name);
        setQuantity(String(Number(loadedItem.quantity)));
        setUnit(loadedItem.unit);
        setLocation(loadedItem.location);
        setMinQuantity(
          loadedItem.min_quantity == null ? "" : String(Number(loadedItem.min_quantity))
        );
        setExpirationDate(loadedItem.expiration_date ?? "");
        setNotes(loadedItem.notes ?? "");
        setError(null);
      } catch (loadError) {
        if (!active) return;
        console.error("Failed to initialize inventory item detail:", loadError);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Inventory item detail could not be loaded."
        );
      } finally {
        if (active) setAuthChecked(true);
      }
    }

    void init();

    return () => {
      active = false;
    };
  }, [itemId]);

  const recentSummary = useMemo(() => {
    if (!item) return null;

    const parts = [
      `${Number(item.quantity)} ${item.unit}`,
      formatLocationLabel(item.location),
      item.expiration_date
        ? `Expires ${new Date(item.expiration_date).toLocaleDateString()}`
        : null,
    ].filter(Boolean);

    return parts.join(" • ");
  }, [item]);

  async function refreshItem(nextItem?: InventoryItemRecord) {
    if (!itemId) return;

    if (nextItem) {
      setItem(nextItem);
      setName(nextItem.name);
      setQuantity(String(Number(nextItem.quantity)));
      setUnit(nextItem.unit);
      setLocation(nextItem.location);
      setMinQuantity(
        nextItem.min_quantity == null ? "" : String(Number(nextItem.min_quantity))
      );
      setExpirationDate(nextItem.expiration_date ?? "");
      setNotes(nextItem.notes ?? "");
    } else {
      const latestItem = await getInventoryItem(itemId);
      setItem(latestItem);
      setName(latestItem.name);
      setQuantity(String(Number(latestItem.quantity)));
      setUnit(latestItem.unit);
      setLocation(latestItem.location);
      setMinQuantity(
        latestItem.min_quantity == null ? "" : String(Number(latestItem.min_quantity))
      );
      setExpirationDate(latestItem.expiration_date ?? "");
      setNotes(latestItem.notes ?? "");
    }

    const latestEvents = await listInventoryEvents({ itemId, limit: 12 });
    setEvents(latestEvents);
  }

  async function handleSave() {
    if (!item) return;

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const updated = await updateInventoryItem(item.id, {
        name,
        quantity: Number(quantity),
        unit,
        location,
        min_quantity: minQuantity.trim() ? Number(minQuantity) : null,
        expiration_date: expirationDate.trim() || null,
        notes,
      });

      await refreshItem(updated);
      setMessage("Inventory item updated.");
    } catch (saveError) {
      console.error("Failed to save inventory item:", saveError);
      setError(
        saveError instanceof Error ? saveError.message : "Inventory item could not be updated."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleAdjust() {
    if (!item || !userId) return;

    try {
      const amount = Number(adjustAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Adjustment amount must be greater than 0.");
      }

      setAdjusting(true);
      setError(null);
      setMessage(null);

      const nextItem = await adjustInventoryItemQuantity(userId, {
        itemId: item.id,
        delta: adjustMode === "add" ? amount : -amount,
        sourceLabel: adjustMode === "add" ? "Manual restock" : "Manual use",
        notes:
          adjustMode === "add"
            ? "Added from the inventory detail page."
            : "Used from the inventory detail page.",
      });

      await refreshItem(nextItem);
      setAdjustAmount("");
      setMessage(adjustMode === "add" ? "Inventory increased." : "Inventory reduced.");
    } catch (adjustError) {
      console.error("Failed to adjust inventory item:", adjustError);
      setError(
        adjustError instanceof Error
          ? adjustError.message
          : "Inventory adjustment could not be applied."
      );
    } finally {
      setAdjusting(false);
    }
  }

  if (redirecting || !authChecked) {
    return (
      <AppShell
        title="Item Detail"
        subtitle="Inspect and adjust one inventory item"
        backHref="/inventory/items"
        backLabel="All Items"
      >
        <div className="text-sm text-gray-400">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Item Detail"
      subtitle="Inspect and adjust one inventory item"
      backHref="/inventory/items"
      backLabel="All Items"
    >
      <div className="space-y-4 pb-16">
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

        {item ? (
          <>
            <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-emerald-300/80">
                    Inventory Item
                  </div>
                  <h2 className="mt-2 text-xl font-bold text-white">{item.name}</h2>
                  <p className="mt-2 text-sm text-gray-400">{recentSummary}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    item.is_low_stock
                      ? "bg-amber-500/15 text-amber-200"
                      : "bg-gray-900 text-gray-300"
                  }`}
                >
                  {item.is_low_stock ? "Low Stock" : "Tracked"}
                </span>
              </div>
            </section>

            <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">Edit Item</h2>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm text-gray-300">Item name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm text-gray-300">Quantity</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
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
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm text-gray-300">Location</label>
                  <select
                    value={location}
                    onChange={(e) => setLocation(e.target.value as InventoryLocation)}
                    className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                  >
                    {locationOptions.map((option) => (
                      <option key={option} value={option}>
                        {formatLocationLabel(option)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm text-gray-300">
                    Low stock threshold
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={minQuantity}
                    onChange={(e) => setMinQuantity(e.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm text-gray-300">Expiration date</label>
                  <input
                    type="date"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm text-gray-300">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-white">Quick Adjust</h2>
              <p className="mt-1 text-sm text-gray-400">
                Keep inventory flexible here. This is meant for quick corrections, not perfect automation.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)_auto]">
                <select
                  value={adjustMode}
                  onChange={(e) => setAdjustMode(e.target.value as "add" | "use")}
                  className="rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                >
                  <option value="add">Add More</option>
                  <option value="use">Use Some</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  placeholder={`Amount in ${item.unit}`}
                  className="rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white"
                />
                <button
                  type="button"
                  onClick={handleAdjust}
                  disabled={adjusting}
                  className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {adjusting ? "Applying..." : "Apply"}
                </button>
              </div>
            </section>

            <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-white">Recent Changes</h2>
              <div className="mt-4 space-y-3">
                {events.length > 0 ? (
                  events.map((event) => (
                    <div key={event.id} className="rounded-2xl bg-gray-900 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">
                            {event.source_label ?? event.source_type}
                          </div>
                          <div className="mt-1 text-xs text-gray-400">
                            {event.event_type} • {formatEventTimestamp(event.created_at)}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-white">
                          {formatEventQuantity(event)}
                        </div>
                      </div>
                      {event.notes ? (
                        <div className="mt-2 text-xs leading-5 text-gray-400">{event.notes}</div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl bg-gray-900 p-4 text-sm text-gray-400">
                    No item-specific changes yet. Manual adjustments and approved suggestions will show up here.
                  </div>
                )}
              </div>
            </section>
          </>
        ) : (
          <section className="rounded-3xl border border-dashed border-gray-700 bg-gray-800/40 p-5 text-sm text-gray-400">
            Inventory item not found.
          </section>
        )}
      </div>
    </AppShell>
  );
}
