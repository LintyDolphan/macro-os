"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AppShell from "../../../components/AppShell";
import {
  getCurrentUser,
  getWorkoutSession,
  getWorkoutSessionExercises,
  getWorkoutSets,
  type ExerciseRecord,
  type WorkoutSessionExerciseRecord,
  type WorkoutSessionRecord,
  type WorkoutSetRecord,
} from "../../../lib/supabase/workouts-db";

type SessionExerciseDetail = {
  sessionExerciseId: string;
  exercise: ExerciseRecord | null;
  notes: string;
  sets: WorkoutSetRecord[];
};

function normalizeExerciseRecord(exercise: WorkoutSessionExerciseRecord["exercise"]) {
  if (!exercise) return null;
  return Array.isArray(exercise) ? exercise[0] ?? null : exercise;
}

function formatCompletedMeta(session: WorkoutSessionRecord) {
  const date = new Date(session.completed_at ?? session.session_date);
  const dateLabel = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const durationLabel =
    session.duration_sec && session.duration_sec > 0
      ? `${Math.max(1, Math.round(session.duration_sec / 60))} min`
      : "No duration";

  return `Completed ${dateLabel} - ${durationLabel}`;
}

function formatExerciseSummary(exercise: SessionExerciseDetail) {
  const totalSets = exercise.sets.length;
  const totalReps = exercise.sets.reduce((sum, set) => sum + (set.reps ?? 0), 0);
  const totalWeight = exercise.sets.reduce(
    (sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0),
    0
  );
  const totalDuration = exercise.sets.reduce((sum, set) => sum + (set.duration_sec ?? 0), 0);
  const totalDistance = exercise.sets.reduce((sum, set) => sum + (set.distance ?? 0), 0);

  const parts = [`${totalSets} sets`];
  if (totalReps > 0) parts.push(`${totalReps} total reps`);
  if (totalWeight > 0) parts.push(`${Math.round(totalWeight)} total volume`);
  if (totalDuration > 0) parts.push(`${Math.max(1, Math.round(totalDuration / 60))} min`);
  if (totalDistance > 0) parts.push(`${totalDistance} distance`);

  return parts.join(" - ");
}

function formatSetLine(set: WorkoutSetRecord, loggingStyle: ExerciseRecord["logging_style"] | undefined) {
  if (loggingStyle === "time") {
    return `${set.duration_sec ?? 0}s${set.completed ? " - done" : ""}`;
  }

  if (loggingStyle === "distance_time") {
    const distancePart = set.distance
      ? `${set.distance}${set.distance_unit ?? ""}`
      : "0";
    const durationPart = set.duration_sec ? `${set.duration_sec}s` : "0s";
    return `${distancePart} - ${durationPart}${set.completed ? " - done" : ""}`;
  }

  if (loggingStyle === "reps_only") {
    return `${set.reps ?? 0} reps${set.completed ? " - done" : ""}`;
  }

  const weightPart = set.weight != null ? `${set.weight}` : "0";
  const repsPart = set.reps != null ? `${set.reps} reps` : "0 reps";
  return `${weightPart} x ${repsPart}${set.completed ? " - done" : ""}`;
}

