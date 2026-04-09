"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AppShell from "../../../components/AppShell";
import {
  createWorkoutSession,
  createWorkoutSessionExercises,
  getCurrentUser,
  getWorkoutSessionByIdMaybe,
  getWorkoutSessionExercises,
  getWorkoutSets,
  getWorkoutTemplate,
  getWorkoutTemplateExercises,
  replaceWorkoutSets,
  updateWorkoutSession,
  type DistanceUnit,
  type ExerciseRecord,
  type WorkoutSessionExerciseRecord,
  type WorkoutSessionRecord,
  type WorkoutSetRecord,
} from "../../../lib/supabase/workouts-db";

type LocalSet = {
  id?: string;
  set_number: number;
  reps: string;
  weight: string;
  duration_sec: string;
  distance: string;
  distance_unit: DistanceUnit | "";
  completed: boolean;
  notes: string;
};

type SessionExerciseState = {
  sessionExerciseId: string;
  templateExerciseId: string | null;
  exerciseId: string;
  exercise: ExerciseRecord | null;
  planned_sets: number | null;
  planned_reps: number | null;
  planned_duration_sec: number | null;
  planned_distance: number | null;
  notes: string;
  sets: LocalSet[];
};

function normalizeExerciseRecord(exercise: WorkoutSessionExerciseRecord["exercise"]) {
  if (!exercise) return null;
  return Array.isArray(exercise) ? exercise[0] ?? null : exercise;
}

function toInputValue(value: number | null) {
  return value == null ? "" : String(value);
}

function createEmptySet(setNumber: number): LocalSet {
  return {
    set_number: setNumber,
    reps: "",
    weight: "",
    duration_sec: "",
    distance: "",
    distance_unit: "",
    completed: false,
    notes: "",
  };
}

function mapWorkoutSetToLocal(set: WorkoutSetRecord): LocalSet {
  return {
    id: set.id,
    set_number: set.set_number,
    reps: toInputValue(set.reps),
    weight: toInputValue(set.weight),
    duration_sec: toInputValue(set.duration_sec),
    distance: toInputValue(set.distance),
    distance_unit: set.distance_unit ?? "",
    completed: set.completed,
    notes: set.notes ?? "",
  };
}

function createInitialSets(targetSets: number | null) {
  const count = Math.max(1, targetSets ?? 0);
  return Array.from({ length: count }, (_, index) => createEmptySet(index + 1));
}

function formatElapsed(session: WorkoutSessionRecord) {
  const seconds =
    session.status === "completed"
      ? session.duration_sec ?? 0
      : session.started_at
        ? Math.max(
            0,
            Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000)
          )
        : session.duration_sec ?? 0;

  const minutes = Math.max(0, Math.round(seconds / 60));
  return `${minutes} min elapsed`;
}

function formatExerciseProgress(exercises: SessionExerciseState[]) {
  const completed = exercises.filter((exercise) => exercise.sets.every((set) => set.completed)).length;
  return `${completed} of ${exercises.length} exercises done`;
}

function buildPlanSummary(exercise: SessionExerciseState) {
  const parts: string[] = [];

  if (exercise.planned_sets) parts.push(`${exercise.planned_sets} sets`);
  if (exercise.planned_reps) parts.push(`${exercise.planned_reps} reps`);
  if (exercise.planned_duration_sec) {
    parts.push(`${Math.max(1, Math.round(exercise.planned_duration_sec / 60))} min`);
  }
  if (exercise.planned_distance) parts.push(`${exercise.planned_distance} distance`);

  return parts.length > 0 ? parts.join(" - ") : "No target plan set";
}

function buildSessionExerciseState(
  sessionExercise: WorkoutSessionExerciseRecord,
  sets: WorkoutSetRecord[]
): SessionExerciseState {
  const exercise = normalizeExerciseRecord(sessionExercise.exercise);

  return {
    sessionExerciseId: sessionExercise.id,
    templateExerciseId: sessionExercise.template_exercise_id,
    exerciseId: sessionExercise.exercise_id,
    exercise,
    planned_sets: sessionExercise.planned_sets,
    planned_reps: sessionExercise.planned_reps,
    planned_duration_sec: sessionExercise.planned_duration_sec,
    planned_distance: sessionExercise.planned_distance,
    notes: sessionExercise.notes ?? "",
    sets: sets.length > 0 ? sets.map(mapWorkoutSetToLocal) : createInitialSets(sessionExercise.planned_sets),
  };
}

