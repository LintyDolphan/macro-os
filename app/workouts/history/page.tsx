"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import {
  getCurrentUser,
  listWorkoutSessions,
  type WorkoutSessionRecord,
} from "../../lib/supabase/workouts-db";

function formatSessionMeta(session: WorkoutSessionRecord) {
  const date = new Date(session.session_date);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const dateLabel = isToday
    ? "Today"
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
  const durationLabel =
    session.duration_sec && session.duration_sec > 0
      ? `${Math.max(1, Math.round(session.duration_sec / 60))} min`
      : "No duration";

  return `${dateLabel} - ${durationLabel} - ${
    session.status === "completed" ? "Completed" : "In progress"
  }`;
}

export default function WorkoutHistoryPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [search, setSearch] = useState("");
  const [sessions, setSessions] = useState<WorkoutSessionRecord[]>([]);
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

        const loadedSessions = await listWorkoutSessions(user.id);
        if (!active) return;

        setSessions(loadedSessions);
        setError(null);
      } catch (error) {
        if (!active) return;
        console.error("Failed to initialize workout history:", error);
        setError(error instanceof Error ? error.message : "Workout history could not be loaded.");
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

  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return completedSessions;

    return completedSessions.filter((session) => {
      const fields = [session.name, session.notes ?? "", session.session_date];
      return fields.some((field) => field.toLowerCase().includes(query));
    });
  }, [completedSessions, search]);

  if (redirecting || !authChecked) {
    return (
      <AppShell title="History" subtitle="Review completed workouts" backHref="/workouts" backLabel="Workout">
        <div className="text-sm text-gray-400">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="History" subtitle="Review completed workouts" backHref="/workouts" backLabel="Workout">
      <div className="space-y-4">
        {error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workout history..."
            className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder:text-gray-500"
          />
        </section>

        <div className="space-y-3">
          {filteredSessions.length > 0 ? (
            filteredSessions.map((session) => (
              <Link
                key={session.id}
                href={`/workouts/history/${session.id}`}
                className="block rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm transition hover:bg-gray-700"
              >
                <div className="text-sm font-semibold text-white">{session.name}</div>
                <div className="mt-1 text-xs text-gray-400">{formatSessionMeta(session)}</div>
                {session.notes ? (
                  <div className="mt-2 line-clamp-2 text-xs leading-5 text-gray-500">{session.notes}</div>
                ) : null}
              </Link>
            ))
          ) : (
            <div className="rounded-3xl border border-dashed border-gray-700 bg-gray-800/40 p-5 text-sm text-gray-400">
              {completedSessions.length === 0
                ? "No completed workouts yet. Finish a live session and it will show up here."
                : `No completed workouts match "${search.trim()}".`}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
