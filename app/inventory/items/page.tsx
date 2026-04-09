"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import {
  getCurrentUser,
  listInventoryItems,
  type InventoryItemRecord,
  type InventoryLocation,
} from "../../lib/supabase/inventory-db";

const filterChips = [
  { label: "All", value: "" },
  { label: "Fridge", value: "fridge" },
  { label: "Freezer", value: "freezer" },
  { label: "Pantry", value: "pantry" },
  { label: "Snacks", value: "snacks" },
  { label: "Low Stock", value: "low-stock" },
  { label: "Expiring Soon", value: "expiring-soon" },
];

function formatItemMeta(item: InventoryItemRecord) {
  const quantity = `${Number(item.quantity)} ${item.unit}`;
  const location = item.location.charAt(0).toUpperCase() + item.location.slice(1);
  const expiration = item.expiration_date
    ? ` • Expires ${new Date(item.expiration_date).toLocaleDateString()}`
    : "";

  return `${quantity} • ${location}${expiration}`
}

function InventoryItemsPageContent() {
  const searchParams = useSearchParams();
  const initialLocation = searchParams.get("location");
  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<InventoryItemRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

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

        const loadedItems = await listInventoryItems({
          location: (initialLocation as InventoryLocation | null) ?? undefined,
        });

        if (!active) return;
        setItems(loadedItems);
        setError(null);
      } catch (error) {
        if (!active) return;
        console.error("Failed to initialize inventory items page:", error);
        setError(error instanceof Error ? error.message : "Inventory items could not be loaded.");
      } finally {
        if (active) setAuthChecked(true);
      }
    }

    void init();

    return () => {
      active = false;
    };
  }, [initialLocation]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const now = new Date();
    const soon = new Date();
    soon.setDate(now.getDate() + 7);

    return items.filter((item) => {
      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.location.toLowerCase().includes(query) ||
        (item.notes?.toLowerCase().includes(query) ?? false);

      const matchesSpecialFilter =
        initialLocation === "low-stock"
          ? item.is_low_stock
          : initialLocation === "expiring-soon"
            ? !!item.expiration_date &&
              new Date(item.expiration_date) >= now &&
              new Date(item.expiration_date) <= soon
            : true;

      return matchesSearch && matchesSpecialFilter;
    });
  }, [initialLocation, items, search]);

  if (redirecting || !authChecked) {
    return (
      <AppShell
        title="All Items"
        subtitle="Browse your pantry, fridge, and freezer"
        backHref="/inventory"
        backLabel="Inventory"
      >
        <div className="text-sm text-gray-400">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="All Items"
      subtitle="Browse your pantry, fridge, and freezer"
      backHref="/inventory"
      backLabel="Inventory"
    >
      <div className="space-y-4 pb-16">
        {error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search inventory items..."
            className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder:text-gray-500"
          />
          <div className="mt-3 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max gap-2 pr-2">
              {filterChips.map((chip) => {
                const active = (initialLocation ?? "") === chip.value;
                return (
                  <Link
                    key={chip.label}
                    href={chip.value ? `/inventory/items?location=${chip.value}` : "/inventory/items"}
                    className={`rounded-2xl px-3 py-2 text-sm font-semibold ${
                      active ? "bg-blue-600 text-white" : "bg-gray-900 text-gray-300"
                    }`}
                  >
                    {chip.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <div className="space-y-3">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <Link
                key={item.id}
                href={`/inventory/items/${item.id}`}
                className="block rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm transition hover:bg-gray-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold text-white">{item.name}</div>
                    <div className="mt-1 text-sm text-gray-400">{formatItemMeta(item)}</div>
                  </div>
                  <span className="rounded-full bg-gray-900 px-3 py-1.5 text-xs text-gray-300">
                    {item.is_low_stock ? "Low Stock" : "Tracked"}
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-3xl border border-dashed border-gray-700 bg-gray-800/40 p-5 text-sm text-gray-400">
              {items.length === 0
                ? "No inventory items yet. Add your first item to start building your pantry."
                : `No inventory items match "${search.trim()}".`}
            </div>
          )}
        </div>

        <Link
          href="/inventory/add"
          className="fixed bottom-32 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-[20px] border-2 border-blue-300/45 bg-blue-600 text-3xl font-light text-white shadow-[0_18px_40px_rgba(37,99,235,0.35)] transition hover:bg-blue-700 sm:right-[calc(50%-12rem)]"
          aria-label="Add inventory item"
        >
          +
        </Link>
      </div>
    </AppShell>
  );
}

export default function InventoryItemsPage() {
  return (
    <Suspense
      fallback={
        <AppShell
          title="All Items"
          subtitle="Browse your pantry, fridge, and freezer"
          backHref="/inventory"
          backLabel="Inventory"
        >
          <div className="text-sm text-gray-400">Loading...</div>
        </AppShell>
      }
    >
      <InventoryItemsPageContent />
    </Suspense>
  );
}
