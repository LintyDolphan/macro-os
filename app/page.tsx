"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "./components/AppShell";
import { loadLog, sumMacros, todayISO } from "./lib/macroLog";
import { loadGroceryList } from "./lib/grocery";
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

function DashboardCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-gray-800 p-4 shadow-lg">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ProgressRow({
  label,
  consumed,
  target,
  unit = "",
  colorClass,
}: {
  label: string;
  consumed: number;
  target: number;
  unit?: string;
  colorClass: string;
}) {
  const safeTarget = Math.max(target, 1);
  const percent = Math.min((consumed / safeTarget) * 100, 100);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-300">{label}</span>
        <span className="text-gray-400">
          {consumed} / {target}
          {unit}
        </span>
      </div>

      <div className="h-2 w-full rounded-full bg-gray-700">
        <div
          className={`h-2 rounded-full transition-all ${colorClass}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
function SnapshotCard({
  icon,
  label,
  value,
  sublabel,
}: {
  icon: string;
  label: string;
  value: string | number;
  sublabel?: string;
}) {
  return (
    <div className="rounded-2xl bg-gray-900 p-4 text-center shadow-md">
      <div className="text-2xl">{icon}</div>
      <p className="mt-2 text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sublabel ? (
        <p className="mt-1 text-xs text-gray-500">{sublabel}</p>
      ) : null}
    </div>
  );
}
function QuickActionTile({
  href,
  icon,
  label,
  color,
}: {
  href: string;
  icon: string;
  label: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-2xl px-4 py-4 text-center shadow-lg transition hover:scale-[1.02] ${color}`}
    >
      <div className="text-2xl">{icon}</div>
      <div className="mt-2 text-sm font-semibold">{label}</div>
    </Link>
  );
}
export default function Dashboard() {
  const [current, setCurrentState] = useState<MacroEntry | null>(null);
  const [history, setHistory] = useState<MacroEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [todayLogCount, setTodayLogCount] = useState(0);
  const [groceryCount, setGroceryCount] = useState(0);
  const [todayTotals, setTodayTotals] = useState({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });

  useEffect(() => {
    const c = loadCurrent();
    const h = loadHistory();
    const todayEntries = loadLog(todayISO());
    const groceryItems = loadGroceryList();

    setCurrentState(c);
    setHistory(h);
    setTodayTotals(sumMacros(todayEntries));
    setTodayLogCount(todayEntries.length);
    setGroceryCount(groceryItems.filter((item) => !item.bought).length);
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

    if (current?.id === id) {
      const newCurrent = next[0] ?? null;
      if (newCurrent) {
        setCurrent(newCurrent);
      } else {
        localStorage.removeItem("macros");
      }
      setCurrentState(newCurrent);
    }
  }

  function wipeAll() {
    clearHistory();
    setHistory([]);
    setCurrentState(null);
  }

  const remaining = current
    ? {
        calories: current.calories - todayTotals.calories,
        protein: current.protein - todayTotals.protein,
        carbs: current.carbs - todayTotals.carbs,
        fat: current.fat - todayTotals.fat,
      }
    : null;

  return (
    <AppShell title="Dashboard" subtitle="Your daily nutrition overview">
      <div className="space-y-4">
        <DashboardCard title="At a Glance">
  <div className="grid grid-cols-3 gap-3">
    <SnapshotCard
      icon="🍽️"
      label="Meals"
      value={todayLogCount}
      sublabel="logged today"
    />
    <SnapshotCard
      icon="🛒"
      label="Grocery"
      value={groceryCount}
      sublabel="left to buy"
    />
    <SnapshotCard
      icon="📋"
      label="Plans"
      value={history.length}
      sublabel="saved targets"
    />
  </div>
</DashboardCard>
        
        <DashboardCard title="Today’s Macro Progress">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-gray-400">{todayISO()}</span>
          </div>

          {current ? (
            <div className="space-y-4">
              <ProgressRow
  label="Calories"
  consumed={todayTotals.calories}
  target={current.calories}
  colorClass="bg-blue-500"
/>
<ProgressRow
  label="Protein"
  consumed={todayTotals.protein}
  target={current.protein}
  unit="g"
  colorClass="bg-emerald-500"
/>
<ProgressRow
  label="Carbs"
  consumed={todayTotals.carbs}
  target={current.carbs}
  unit="g"
  colorClass="bg-amber-500"
/>
<ProgressRow
  label="Fat"
  consumed={todayTotals.fat}
  target={current.fat}
  unit="g"
  colorClass="bg-purple-500"
/>
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              Set your macro targets to start tracking daily progress.
            </p>
          )}
        </DashboardCard>

        <DashboardCard title="Remaining Today">
          {remaining ? (
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-gray-900 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Calories
                </p>
                <p className="text-xl font-bold">{remaining.calories}</p>
              </div>
              <div className="rounded-xl bg-gray-900 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Protein
                </p>
                <p className="text-xl font-bold">{remaining.protein}g</p>
              </div>
              <div className="rounded-xl bg-gray-900 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Carbs
                </p>
                <p className="text-xl font-bold">{remaining.carbs}g</p>
              </div>
              <div className="rounded-xl bg-gray-900 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Fat
                </p>
                <p className="text-xl font-bold">{remaining.fat}g</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No targets set yet.</p>
          )}
        </DashboardCard>

        <DashboardCard title="Current Targets">
          {current?.inputs && (
            <p className="mb-2 text-sm text-gray-300">
              {niceLabel(current.inputs.sex)} • {current.inputs.age} •{" "}
              {niceLabel(current.inputs.activity)} • {current.inputs.weightLbs} lb
              • {current.inputs.heightIn} in •{" "}
              {niceLabel(current.inputs.goal)}
            </p>
          )}

          {current?.updatedAt && (
            <p className="mb-4 text-sm text-gray-400">
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
        </DashboardCard>

        <DashboardCard title="Quick Actions">
          <div className="grid grid-cols-2 gap-3">
  <QuickActionTile
    href="/calculator"
    icon="🎯"
    label="Set Macros"
    color="bg-blue-600 hover:bg-blue-700"
  />

  <QuickActionTile
    href="/meals"
    icon="🍽️"
    label="Meals"
    color="bg-purple-600 hover:bg-purple-700"
  />

  <QuickActionTile
    href="/grocery"
    icon="🛒"
    label="Grocery"
    color="bg-emerald-600 hover:bg-emerald-700"
  />

  <QuickActionTile
    href="/progress"
    icon="📈"
    label="Progress"
    color="bg-gray-700 hover:bg-gray-600"
  />
</div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              onClick={copyToClipboard}
              disabled={!current}
              className="rounded-xl bg-gray-700 px-4 py-3 font-semibold hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copied ? "Copied ✅" : "Copy Targets"}
            </button>

            <button
              onClick={wipeAll}
              disabled={!current && history.length === 0}
              className="rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 font-semibold hover:bg-gray-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear All
            </button>
          </div>
        </DashboardCard>

        <DashboardCard title="History">
          {history.length === 0 ? (
            <p className="text-sm text-gray-400">
              No history yet — calculate your macros to start logging entries.
            </p>
          ) : (
            <ul className="space-y-2">
              {history.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between rounded-xl border border-gray-700 bg-gray-900 p-3"
                >
                  <button
                    onClick={() => restoreEntry(e)}
                    className="flex-1 text-left"
                    title="Restore this entry"
                  >
                    <div className="text-sm font-semibold">
                      {e.calories} kcal • P {e.protein} • C {e.carbs} • F{" "}
                      {e.fat}
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
        </DashboardCard>
      </div>
    </AppShell>
  );
}