function setsPayload(sets: LocalSet[]) {
  return sets.map((set, index) => ({
    set_number: index + 1,
    reps: set.reps ? Number(set.reps) : null,
    weight: set.weight ? Number(set.weight) : null,
    duration_sec: set.duration_sec ? Number(set.duration_sec) : null,
    distance: set.distance ? Number(set.distance) : null,
    distance_unit: set.distance_unit || null,
    completed: set.completed,
    notes: set.notes || null,
  }));
}

function renderSetHeaders(loggingStyle: ExerciseRecord["logging_style"] | undefined) {
  switch (loggingStyle) {
    case "time":
      return ["Set", "Time (sec)", "Done"];
    case "distance_time":
      return ["Set", "Distance", "Time (sec)", "Done"];
    case "reps_only":
      return ["Set", "Reps", "Done"];
    default:
      return ["Set", "Weight", "Reps", "Done"];
  }
}

export default function WorkoutSessionPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const routeId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [session, setSession] = useState<WorkoutSessionRecord | null>(null);
  const [sessionExercises, setSessionExercises] = useState<SessionExerciseState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);

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

        if (!routeId) {
          if (!active) return;
          setError("Workout session not found.");
          return;
        }

        setUserId(user.id);

        let liveSession = await getWorkoutSessionByIdMaybe(routeId);

        if (!liveSession) {
          if (routeId === "demo") {
            liveSession = await createWorkoutSession(user.id, {
              name: "Quick Session",
              status: "in_progress",
              started_at: new Date().toISOString(),
            });
          } else {
            const template = await getWorkoutTemplate(routeId);
            const templateExercises = await getWorkoutTemplateExercises(routeId);

            liveSession = await createWorkoutSession(user.id, {
              template_id: template.id,
              name: template.name,
              status: "in_progress",
              started_at: new Date().toISOString(),
            });

            const createdSessionExercises = await createWorkoutSessionExercises(
              liveSession.id,
              templateExercises.map((exercise, index) => ({
                exercise_id: exercise.exercise_id,
                template_exercise_id: exercise.id,
                sort_order: index,
                planned_sets: exercise.target_sets,
                planned_reps: exercise.target_reps ?? exercise.target_reps_max,
                planned_duration_sec: exercise.target_duration_sec,
                planned_distance: exercise.target_distance,
                notes: exercise.notes,
              }))
            );

            await Promise.all(
              createdSessionExercises.map((sessionExercise, index) =>
                replaceWorkoutSets(
                  sessionExercise.id,
                  createInitialSets(templateExercises[index]?.target_sets ?? null).map((set) => ({
                    set_number: set.set_number,
                    completed: set.completed,
                  }))
                )
              )
            );
          }
        }

        const loadedSessionExercises = await getWorkoutSessionExercises(liveSession.id);
        const loadedSets = await Promise.all(
          loadedSessionExercises.map((exercise) => getWorkoutSets(exercise.id))
        );

        if (!active) return;

        setSession(liveSession);
        setSessionExercises(
          loadedSessionExercises.map((exercise, index) =>
            buildSessionExerciseState(exercise, loadedSets[index] ?? [])
          )
        );
        setError(null);
      } catch (error) {
        if (!active) return;
        console.error("Failed to initialize workout session:", error);
        setError(error instanceof Error ? error.message : "Workout session could not be loaded.");
      } finally {
        if (active) setAuthChecked(true);
      }
    }

    void init();

    return () => {
      active = false;
    };
  }, [routeId]);

  const progressCopy = useMemo(() => {
    if (!session) return "Loading session";
    if (sessionExercises.length === 0) return `${formatElapsed(session)} - No exercises yet`;
    return `${formatElapsed(session)} - ${formatExerciseProgress(sessionExercises)}`;
  }, [session, sessionExercises]);

  function updateSet(
    sessionExerciseId: string,
    setNumber: number,
    field: keyof LocalSet,
    value: string | boolean
  ) {
    setSessionExercises((current) =>
      current.map((exercise) =>
        exercise.sessionExerciseId !== sessionExerciseId
          ? exercise
          : {
              ...exercise,
              sets: exercise.sets.map((set) =>
                set.set_number === setNumber ? { ...set, [field]: value } : set
              ),
            }
      )
    );
  }

  function addSet(sessionExerciseId: string) {
    setSessionExercises((current) =>
      current.map((exercise) =>
        exercise.sessionExerciseId !== sessionExerciseId
          ? exercise
          : {
              ...exercise,
              sets: [...exercise.sets, createEmptySet(exercise.sets.length + 1)],
            }
      )
    );
  }

  async function persistSession(nextStatus?: WorkoutSessionRecord["status"]) {
    if (!session || !userId) return null;

    const now = new Date();
    const startedAt = session.started_at ? new Date(session.started_at) : now;
    const durationSec = Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 1000));

    await Promise.all(
      sessionExercises.map((exercise) =>
        replaceWorkoutSets(exercise.sessionExerciseId, setsPayload(exercise.sets))
      )
    );

    const updatedSession = await updateWorkoutSession(session.id, userId, {
      duration_sec: durationSec,
      status: nextStatus ?? session.status,
      completed_at: nextStatus === "completed" ? now.toISOString() : session.completed_at,
    });

    setSession(updatedSession);
    return updatedSession;
  }

  async function handleSaveProgress() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await persistSession();
      setMessage("Workout progress saved.");
    } catch (error) {
      console.error("Failed to save workout progress:", error);
      setError(error instanceof Error ? error.message : "Workout progress could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function handleFinishWorkout() {
    setFinishing(true);
    setError(null);
    setMessage(null);

    try {
      const updatedSession = await persistSession("completed");
      if (updatedSession) {
        router.replace(`/workouts/history/${updatedSession.id}`);
      }
    } catch (error) {
      console.error("Failed to finish workout:", error);
      setError(error instanceof Error ? error.message : "Workout could not be finished.");
      setFinishing(false);
    }
  }

  if (redirecting || !authChecked) {
    return (
      <AppShell title="Session" subtitle="Log your workout live" backHref="/workouts" backLabel="Workout">
        <div className="text-sm text-gray-400">Loading...</div>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell title="Session" subtitle="Log your workout live" backHref="/workouts" backLabel="Workout">
        <div className="rounded-3xl border border-dashed border-gray-700 bg-gray-800/40 p-5 text-sm text-gray-400">
          {error ?? "Workout session not found."}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Session" subtitle="Log your workout live" backHref="/workouts" backLabel="Workout">
      <div className="space-y-4 pb-24">
        {error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {message}
          </div>
        ) : null}

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-white">{session.name}</h1>
              <p className="mt-1 text-sm text-gray-400">{progressCopy}</p>
            </div>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => void handleSaveProgress()}
                disabled={saving || finishing}
                className="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => void handleFinishWorkout()}
                disabled={saving || finishing}
                className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {finishing ? "Finishing..." : "Finish"}
              </button>
            </div>
          </div>
        </section>

        {sessionExercises.length > 0 ? (
          sessionExercises.map((exercise, index) => {
            const loggingStyle = exercise.exercise?.logging_style;
            const headers = renderSetHeaders(loggingStyle);

            return (
              <section
                key={exercise.sessionExerciseId}
                className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      {exercise.exercise?.name ?? `Exercise ${index + 1}`}
                    </h2>
                    <p className="mt-1 text-xs text-gray-400">{buildPlanSummary(exercise)}</p>
                  </div>
                  <div className="rounded-2xl bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-300">
                    Exercise {index + 1}
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl border border-gray-700">
                  <div
                    className={`grid bg-gray-900 px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 ${
                      headers.length === 3 ? "grid-cols-3" : "grid-cols-4"
                    }`}
                  >
                    {headers.map((header) => (
                      <div key={header}>{header}</div>
                    ))}
                  </div>

                  {exercise.sets.map((set) => (
                    <div
                      key={`${exercise.sessionExerciseId}-${set.set_number}`}
                      className={`grid items-center gap-2 border-t border-gray-700 px-3 py-3 text-sm text-white ${
                        headers.length === 3 ? "grid-cols-3" : "grid-cols-4"
                      }`}
                    >
                      <div>{set.set_number}</div>

                      {loggingStyle === "time" ? (
                        <>
                          <input
                            value={set.duration_sec}
                            onChange={(e) =>
                              updateSet(
                                exercise.sessionExerciseId,
                                set.set_number,
                                "duration_sec",
                                e.target.value
                              )
                            }
                            inputMode="numeric"
                            placeholder="0"
                            className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                          />
                          <label className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={set.completed}
                              onChange={(e) =>
                                updateSet(
                                  exercise.sessionExerciseId,
                                  set.set_number,
                                  "completed",
                                  e.target.checked
                                )
                              }
                              className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-blue-500"
                            />
                          </label>
                        </>
                      ) : loggingStyle === "distance_time" ? (
                        <>
                          <div className="flex gap-2">
                            <input
                              value={set.distance}
                              onChange={(e) =>
                                updateSet(
                                  exercise.sessionExerciseId,
                                  set.set_number,
                                  "distance",
                                  e.target.value
                                )
                              }
                              inputMode="decimal"
                              placeholder="0"
                              className="min-w-0 flex-1 rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                            />
                            <select
                              value={set.distance_unit}
                              onChange={(e) =>
                                updateSet(
                                  exercise.sessionExerciseId,
                                  set.set_number,
                                  "distance_unit",
                                  e.target.value as DistanceUnit | ""
                                )
                              }
                              className="w-20 rounded-xl border border-gray-700 bg-gray-900 px-2 py-2 text-sm text-white"
                            >
                              <option value="">Unit</option>
                              <option value="km">km</option>
                              <option value="mi">mi</option>
                              <option value="m">m</option>
                            </select>
                          </div>
                          <input
                            value={set.duration_sec}
                            onChange={(e) =>
                              updateSet(
                                exercise.sessionExerciseId,
                                set.set_number,
                                "duration_sec",
                                e.target.value
                              )
                            }
                            inputMode="numeric"
                            placeholder="0"
                            className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                          />
                          <label className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={set.completed}
                              onChange={(e) =>
                                updateSet(
                                  exercise.sessionExerciseId,
                                  set.set_number,
                                  "completed",
                                  e.target.checked
                                )
                              }
                              className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-blue-500"
                            />
                          </label>
                        </>
                      ) : loggingStyle === "reps_only" ? (
                        <>
                          <input
                            value={set.reps}
                            onChange={(e) =>
                              updateSet(
                                exercise.sessionExerciseId,
                                set.set_number,
                                "reps",
                                e.target.value
                              )
                            }
                            inputMode="numeric"
                            placeholder="0"
                            className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                          />
                          <label className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={set.completed}
                              onChange={(e) =>
                                updateSet(
                                  exercise.sessionExerciseId,
                                  set.set_number,
                                  "completed",
                                  e.target.checked
                                )
                              }
                              className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-blue-500"
                            />
                          </label>
                        </>
                      ) : (
                        <>
                          <input
                            value={set.weight}
                            onChange={(e) =>
                              updateSet(
                                exercise.sessionExerciseId,
                                set.set_number,
                                "weight",
                                e.target.value
                              )
                            }
                            inputMode="decimal"
                            placeholder="0"
                            className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                          />
                          <input
                            value={set.reps}
                            onChange={(e) =>
                              updateSet(
                                exercise.sessionExerciseId,
                                set.set_number,
                                "reps",
                                e.target.value
                              )
                            }
                            inputMode="numeric"
                            placeholder="0"
                            className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                          />
                          <label className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={set.completed}
                              onChange={(e) =>
                                updateSet(
                                  exercise.sessionExerciseId,
                                  set.set_number,
                                  "completed",
                                  e.target.checked
                                )
                              }
                              className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-blue-500"
                            />
                          </label>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => addSet(exercise.sessionExerciseId)}
                    className="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700"
                  >
                    Add Set
                  </button>
                  <div className="flex-1 rounded-2xl bg-gray-900 px-4 py-3 text-sm text-gray-400">
                    {exercise.notes || "No notes for this exercise yet."}
                  </div>
                </div>
              </section>
            );
          })
        ) : (
          <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
            <div className="text-sm text-gray-400">
              This session has no exercises yet. Start from a template to prefill your workout.
            </div>
            <Link
              href="/workouts/templates"
              className="mt-4 inline-flex rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Browse Templates
            </Link>
          </section>
        )}
      </div>
    </AppShell>
  );
}
