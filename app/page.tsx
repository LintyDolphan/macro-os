"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AppShell from "./components/AppShell";
import { loadGroceryList } from "./lib/grocery";
import {
  MacroEntry,
  clearHistory,
  deleteFromHistory,
  loadCurrent,
  loadHistory,
  setCurrent,
} from "./lib/history";
import { loadLog, sumMacros, todayISO } from "./lib/macroLog";
import { supabase } from "./lib/supabase/client";
import {
  listWorkoutSessions,
  listWorkoutTemplates,
  type WorkoutSessionRecord,
  type WorkoutTemplateRecord,
} from "./lib/supabase/workouts-db";

type RecentMeal = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

function formatUpdatedAt(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString();
}

function niceLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function DashboardCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-gray-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function SnapshotCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string | number;
  sublabel: string;
}) {
  return (
    <div className="flex min-h-[108px] flex-col items-center justify-center rounded-2xl bg-gray-900 px-3 py-2.5 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
        {label}
      </div>
      <div className="mt-1.5 text-xl font-bold leading-none text-white">{value}</div>
      <div className="mt-1.5 truncate text-[10px] leading-none text-gray-500">{sublabel}</div>
    </div>
  );
}

function QuickActionTile({
  href,
  badge,
  label,
  description,
  colorClass,
}: {
  href: string;
  badge: string;
  label: string;
  description: string;
  colorClass: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-2xl border p-4 transition hover:scale-[1.01] ${colorClass}`}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/12 text-[11px] font-bold tracking-[0.18em] text-white">
        {badge}
      </div>
      <div className="mt-3 text-sm font-semibold text-white">{label}</div>
      <div className="mt-1 text-xs leading-5 text-white/70">{description}</div>
    </Link>
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
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-300">{label}</span>
        <span className="text-gray-500">
          {consumed} / {target}
          {unit}
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-gray-900">
        <div
          className={`h-2.5 rounded-full transition-all ${colorClass}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function formatWorkoutSummary(
  activeSession: WorkoutSessionRecord | null,
  latestTemplate: WorkoutTemplateRecord | null
) {
  if (activeSession) {
    return {
      title: "Resume workout",
      name: activeSession.name,
      description: "Pick up where you left off and keep logging your session.",
      href: `/workouts/session/${activeSession.id}`,
      actionLabel: "Resume",
      meta: activeSession.duration_sec
        ? `${Math.max(1, Math.round(activeSession.duration_sec / 60))} min logged`
        : "In progress",
    };
  }

  if (latestTemplate) {
    return {
      title: "Next workout",
      name: latestTemplate.name,
      description: "Start from your latest saved workout template.",
      href: `/workouts/session/${latestTemplate.id}`,
      actionLabel: "Start",
      meta: latestTemplate.estimated_duration_min
        ? `${latestTemplate.estimated_duration_min} min planned`
        : "Template ready",
    };
  }

  return {
    title: "Workout panel",
    name: "No workout planned",
    description: "Create a workout template or log a quick session to get started.",
    href: "/workouts",
    actionLabel: "Open",
    meta: "Ready when you are",
  };
}

export default function Dashboard() {
  const router = useRouter();
  const [current, setCurrentState] = useState<MacroEntry | null>(null);
  const [history, setHistory] = useState<MacroEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [todayLogCount, setTodayLogCount] = useState(0);
  const [groceryCount, setGroceryCount] = useState(0);
  const [groceryPreview, setGroceryPreview] = useState<{ id: string; name: string }[]>([]);
  const [recentMeals, setRecentMeals] = useState<RecentMeal[]>([]);
  const [todayTotals, setTodayTotals] = useState({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });
  const [workoutTemplates, setWorkoutTemplates] = useState<WorkoutTemplateRecord[]>([]);
  const [workoutSessions, setWorkoutSessions] = useState<WorkoutSessionRecord[]>([]);
  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadDashboardData() {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("Failed to load session:", sessionError);
        if (!active) return;
        setRedirecting(true);
        router.replace("/auth");
        return;
      }

      const user = sessionData.session?.user ?? null;

      if (!user) {
        if (!active) return;
        setRedirecting(true);
        router.replace("/auth");
        return;
      }

      try {
        const [loadedCurrent, loadedHistory, todayEntries] = await Promise.all([
          loadCurrent(),
          loadHistory(),
          loadLog(todayISO()),
        ]);

        if (!active) return;

        setCurrentState(loadedCurrent);
        setHistory(loadedHistory);
        setTodayTotals(sumMacros(todayEntries));
        setTodayLogCount(todayEntries.length);
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

        try {
          const groceryItems = await loadGroceryList();
          if (!active) return;

          const pending = groceryItems.filter((item) => !item.bought);
          setGroceryCount(pending.length);
          setGroceryPreview(
            pending.slice(0, 3).map((item) => ({
              id: item.id,
              name: item.name,
            }))
          );
        } catch (groceryError) {
          console.error("Failed to load grocery preview:", groceryError);
          if (!active) return;
          setGroceryCount(0);
          setGroceryPreview([]);
        }

        try {
          const [templates, sessions] = await Promise.all([
            listWorkoutTemplates(user.id),
            listWorkoutSessions(user.id),
          ]);
          if (!active) return;
          setWorkoutTemplates(templates);
          setWorkoutSessions(sessions);
        } catch (workoutError) {
          console.error("Failed to load workout preview:", workoutError);
          if (!active) return;
          setWorkoutTemplates([]);
          setWorkoutSessions([]);
        }

        setAuthChecked(true);
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
        if (active) setAuthChecked(true);
      }
    }

    void loadDashboardData();

    return () => {
      active = false;
    };
  }, [router]);

  async function restoreEntry(entry: MacroEntry) {
    await setCurrent(entry);
    setCurrentState(entry);
  }

  async function removeEntry(id: string) {
    const next = await deleteFromHistory(id);
    setHistory(next);

    if (current?.id === id) {
      const newCurrent = next[0] ?? null;
      if (newCurrent) {
        await setCurrent(newCurrent);
      }
      setCurrentState(newCurrent);
    }
  }

  async function wipeAll() {
    await clearHistory();
    setHistory([]);
    setCurrentState(null);
  }

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

  if (redirecting || !authChecked) {
    return (
      <AppShell title="Dashboard" subtitle="Your daily nutrition overview">
        <div className="text-sm text-gray-400">Loading...</div>
      </AppShell>
    );
  }

  const remaining = current
    ? {
        calories: current.calories - todayTotals.calories,
        protein: current.protein - todayTotals.protein,
        carbs: current.carbs - todayTotals.carbs,
        fat: current.fat - todayTotals.fat,
      }
    : null;

  const activeWorkoutSession =
    workoutSessions.find((session) => session.status === "in_progress") ?? null;
  const latestWorkoutTemplate = workoutTemplates[0] ?? null;
  const workoutSummary = formatWorkoutSummary(activeWorkoutSession, latestWorkoutTemplate);

  return (
    <AppShell title="Dashboard" subtitle="Your daily nutrition overview">
      <div className="space-y-4">
        <DashboardCard title="At A Glance" subtitle="Your day, targets, and next steps in one place.">
          <div className="grid grid-cols-4 gap-3">
            <SnapshotCard label="Meals" value={todayLogCount} sublabel="today" />
            <SnapshotCard label="Grocery" value={groceryCount} sublabel="to buy" />
            <SnapshotCard label="Plans" value={history.length} sublabel="saved" />
            <SnapshotCard label="Progress" value="--" sublabel="soon" />

            <Link
              href={workoutSummary.href}
              className="col-span-4 rounded-2xl bg-gray-900 p-4 transition hover:bg-gray-800"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Workout Panel
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">{workoutSummary.title}</div>
                  <div className="mt-1 text-sm font-medium text-blue-300">{workoutSummary.name}</div>
                  <div className="mt-1 text-sm text-gray-500">{workoutSummary.description}</div>
                  <div className="mt-3 inline-flex rounded-full bg-gray-800 px-3 py-1.5 text-xs text-gray-300">
                    {workoutSummary.meta}
                  </div>
                </div>
                <div className="rounded-2xl bg-blue-500/12 px-3 py-2 text-sm font-semibold text-blue-200">
                  {workoutSummary.actionLabel}
                </div>
              </div>
            </Link>
          </div>
        </DashboardCard>

        <DashboardCard
          title="Today's Macro Progress"
          subtitle={`Tracking for ${todayISO()}`}
        >
          {current ? (
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-gray-300">Calories</span>
                  <span className="text-gray-500">{remaining?.calories ?? 0} left</span>
                </div>
                <ProgressRow
                  label=""
                  consumed={todayTotals.calories}
                  target={current.calories}
                  colorClass="bg-blue-500"
                />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-gray-300">Protein</span>
                  <span className="text-gray-500">{remaining?.protein ?? 0}g left</span>
                </div>
                <ProgressRow
                  label=""
                  consumed={todayTotals.protein}
                  target={current.protein}
                  unit="g"
                  colorClass="bg-emerald-500"
                />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-gray-300">Carbs</span>
                  <span className="text-gray-500">{remaining?.carbs ?? 0}g left</span>
                </div>
                <ProgressRow
                  label=""
                  consumed={todayTotals.carbs}
                  target={current.carbs}
                  unit="g"
                  colorClass="bg-amber-500"
                />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-gray-300">Fat</span>
                  <span className="text-gray-500">{remaining?.fat ?? 0}g left</span>
                </div>
                <ProgressRow
                  label=""
                  consumed={todayTotals.fat}
                  target={current.fat}
                  unit="g"
                  colorClass="bg-fuchsia-500"
                />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-gray-900 p-4 text-sm text-gray-400">
              Set your macro targets to start tracking daily progress.
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Quick Actions" subtitle="Jump into the things you use most.">
          <div className="grid grid-cols-2 gap-3">
            <QuickActionTile
              href="/calculator"
              badge="MC"
              label="Set Macros"
              description="Update your daily calorie and macro targets."
              colorClass="border-blue-400/20 bg-blue-600/85 hover:bg-blue-600"
            />
            <QuickActionTile
              href="/meals"
              badge="ML"
              label="Meals"
              description="Log meals and keep your day on track."
              colorClass="border-fuchsia-400/20 bg-fuchsia-600/85 hover:bg-fuchsia-600"
            />
            <QuickActionTile
              href="/grocery"
              badge="GR"
              label="Grocery"
              description="Check list progress and household needs."
              colorClass="border-emerald-400/20 bg-emerald-600/85 hover:bg-emerald-600"
            />
            <QuickActionTile
              href="/workouts"
              badge="WK"
              label="Workout"
              description="Start, resume, or review training sessions."
              colorClass="border-gray-600 bg-gray-700 hover:bg-gray-600"
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              onClick={copyToClipboard}
              disabled={!current}
              className="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copied ? "Copied" : "Copy Targets"}
            </button>
            <button
              onClick={wipeAll}
              disabled={!current && history.length === 0}
              className="rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear All
            </button>
          </div>
        </DashboardCard>

        <DashboardCard title="Current Targets" subtitle="Your active macro target profile.">
          {current ? (
            <div className="space-y-3">
              {current.inputs ? (
                <div className="text-xs uppercase tracking-[0.16em] text-gray-500">
                  {niceLabel(current.inputs.sex)} • {current.inputs.age} • {niceLabel(current.inputs.activity)} •{" "}
                  {current.inputs.weightLbs} lb • {current.inputs.heightIn} in • {niceLabel(current.inputs.goal)}
                </div>
              ) : null}

              <div className="rounded-2xl bg-gray-900 p-4">
                <div className="text-3xl font-bold text-white">{current.calories} kcal</div>
                <div className="mt-2 text-sm text-gray-300">
                  P {current.protein} • C {current.carbs} • F {current.fat}
                </div>
              </div>

              {current.updatedAt ? (
                <div className="text-xs text-gray-500">
                  Last updated: {formatUpdatedAt(current.updatedAt)}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl bg-gray-900 p-4 text-sm text-gray-400">
              No macro targets set yet.
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Recent Meals" subtitle="A quick look at what you logged today.">
          {recentMeals.length > 0 ? (
            <ul className="space-y-2">
              {recentMeals.map((meal) => (
                <li key={meal.id} className="rounded-2xl bg-gray-900 px-4 py-3">
                  <div className="text-sm font-semibold text-white">{meal.name}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {meal.calories} kcal • P {meal.protein} • C {meal.carbs} • F {meal.fat}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl bg-gray-900 p-4 text-sm text-gray-400">
              No meals logged today yet.
            </div>
          )}

          <Link href="/meals" className="mt-3 block text-sm font-semibold text-blue-300 hover:text-blue-200">
            View Meals
          </Link>
        </DashboardCard>

        <DashboardCard title="Grocery Preview" subtitle="A quick snapshot of what still needs attention.">
          {groceryPreview.length > 0 ? (
            <ul className="space-y-2">
              {groceryPreview.map((item) => (
                <li key={item.id} className="rounded-2xl bg-gray-900 px-4 py-3 text-sm text-gray-200">
                  {item.name}
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl bg-gray-900 p-4 text-sm text-gray-400">
              Your grocery list is clear.
            </div>
          )}

          <Link
            href="/grocery"
            className="mt-3 block text-sm font-semibold text-emerald-300 hover:text-emerald-200"
          >
            View Grocery
          </Link>
        </DashboardCard>

        <DashboardCard title="History" subtitle="Restore or remove past macro target entries.">
          {history.length === 0 ? (
            <div className="rounded-2xl bg-gray-900 p-4 text-sm text-gray-400">
              No history yet. Calculate your macros to start saving entries.
            </div>
          ) : (
            <ul className="space-y-2">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between rounded-2xl border border-gray-700 bg-gray-900 p-4"
                >
                  <button
                    onClick={() => void restoreEntry(entry)}
                    className="flex-1 text-left"
                    title="Restore this entry"
                  >
                    <div className="text-sm font-semibold text-white">
                      {entry.calories} kcal • P {entry.protein} • C {entry.carbs} • F {entry.fat}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {formatUpdatedAt(entry.updatedAt)}
                      {entry.inputs ? (
                        <> • {niceLabel(entry.inputs.goal)} • {niceLabel(entry.inputs.activity)}</>
                      ) : null}
                    </div>
                  </button>

                  <button
                    onClick={() => void removeEntry(entry.id)}
                    className="ml-3 rounded-xl bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                    title="Delete entry"
                  >
                    X
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