export default function WorkoutHistoryDetailPage() {
  const params = useParams<{ id: string }>();
  const sessionId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [session, setSession] = useState<WorkoutSessionRecord | null>(null);
  const [exerciseDetails, setExerciseDetails] = useState<SessionExerciseDetail[]>([]);
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

        if (!sessionId) {
          if (!active) return;
          setError("Workout session not found.");
          return;
        }

        const loadedSession = await getWorkoutSession(sessionId);
        const loadedSessionExercises = await getWorkoutSessionExercises(sessionId);
        const loadedSets = await Promise.all(
          loadedSessionExercises.map((exercise) => getWorkoutSets(exercise.id))
        );

        if (!active) return;

        setSession(loadedSession);
        setExerciseDetails(
          loadedSessionExercises.map((exercise, index) => ({
            sessionExerciseId: exercise.id,
            exercise: normalizeExerciseRecord(exercise.exercise),
            notes: exercise.notes ?? "",
            sets: loadedSets[index] ?? [],
          }))
        );
        setError(null);
      } catch (error) {
        if (!active) return;
        console.error("Failed to load workout history detail:", error);
        setError(error instanceof Error ? error.message : "Workout detail could not be loaded.");
      } finally {
        if (active) setAuthChecked(true);
      }
    }

    void init();

    return () => {
      active = false;
    };
  }, [sessionId]);

  const metrics = useMemo(() => {
    const totalSets = exerciseDetails.reduce((sum, exercise) => sum + exercise.sets.length, 0);
    const totalReps = exerciseDetails.reduce(
      (sum, exercise) => sum + exercise.sets.reduce((inner, set) => inner + (set.reps ?? 0), 0),
      0
    );
    const totalVolume = exerciseDetails.reduce(
      (sum, exercise) =>
        sum +
        exercise.sets.reduce((inner, set) => inner + (set.weight ?? 0) * (set.reps ?? 0), 0),
      0
    );
    const totalDistance = exerciseDetails.reduce(
      (sum, exercise) => sum + exercise.sets.reduce((inner, set) => inner + (set.distance ?? 0), 0),
      0
    );

    return [
      { label: "Total Sets", value: String(totalSets) },
      { label: "Total Reps", value: String(totalReps) },
      { label: "Volume", value: totalVolume > 0 ? `${Math.round(totalVolume)}` : "-" },
      { label: "Distance", value: totalDistance > 0 ? `${totalDistance}` : "-" },
    ];
  }, [exerciseDetails]);

  if (redirecting || !authChecked) {
    return (
      <AppShell
        title="Session Detail"
        subtitle="Review a completed workout"
        backHref="/workouts/history"
        backLabel="History"
      >
        <div className="text-sm text-gray-400">Loading...</div>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell
        title="Session Detail"
        subtitle="Review a completed workout"
        backHref="/workouts/history"
        backLabel="History"
      >
        <div className="rounded-3xl border border-dashed border-gray-700 bg-gray-800/40 p-5 text-sm text-gray-400">
          {error ?? "Workout session not found."}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Session Detail"
      subtitle="Review a completed workout"
      backHref="/workouts/history"
      backLabel="History"
    >
      <div className="space-y-4">
        {error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h1 className="text-2xl font-bold text-white">{session.name}</h1>
          <p className="mt-2 text-sm text-gray-400">{formatCompletedMeta(session)}</p>
          {session.notes ? <p className="mt-2 text-sm text-gray-500">{session.notes}</p> : null}
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-3">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-2xl bg-gray-900 p-4 text-center">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">{metric.label}</div>
                <div className="mt-2 text-sm font-semibold text-white">{metric.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Completed Exercises</h2>
          <div className="mt-4 space-y-3">
            {exerciseDetails.length > 0 ? (
              exerciseDetails.map((exercise) => (
                <div key={exercise.sessionExerciseId} className="rounded-2xl bg-gray-900 p-4">
                  <div className="text-sm font-semibold text-white">
                    {exercise.exercise?.name ?? "Exercise"}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">{formatExerciseSummary(exercise)}</div>
                  {exercise.notes ? (
                    <div className="mt-2 text-xs text-gray-500">{exercise.notes}</div>
                  ) : null}
                  <div className="mt-3 space-y-2">
                    {exercise.sets.length > 0 ? (
                      exercise.sets.map((set) => (
                        <div
                          key={set.id}
                          className="flex items-center justify-between rounded-xl border border-gray-800 px-3 py-2 text-xs text-gray-300"
                        >
                          <span>Set {set.set_number}</span>
                          <span>{formatSetLine(set, exercise.exercise?.logging_style)}</span>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-gray-800 px-3 py-2 text-xs text-gray-500">
                        No sets logged.
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-gray-900 p-4 text-sm text-gray-400">
                No completed exercises were found for this workout.
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
