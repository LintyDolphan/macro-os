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
      {label ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-300">{label}</span>
          <span className="text-gray-400">
            {consumed} / {target}
            {unit}
          </span>
        </div>
      ) : (
        <div className="text-right text-xs text-gray-500">
          {consumed} / {target}
          {unit}
        </div>
      )}

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
        <p className="mt-1 text-[10px] text-gray-500 whitespace-nowrap">
         {sublabel}
        </p>
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
  const [groceryPreview, setGroceryPreview] = useState<{ id: string; name: string }[]>([]); 
  const [recentMeals, setRecentMeals] = useState<
  {
    id: string;
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }[]
>([]);
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
    setRecentMeals(
  todayEntries.slice(0, 3).map((entry) => ({
    id: entry.id,
    name: entry.name,
    calories: entry.macros.calories,
    protein: entry.macros.protein,
    carbs: entry.macros.carbs,
    fat: entry.macros.fat,
  }))
);

setGroceryPreview(
  groceryItems
    .filter((item) => !item.bought)
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      name: item.name,
    }))
);
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
  <div className="grid grid-cols-2 gap-3">
    <div className="col-span-1">
      <SnapshotCard
        icon="🍽️"
        label="Meals"
        value={todayLogCount}
        sublabel="today"
      />
    </div>

    <div className="col-span-1">
      <SnapshotCard
        icon="🛒"
        label="Grocery"
        value={groceryCount}
        sublabel="left to buy"
      />
    </div>

    <div className="col-span-1">
      <SnapshotCard
        icon="📋"
        label="Plans"
        value={history.length}
        sublabel="saved"
      />
    </div>

    <div className="col-span-1">
      <SnapshotCard
        icon="📈"
        label="Progress"
        value="—"
        sublabel="soon"
      />
    </div>

    <div className="col-span-4 rounded-2xl bg-gray-900 p-4 shadow-md">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">
            Workout Panel
          </p>
          <p className="mt-1 text-lg font-semibold text-white">
            Next scheduled workout
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Future space for coach / workout guidance
          </p>
        </div>
        <div className="text-3xl">🏋️</div>
      </div>
    </div>
  </div>
</DashboardCard>
        
        <DashboardCard title="Today’s Macro Progress">
  <div className="mb-3 flex items-center justify-between">
    <span className="text-sm text-gray-400">{todayISO()}</span>
  </div>

  {current ? (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-300">Calories</span>
          <span className="text-gray-400">
            {remaining?.calories ?? 0} left
          </span>
        </div>
        <ProgressRow
          label=""
          consumed={todayTotals.calories}
          target={current.calories}
          colorClass="bg-blue-500"
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-300">Protein</span>
          <span className="text-gray-400">
            {remaining?.protein ?? 0}g left
          </span>
        </div>
        <ProgressRow
          label=""
          consumed={todayTotals.protein}
          target={current.protein}
          unit="g"
          colorClass="bg-emerald-500"
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-300">Carbs</span>
          <span className="text-gray-400">
            {remaining?.carbs ?? 0}g left
          </span>
        </div>
        <ProgressRow
          label=""
          consumed={todayTotals.carbs}
          target={current.carbs}
          unit="g"
          colorClass="bg-amber-500"
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-300">Fat</span>
          <span className="text-gray-400">
            {remaining?.fat ?? 0}g left
          </span>
        </div>
        <ProgressRow
          label=""
          consumed={todayTotals.fat}
          target={current.fat}
          unit="g"
          colorClass="bg-purple-500"
        />
      </div>
    </div>
  ) : (
    <p className="text-sm text-gray-400">
      Set your macro targets to start tracking daily progress.
    </p>
  )}
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

        <DashboardCard title="Current Targets">
  {current ? (
    <div className="space-y-3">
      {current.inputs && (
        <div className="text-xs uppercase tracking-wide text-gray-500 leading-relaxed">
          {niceLabel(current.inputs.sex)} • {current.inputs.age} •{" "}
          {niceLabel(current.inputs.activity)} • {current.inputs.weightLbs} lb •{" "}
          {current.inputs.heightIn} in • {niceLabel(current.inputs.goal)}
        </div>
      )}

      <div className="rounded-2xl bg-gray-900 p-4">
        <div className="text-3xl font-bold text-white">
          {current.calories} kcal
        </div>
        <div className="mt-2 text-sm text-gray-300">
          P {current.protein} • C {current.carbs} • F {current.fat}
        </div>
      </div>

      {current.updatedAt && (
        <p className="text-xs text-gray-500">
          Last updated: {formatUpdatedAt(current.updatedAt)}
        </p>
      )}
    </div>
  ) : (
    <p className="text-sm text-gray-400">
      No macro targets set yet.
    </p>
  )}
</DashboardCard>

        

<DashboardCard title="Recent Meals">
{recentMeals.length > 0 ? (
  <ul className="space-y-2">
    {recentMeals.map((meal) => (
      <li
        key={meal.id}
        className="rounded-xl bg-gray-900 px-3 py-3"
      >
        <div className="text-sm font-medium text-gray-100 leading-snug">
          {meal.name}
        </div>
        <div className="mt-1 text-xs text-gray-400">
          {meal.calories} kcal • P {meal.protein} • C {meal.carbs} • F {meal.fat}
        </div>
      </li>
    ))}
  </ul>
) : (
    <p className="text-sm text-gray-400">No meals logged today yet.</p>
  )}

  <Link
    href="/meals"
    className="mt-3 block text-sm font-medium text-blue-400 hover:text-blue-300"
  >
    View Meals →
  </Link>
</DashboardCard>

<DashboardCard title="Grocery Preview">
  {groceryPreview.length > 0 ? (
    <ul className="space-y-2">
      {groceryPreview.map((item) => (
        <li
          key={item.id}
          className="rounded-xl bg-gray-900 px-3 py-2 text-sm text-gray-200"
        >
          {item.name}
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-gray-400">Your grocery list is clear.</p>
  )}

  <Link
    href="/grocery"
    className="mt-3 block text-sm font-medium text-emerald-400 hover:text-emerald-300"
  >
    View Grocery →
  </Link>
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