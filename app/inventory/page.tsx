"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import {
  getCurrentUser,
  listInventoryEvents,
  listInventoryItems,
  listInventorySuggestions,
  type InventoryEventRecord,
  type InventoryItemRecord,
  type InventorySuggestionRecord,
} from "../lib/supabase/inventory-db";

const locationCards = [
  { title: "Fridge", key: "fridge", href: "/inventory/items?location=fridge", description: "Fresh foods and ready-to-use items." },
  { title: "Freezer", key: "freezer", href: "/inventory/items?location=freezer", description: "Frozen meals, meats, and backup stock." },
  { title: "Pantry", key: "pantry", href: "/inventory/items?location=pantry", description: "Shelf-stable staples and dry goods." },
  { title: "Snacks", key: "snacks", href: "/inventory/items?location=snacks", description: "Packaged snacks and quick grab items." },
  { title: "Supplements", key: "supplements", href: "/inventory/items?location=supplements", description: "Protein, vitamins, and powders." },
  { title: "Other", key: "other", href: "/inventory/items?location=other", description: "Everything else that needs tracking." },
];

const quickActions = [
  { title: "Add Item", href: "/inventory/add", description: "Manually add something you have on hand." },
  { title: "Review Suggestions", href: "/inventory/suggestions", description: "Approve or reject proposed inventory changes." },
  { title: "All Items", href: "/inventory/items", description: "Browse everything across your inventory." },
  { title: "Receipt Scans Soon", href: "/inventory/suggestions", description: "Receipt imports will land here for review." },
];

function formatEventLine(event: InventoryEventRecord) {
  const quantity = `${Math.abs(Number(event.quantity_delta))} ${event.unit}`;
  const verb =
    event.event_type === "consume"
      ? "Used"
      : event.event_type === "add"
        ? "Added"
        : event.event_type === "expire"
          ? "Expired"
          : "Updated";

  return `${verb} ${quantity}`
}

export default function InventoryPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [items, setItems] = useState<InventoryItemRecord[]>([]);
  const [events, setEvents] = useState<InventoryEventRecord[]>([]);
  const [suggestions, setSuggestions] = useState<InventorySuggestionRecord[]>([]);
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

        const [loadedItems, loadedEvents, loadedSuggestions] = await Promise.all([
          listInventoryItems(),
          listInventoryEvents({ limit: 5 }),
          listInventorySuggestions({ status: "pending", limit: 8 }),
        ]);

        if (!active) return;
        setItems(loadedItems);
        setEvents(loadedEvents);
        setSuggestions(loadedSuggestions);
        setError(null);
      } catch (error) {
        if (!active) return;
        console.error("Failed to initialize inventory page:", error);
        setError(error instanceof Error ? error.message : "Inventory could not be loaded.");
      } finally {
        if (active) setAuthChecked(true);
      }
    }

    void init();

    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const soon = new Date();
    soon.setDate(now.getDate() + 7);

    const expiringSoon = items.filter((item) => {
      if (!item.expiration_date) return false;
      const expiration = new Date(item.expiration_date);
      return expiration >= now && expiration <= soon;
    });

    return [
      { label: "Total Items", value: String(items.length) },
      { label: "Low Stock", value: String(items.filter((item) => item.is_low_stock).length) },
      { label: "Expiring Soon", value: String(expiringSoon.length) },
      { label: "Pending", value: String(suggestions.length) },
    ];
  }, [items, suggestions.length]);

  const locationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.location, (counts.get(item.location) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const expiringSoonItems = useMemo(() => {
    const now = new Date();
    const soon = new Date();
    soon.setDate(now.getDate() + 7);

    return items
      .filter((item) => {
        if (!item.expiration_date) return false;
        const expiration = new Date(item.expiration_date);
        return expiration >= now && expiration <= soon;
      })
      .sort((a, b) => {
        if (!a.expiration_date || !b.expiration_date) return 0;
        return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
      })
      .slice(0, 3);
  }, [items]);

  if (redirecting || !authChecked) {
    return (
      <AppShell title="Inventory" subtitle="Track what you have at home">
        <div className="text-sm text-gray-400">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Inventory" subtitle="Track what you have at home">
      <div className="space-y-4">
        {error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <div className="text-xs uppercase tracking-[0.18em] text-emerald-300/80">At Home</div>
          <h2 className="mt-2 text-xl font-bold text-white">Inventory overview</h2>
          <p className="mt-2 text-sm text-gray-400">
            Manual adds, reviewable suggestions, and recent changes all feed into the same inventory system.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl bg-gray-900 p-4 text-center">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">{stat.label}</div>
                <div className="mt-2 text-base font-semibold text-white">{stat.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Quick Actions</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <Link
                key={action.href + action.title}
                href={action.href}
                className="rounded-2xl bg-gray-900 p-4 transition hover:bg-gray-700"
              >
                <div className="text-sm font-semibold text-white">{action.title}</div>
                <div className="mt-2 text-xs leading-5 text-gray-400">{action.description}</div>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Locations</h2>
            <Link href="/inventory/items" className="text-sm font-semibold text-blue-300">
              View All
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {locationCards.map((card) => (
              <Link
                key={card.title}
                href={card.href}
                className="rounded-2xl bg-gray-900 p-4 transition hover:bg-gray-700"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">{card.title}</div>
                  <div className="text-xs text-gray-400">{locationCounts.get(card.key) ?? 0}</div>
                </div>
                <div className="mt-2 text-xs leading-5 text-gray-400">{card.description}</div>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Expiring Soon</h2>
            <Link href="/inventory/items" className="text-sm font-semibold text-blue-300">
              Manage
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {expiringSoonItems.length > 0 ? (
              expiringSoonItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/inventory/items/${item.id}`}
                  className="block rounded-2xl bg-gray-900 p-4 transition hover:bg-gray-700"
                >
                  <div className="text-sm font-semibold text-white">{item.name}</div>
                  <div className="mt-1 text-xs text-gray-400">
                    Expires {new Date(item.expiration_date as string).toLocaleDateString()}
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-2xl bg-gray-900 p-4 text-sm text-gray-400">
                No items are expiring in the next 7 days.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Recent Changes</h2>
            <Link href="/inventory/suggestions" className="text-sm font-semibold text-blue-300">
              Review Suggestions
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {events.length > 0 ? (
              events.map((event) => (
                <div key={event.id} className="rounded-2xl bg-gray-900 p-4">
                  <div className="text-sm font-semibold text-white">{event.source_label ?? event.source_type}</div>
                  <div className="mt-1 text-xs text-gray-400">{formatEventLine(event)}</div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-gray-900 p-4 text-sm text-gray-400">
                No inventory events yet. Adds, consumes, and approvals will show up here.
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
