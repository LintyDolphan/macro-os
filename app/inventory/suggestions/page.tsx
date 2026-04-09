"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import {
  applyInventorySuggestion,
  getCurrentUser,
  listInventorySuggestions,
  updateInventorySuggestionStatus,
  type InventorySuggestionRecord,
} from "../../lib/supabase/inventory-db";

const suggestionTypes = ["All", "Receipt", "Barcode", "Meal Log", "Snack Log"];

function humanizeSource(sourceType: InventorySuggestionRecord["source_type"]) {
  switch (sourceType) {
    case "receipt_scan":
      return "Receipt";
    case "barcode_scan":
      return "Barcode";
    case "meal_log":
      return "Meal Log";
    case "snack_log":
      return "Snack Log";
    case "recipe_log":
      return "Recipe Log";
    default:
      return "Manual";
  }
}

export default function InventorySuggestionsPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [suggestions, setSuggestions] = useState<InventorySuggestionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState("All");
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

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

        const loadedSuggestions = await listInventorySuggestions({ status: "pending" });

        if (!active) return;
        setUserId(user.id);
        setSuggestions(loadedSuggestions);
        setError(null);
      } catch (error) {
        if (!active) return;
        console.error("Failed to initialize inventory suggestions page:", error);
        setError(error instanceof Error ? error.message : "Inventory suggestions could not be loaded.");
      } finally {
        if (active) setAuthChecked(true);
      }
    }

    void init();

    return () => {
      active = false;
    };
  }, []);

  const filteredSuggestions = useMemo(() => {
    if (activeFilter === "All") return suggestions;

    const map: Record<string, InventorySuggestionRecord["source_type"]> = {
      Receipt: "receipt_scan",
      Barcode: "barcode_scan",
      "Meal Log": "meal_log",
      "Snack Log": "snack_log",
    };

    return suggestions.filter((suggestion) => suggestion.source_type === map[activeFilter]);
  }, [activeFilter, suggestions]);

  const stats = useMemo(() => {
    return [
      { label: "Pending", value: String(suggestions.length) },
      {
        label: "Receipt",
        value: String(suggestions.filter((item) => item.source_type === "receipt_scan").length),
      },
      {
        label: "Barcode",
        value: String(suggestions.filter((item) => item.source_type === "barcode_scan").length),
      },
      {
        label: "Meal Log",
        value: String(
          suggestions.filter((item) => item.source_type === "meal_log" || item.source_type === "snack_log").length
        ),
      },
    ];
  }, [suggestions]);

  async function approveSuggestion(suggestion: InventorySuggestionRecord) {
    if (!userId) return;

    try {
      setWorkingId(suggestion.id);
      setError(null);
      const result = await applyInventorySuggestion(userId, suggestion);
      setSuggestions((prev) => prev.filter((item) => item.id !== suggestion.id));
      setMessage(`Applied ${result.suggestion.proposed_name} to inventory.`);
      window.setTimeout(() => setMessage(null), 2200);
    } catch (error) {
      console.error("Failed to apply inventory suggestion:", error);
      setError(error instanceof Error ? error.message : "Suggestion could not be applied.");
    } finally {
      setWorkingId(null);
    }
  }

  async function rejectSuggestion(suggestion: InventorySuggestionRecord) {
    try {
      setWorkingId(suggestion.id);
      setError(null);
      await updateInventorySuggestionStatus(suggestion.id, "rejected");
      setSuggestions((prev) => prev.filter((item) => item.id !== suggestion.id));
      setMessage(`Rejected ${suggestion.proposed_name}.`);
      window.setTimeout(() => setMessage(null), 2200);
    } catch (error) {
      console.error("Failed to reject inventory suggestion:", error);
      setError(error instanceof Error ? error.message : "Suggestion could not be rejected.");
    } finally {
      setWorkingId(null);
    }
  }

  async function markEdited(suggestion: InventorySuggestionRecord) {
    try {
      setWorkingId(suggestion.id);
      setError(null);
      await updateInventorySuggestionStatus(suggestion.id, "edited");
      setSuggestions((prev) => prev.filter((item) => item.id !== suggestion.id));
      setMessage(`Marked ${suggestion.proposed_name} for manual review.`);
      window.setTimeout(() => setMessage(null), 2200);
    } catch (error) {
      console.error("Failed to mark suggestion as edited:", error);
      setError(error instanceof Error ? error.message : "Suggestion could not be updated.");
    } finally {
      setWorkingId(null);
    }
  }

  if (redirecting || !authChecked) {
    return (
      <AppShell title="Suggestions" subtitle="Review proposed inventory changes" backHref="/inventory" backLabel="Inventory">
        <div className="text-sm text-gray-400">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Suggestions" subtitle="Review proposed inventory changes" backHref="/inventory" backLabel="Inventory">
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
          <div className="grid grid-cols-2 gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl bg-gray-900 p-4 text-center">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">{stat.label}</div>
                <div className="mt-2 text-base font-semibold text-white">{stat.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
          <div className="overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max gap-2 pr-2">
              {suggestionTypes.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setActiveFilter(chip)}
                  className={`rounded-2xl px-3 py-2 text-sm font-semibold ${
                    activeFilter === chip ? "bg-blue-600 text-white" : "bg-gray-900 text-gray-300"
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="space-y-3">
          {filteredSuggestions.length > 0 ? (
            filteredSuggestions.map((suggestion) => (
              <article
                key={suggestion.id}
                className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold text-white">{suggestion.proposed_name}</div>
                    <div className="mt-1 text-sm text-gray-400">
                      {humanizeSource(suggestion.source_type)} • {suggestion.action_type} • {Number(suggestion.quantity_delta)} {suggestion.unit}
                    </div>
                    {suggestion.reason ? (
                      <div className="mt-2 text-xs text-gray-400">{suggestion.reason}</div>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-gray-900 px-3 py-1.5 text-xs text-gray-300">
                    Pending
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => approveSuggestion(suggestion)}
                    disabled={workingId === suggestion.id}
                    className="rounded-2xl bg-emerald-600 px-3 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {workingId === suggestion.id ? "Working..." : "Approve"}
                  </button>
                  <button
                    type="button"
                    onClick={() => markEdited(suggestion)}
                    disabled={workingId === suggestion.id}
                    className="rounded-2xl bg-gray-900 px-3 py-3 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => rejectSuggestion(suggestion)}
                    disabled={workingId === suggestion.id}
                    className="rounded-2xl bg-gray-900 px-3 py-3 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-3xl border border-dashed border-gray-700 bg-gray-800/40 p-5 text-sm text-gray-400">
              No pending inventory suggestions yet.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
