"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import {
  getCurrentUser,
  listVisibleExercises,
  listWorkoutSessions,
  listWorkoutTemplates,
  type ExerciseRecord,
  type WorkoutSessionRecord,
  type WorkoutTemplateRecord,
} from "../lib/supabase/workouts-db";

const quickActionConfig = [
  {
    href: "/workouts/templates",
    title: "New Template",
    description: "Build and organize repeatable workouts.",
  },
  {
    href: "/workouts/exercises",
    title: "Exercise Library",
    description: "Browse exercises by focus, equipment, or category.",
  },
  {
    href: "/workouts/session/demo",
    title: "Log Quick Session",
    description: "Jump into a workout log without a saved template.",
  },
  {
    href: "/workouts/history",
    title: "History",
    description: "Review completed workouts and recent progress.",
  },
];

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = (day + 6) % 7;
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - diff);
  return next;
}

function formatSessionMeta(session: WorkoutSessionRecord) {
  const dateLabel = new Date(session.session_date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const durationLabel =
    session.duration_sec && session.duration_sec > 0
      ? `${Math.max(1, Math.round(session.duration_sec / 60))} min`
      : "Draft";

  return `${dateLabel} • ${durationLabel} • ${session.status === "completed" ? "Completed" : "In progress"}`;
}

function buildHeroCopy(
  activeSession: WorkoutSessionRecord | null,
  latestTemplate: WorkoutTemplateRecord | null
) {
  if (activeSession) {
    return {
      eyebrow: "Resume Session",
      title: activeSession.name,
      description: "Pick up where you left off and keep logging your workout live.",
      primaryHref: `/workouts/session/${activeSession.id}`,
      primaryLabel: "Resume Workout",
      secondaryHref: "/workouts/templates",
      secondaryLabel: "Browse Templates",
      chips: [
        activeSession.status === "in_progress" ? "In progress" : "Ready",
        activeSession.duration_sec
          ? `${Math.max(1, Math.round(activeSession.duration_sec / 60))} min logged`
          : "No duration yet",
        activeSession.session_date,
      ],
    };
  }

  if (latestTemplate) {
    return {
      eyebrow: "Ready To Train",
      title: latestTemplate.name,
      description: "Start from your most recently updated template or build something new.",
      primaryHref: `/workouts/session/${latestTemplate.id}`,
      primaryLabel: "Start Workout",
      secondaryHref: "/workouts/templates",
      secondaryLabel: "Browse Templates",
      chips: [
        `${latestTemplate.estimated_duration_min ?? 0} min`,
        latestTemplate.focus_tags[0] ?? "Template",
        "Unscheduled",
      ],
    };
  }

  return {
    eyebrow: "Today’s Workout",
    title: "No workout planned yet",
    description:
      "Start from a template or log a quick session to begin building your training history.",
    primaryHref: "/workouts/session/demo",
    primaryLabel: "Start Workout",
    secondaryHref: "/workouts/templates",
    secondaryLabel: "Browse Templates",
    chips: ["0 exercises", "0 min", "Unscheduled"],
  };
}

export default function WorkoutsPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [templates, setTemplates] = useState<WorkoutTemplateRecord[]>([]);
  const [sessions, setSessions] = useState<WorkoutSessionRecord[]>([]);
  const [exercises, setExercises] = useState<ExerciseRecord[]>([]);
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

        const [loadedTemplates, loadedSessions, loadedExercises] = await Promise.all([
          listWorkoutTemplates(user.id),
          listWorkoutSessions(user.id),
          listVisibleExercises(user.id),
        ]);

        if (!active) return;
        setTemplates(loadedTemplates);
        setSessions(loadedSessions);
        setExercises(loadedExercises);
        setError(null);
      } catch (error) {
        if (!active) return;
        console.error("Failed to initialize workouts page:", error);
        setError(error instanceof Error ? error.message : "Workout data could not be loaded.");
      } finally {
        if (active) setAuthChecked(true);
      }
    }

    void init();

    return () => {
      active = false;
    };
  }, []);

  const completedSessions = useMemo(
    () => sessions.filter((session) => session.status === "completed"),
    [sessions]
  );

  const activeSession = useMemo(
    () => sessions.find((session) => session.status === "in_progress") ?? null,
    [sessions]
  );

  const latestTemplate = templates[0] ?? null;

  const hero = buildHeroCopy(activeSession, latestTemplate);

  const recentWorkouts = completedSessions.slice(0, 3);

  const progressStats = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now);
    const sessionsThisWeek = completedSessions.filter((session) => {
      const sessionDate = new Date(session.session_date);
      return sessionDate >= weekStart;
    });

    const latestCompleted = completedSessions[0] ?? null;
    const totalMinutesThisWeek = sessionsThisWeek.reduce(
      (sum, session) => sum + Math.max(0, Math.round((session.duration_sec ?? 0) / 60)),
      0
    );

    return [
      { label: "This Week", value: `${sessionsThisWeek.length} workouts` },
      { label: "Library", value: `${exercises.length} exercises` },
      {
        label: "Minutes",
        value: `${totalMinutesThisWeek} min`,
      },
      {
        label: "Latest",
        value: latestCompleted ? latestCompleted.name : "No sessions yet",
      },
    ];
  }, [completedSessions, exercises.length]);

  if (redirecting || !authChecked) {
    return (
      <AppShell title="Workout" subtitle="Train, log, and track your progress">
        <div className="text-sm text-gray-400">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Workout" subtitle="Train, log, and track your progress">
      <div className="space-y-4">
        {error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="text-xs uppercase tracking-[0.18em] text-blue-300/80">
                {hero.eyebrow}
              </div>
              <h2 className="mt-2 text-xl font-bold text-white">{hero.title}</h2>
              <p className="mt-2 text-sm text-gray-400">{hero.description}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-300">
                {hero.chips.map((chip) => (
                  <span key={chip} className="rounded-full bg-gray-900 px-3 py-1.5">
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <Link
              href={hero.primaryHref}
              className="rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-700"
            >
              {hero.primaryLabel}
            </Link>
            <Link
              href={hero.secondaryHref}
              className="rounded-2xl bg-gray-900 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-gray-700"
            >
              {hero.secondaryLabel}
            </Link>
          </div>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Quick Actions</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {quickActionConfig.map((action) => (
              <Link
                key={action.href}
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
            <h2 className="text-lg font-semibold text-white">Recent Workouts</h2>
            <Link href="/workouts/history" className="text-sm font-semibold text-blue-300">
              See All
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {recentWorkouts.length > 0 ? (
              recentWorkouts.map((workout) => (
                <Link
                  key={workout.id}
                  href={`/workouts/history/${workout.id}`}
                  className="block rounded-2xl bg-gray-900 p-4 transition hover:bg-gray-700"
                >
                  <div className="text-sm font-semibold text-white">{workout.name}</div>
                  <div className="mt-1 text-xs text-gray-400">{formatSessionMeta(workout)}</div>
                </Link>
              ))
            ) : (
              <div className="rounded-2xl bg-gray-900 p-4 text-sm text-gray-400">
                No completed workouts yet. Your finished sessions will start showing up here.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Progress Snapshot</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {progressStats.map((stat) => (
              <div key={stat.label} className="rounded-2xl bg-gray-900 p-4 text-center">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">{stat.label}</div>
                <div className="mt-2 text-sm font-semibold text-white">{stat.value}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
