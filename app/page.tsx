"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  MacroEntry,
  loadCurrent,
  loadHistory,
  setCurrent,
  deleteFromHistory,
  clearHistory,
} from "./lib/history";

function formatUpdatedAt(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString();
}

function niceLabel(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Dashboard() {
  const [current, setCurrentState] = useState<MacroEntry | null>(null);
  const [history, setHistory] = useState<MacroEntry[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const c = loadCurrent();
    const h = loadHistory();
    setCurrentState(c);
    setHistory(h);
  }, []);

  function copyToClipboard() {
    if (!current) return;

    const text =
      `Calories: ${current.calories}\n` +
      `Protein: ${current.protein}g\n` +
      `Carbs: ${current.carbs}g\n` +
      `Fat: ${current.fat}g`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  function restoreEntry(entry: MacroEntry) {
    setCurrent(entry);
    setCurrentState(entry);
  }

  function removeEntry(id: string) {
    const next = deleteFromHistory(id);
    setHistory(next);

    // If they deleted the current entry, switch current to next best
    if (current?.id === id) {
      const newCurrent = next[0] ?? null;
      if (newCurrent) setCurrent(newCurrent);
      else localStorage.removeItem("macros");
      setCurrentState(newCurrent);
    }
  }

  function wipeAll() {
    clearHistory();
    setHistory([]);
    setCurrentState(null);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-900 text-white">
      <h1 className="text-3xl font-bold mb-4">Macro OS</h1>

      <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-md">
        <h2 className="text-xl font-semibold mb-2">Current Targets</h2>

        {current?.inputs && (
          <p className="text-sm text-gray-300 mb-2">
            {niceLabel(current.inputs.sex)} • {current.inputs.age} •{" "}
            {niceLabel(current.inputs.activity)} • {current.inputs.weightLbs} lb •{" "}
            {current.inputs.heightIn} in • {niceLabel(current.inputs.goal)}
          </p>
        )}

        {current?.updatedAt && (
          <p className="text-sm text-gray-400 mb-4">
            Last updated: {formatUpdatedAt(current.updatedAt)}
          </p>
        )}

        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-gray-400">Calories</p>
            <p className="text-2xl font-bold">{current?.calories ?? "—"}</p>
          </div>
          <div>
            <p className="text-gray-400">Protein (g)</p>
            <p className="text-2xl font-bold">{current?.protein ?? "—"}</p>
          </div>
          <div>
            <p className="text-gray-400">Carbs (g)</p>
            <p className="text-2xl font-bold">{current?.carbs ?? "—"}</p>
          </div>
          <div>
            <p className="text-gray-400">Fat (g)</p>
            <p className="text-2xl font-bold">{current?.fat ?? "—"}</p>
          </div>
        </div>

        <Link
          href="/calculator"
          className="mt-6 w-full bg-blue-600 hover:bg-blue-700 py-2 rounded font-semibold text-center block"
        >
          Set Macros
        </Link>

        <button
          onClick={copyToClipboard}
          disabled={!current}
          className="mt-3 w-full bg-gray-700 hover:bg-gray-600 py-2 rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {copied ? "Copied ✅" : "Copy Targets"}
        </button>

        <button
          onClick={wipeAll}
          disabled={!current && history.length === 0}
          className="mt-3 w-full bg-gray-900 hover:bg-gray-950 py-2 rounded font-semibold border border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Clear All
        </button>
<Link
  href="/grocery"
  className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 py-2 rounded font-semibold text-center block"
>
  Grocery List
</Link>
<Link
  href="/meals"
  className="mt-3 w-full bg-purple-600 hover:bg-purple-700 py-2 rounded font-semibold text-center block"
>
  Meals
</Link>
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-2">History</h3>

          {history.length === 0 ? (
            <p className="text-sm text-gray-400">
              No history yet — calculate your macros to start logging entries.
            </p>
          ) : (
            <ul className="space-y-2">
              {history.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between rounded border border-gray-700 bg-gray-900 p-3"
                >
                  <button
                    onClick={() => restoreEntry(e)}
                    className="text-left flex-1"
                    title="Restore this entry"
                  >
                    <div className="text-sm font-semibold">
                      {e.calories} kcal • P {e.protein} • C {e.carbs} • F {e.fat}
                    </div>
                    <div className="text-xs text-gray-400">
                      {formatUpdatedAt(e.updatedAt)}
                      {e.inputs ? (
                        <>
                          {" "}
                          • {niceLabel(e.inputs.goal)} •{" "}
                          {niceLabel(e.inputs.activity)}
                        </>
                      ) : null}
                    </div>
                    
                  </button>

                  <button
                    onClick={() => removeEntry(e.id)}
                    className="ml-3 text-sm text-gray-300 hover:text-white"
                    title="Delete entry"
                  >
                    ✕
                  </button>
                  
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
