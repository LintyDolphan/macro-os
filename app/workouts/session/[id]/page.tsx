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
  type WorkoutTemplateExerciseRecord,
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
  planned_weight: number | null;
  planned_duration_sec: number | null;
  planned_distance: number | null;
  notes: string;
  sets: LocalSet[];
};

type SetDefaults = {
  reps?: number | null;
  weight?: number | null;
  duration_sec?: number | null;
  distance?: number | null;
  distance_unit?: DistanceUnit | null;
};

function normalizeExerciseRecord(exercise: WorkoutSessionExerciseRecord["exercise"]) {
  if (!exercise) return null;
  return Array.isArray(exercise) ? exercise[0] ?? null : exercise;
}

function toInputValue(value: number | null) {
  return value == null ? "" : String(value);
}

function stepInputValue(value: string, step: number, direction: 1 | -1) {
  const numericValue = Number(value);
  const baseValue = Number.isFinite(numericValue) ? numericValue : 0;
  const nextValue = Math.max(0, baseValue + step * direction);

  return nextValue === 0 ? "" : String(nextValue);
}

function resolveTemplateRepsTarget(exercise?: WorkoutTemplateExerciseRecord | null) {
  return (
    exercise?.target_reps ??
    exercise?.target_reps_max ??
    exercise?.target_reps_min ??
    null
  );
}

function buildSetDefaultsFromTemplate(
  exercise?: WorkoutTemplateExerciseRecord | null
): SetDefaults {
  return {
    reps: resolveTemplateRepsTarget(exercise),
    weight: exercise?.target_weight ?? null,
    duration_sec: exercise?.target_duration_sec ?? null,
    distance: exercise?.target_distance ?? null,
    distance_unit: exercise?.target_distance_unit ?? null,
  };
}

function createEmptySet(setNumber: number, defaults: SetDefaults = {}): LocalSet {
  return {
    set_number: setNumber,
    reps: toInputValue(defaults.reps ?? null),
    weight: toInputValue(defaults.weight ?? null),
    duration_sec: toInputValue(defaults.duration_sec ?? null),
    distance: toInputValue(defaults.distance ?? null),
    distance_unit: defaults.distance_unit ?? "",
    completed: false,
    notes: "",
  };
}

function mapWorkoutSetToLocal(set: WorkoutSetRecord, defaults: SetDefaults = {}): LocalSet {
  return {
    id: set.id,
    set_number: set.set_number,
    reps: toInputValue(set.reps ?? defaults.reps ?? null),
    weight: toInputValue(set.weight ?? defaults.weight ?? null),
    duration_sec: toInputValue(set.duration_sec ?? defaults.duration_sec ?? null),
    distance: toInputValue(set.distance ?? defaults.distance ?? null),
    distance_unit: set.distance_unit ?? defaults.distance_unit ?? "",
    completed: set.completed,
    notes: set.notes ?? "",
  };
}

function createInitialSets(targetSets: number | null, defaults: SetDefaults = {}) {
  const count = Math.max(1, targetSets ?? 0);
  return Array.from({ length: count }, (_, index) => createEmptySet(index + 1, defaults));
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

function getCompletionStats(exercises: SessionExerciseState[]) {
  const totalSets = exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
  const completedSets = exercises.reduce(
    (total, exercise) => total + exercise.sets.filter((set) => set.completed).length,
    0
  );

  return {
    completedSets,
    totalSets,
    percent: totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0,
  };
}

function buildPlanSummary(exercise: SessionExerciseState) {
  const parts: string[] = [];

  if (exercise.planned_sets) parts.push(`${exercise.planned_sets} sets`);
  if (exercise.planned_reps) parts.push(`${exercise.planned_reps} reps`);
  if (exercise.planned_weight) parts.push(`${exercise.planned_weight} lbs`);
  if (exercise.planned_duration_sec) {
    parts.push(`${Math.max(1, Math.round(exercise.planned_duration_sec / 60))} min`);
  }
  if (exercise.planned_distance) parts.push(`${exercise.planned_distance} distance`);

  return parts.length > 0 ? parts.join(" - ") : "No target plan set";
}

function buildSetTargetSummary(exercise: SessionExerciseState) {
  const parts: string[] = [];

  if (exercise.planned_weight) parts.push(`${exercise.planned_weight} lbs`);
  if (exercise.planned_reps) parts.push(`${exercise.planned_reps} reps`);
  if (exercise.planned_duration_sec) parts.push(`${exercise.planned_duration_sec}s`);
  if (exercise.planned_distance) parts.push(`${exercise.planned_distance} distance`);

  return parts.length > 0 ? `Target: ${parts.join(" - ")}` : "No set target";
}

function buildSessionExerciseState(
  sessionExercise: WorkoutSessionExerciseRecord,
  sets: WorkoutSetRecord[],
  templateExercise?: WorkoutTemplateExerciseRecord | null
): SessionExerciseState {
  const exercise = normalizeExerciseRecord(sessionExercise.exercise);
  const defaults = buildSetDefaultsFromTemplate(templateExercise);
  const plannedReps = sessionExercise.planned_reps ?? defaults.reps ?? null;

  return {
    sessionExerciseId: sessionExercise.id,
    templateExerciseId: sessionExercise.template_exercise_id,
    exerciseId: sessionExercise.exercise_id,
    exercise,
    planned_sets: sessionExercise.planned_sets,
    planned_reps: plannedReps,
    planned_weight: defaults.weight ?? null,
    planned_duration_sec: sessionExercise.planned_duration_sec ?? defaults.duration_sec ?? null,
    planned_distance: sessionExercise.planned_distance ?? defaults.distance ?? null,
    notes: sessionExercise.notes ?? "",
    sets:
      sets.length > 0
        ? sets.map((set) => mapWorkoutSetToLocal(set, { ...defaults, reps: plannedReps }))
        : createInitialSets(sessionExercise.planned_sets, { ...defaults, reps: plannedReps }),
  };
}

function buildSetDefaultsFromSessionExercise(exercise: SessionExerciseState): SetDefaults {
  return {
    reps: exercise.planned_reps,
    weight: exercise.planned_weight,
    duration_sec: exercise.planned_duration_sec,
    distance: exercise.planned_distance,
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
                planned_reps: resolveTemplateRepsTarget(exercise),
                planned_duration_sec: exercise.target_duration_sec,
                planned_distance: exercise.target_distance,
                notes: exercise.notes,
              }))
            );

            await Promise.all(
              createdSessionExercises.map((sessionExercise, index) =>
                replaceWorkoutSets(
                  sessionExercise.id,
                  createInitialSets(
                    templateExercises[index]?.target_sets ?? null,
                    buildSetDefaultsFromTemplate(templateExercises[index])
                  ).map((set) => ({
                    set_number: set.set_number,
                    reps: set.reps ? Number(set.reps) : null,
                    weight: set.weight ? Number(set.weight) : null,
                    duration_sec: set.duration_sec ? Number(set.duration_sec) : null,
                    distance: set.distance ? Number(set.distance) : null,
                    distance_unit: set.distance_unit || null,
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
        const sessionTemplateExercises = liveSession.template_id
          ? await getWorkoutTemplateExercises(liveSession.template_id)
          : [];
        const templateExerciseById = new Map(
          sessionTemplateExercises.map((exercise) => [exercise.id, exercise])
        );

        if (!active) return;

        setSession(liveSession);
        setSessionExercises(
          loadedSessionExercises.map((exercise, index) =>
            buildSessionExerciseState(
              exercise,
              loadedSets[index] ?? [],
              exercise.template_exercise_id
                ? templateExerciseById.get(exercise.template_exercise_id) ?? null
                : null
            )
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

  const completionStats = useMemo(() => getCompletionStats(sessionExercises), [sessionExercises]);

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
              sets: exercise.sets.map((set) => {
                if (set.set_number !== setNumber) return set;

                const defaults = buildSetDefaultsFromSessionExercise(exercise);

                return {
                  ...set,
                  ...(field === "completed" && value === true
                    ? {
                        reps: set.reps || toInputValue(defaults.reps ?? null),
                        weight: set.weight || toInputValue(defaults.weight ?? null),
                        duration_sec:
                          set.duration_sec || toInputValue(defaults.duration_sec ?? null),
                        distance: set.distance || toInputValue(defaults.distance ?? null),
                      }
                    : null),
                  [field]: value,
                };
              }),
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
              sets: [
                ...exercise.sets,
                createEmptySet(
                  exercise.sets.length + 1,
                  buildSetDefaultsFromSessionExercise(exercise)
                ),
              ],
            }
      )
    );
  }

  function removeSet(sessionExerciseId: string) {
    setSessionExercises((current) =>
      current.map((exercise) =>
        exercise.sessionExerciseId !== sessionExerciseId || exercise.sets.length <= 1
          ? exercise
          : {
              ...exercise,
              sets: exercise.sets.slice(0, -1),
            }
      )
    );
  }

  function stepSetValue(
    sessionExerciseId: string,
    setNumber: number,
    field: "reps" | "weight",
    step: number,
    direction: 1 | -1
  ) {
    setSessionExercises((current) =>
      current.map((exercise) =>
        exercise.sessionExerciseId !== sessionExerciseId
          ? exercise
          : {
              ...exercise,
              sets: exercise.sets.map((set) =>
                set.set_number !== setNumber
                  ? set
                  : {
                      ...set,
                      [field]: stepInputValue(set[field], step, direction),
                    }
              ),
            }
      )
    );
  }

  function renderSetStepper(
    exercise: SessionExerciseState,
    set: LocalSet,
    field: "reps" | "weight",
    label: string,
    step: number,
    inputMode: "numeric" | "decimal"
  ) {
    return (
      <div className="min-w-0">
        <div className="mb-1 text-center text-[9px] font-semibold uppercase tracking-[0.16em] text-gray-500">
          {label}
        </div>
        <div className="grid grid-cols-[1.8rem_minmax(0,1fr)_1.8rem] items-center gap-1">
          <button
            type="button"
            onClick={() => stepSetValue(exercise.sessionExerciseId, set.set_number, field, step, -1)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-950 text-sm font-bold text-white transition hover:bg-gray-700"
            aria-label={`Decrease ${label.toLowerCase()} for set ${set.set_number}`}
          >
            -
          </button>
          <input
            value={set[field]}
            onChange={(event) =>
              updateSet(exercise.sessionExerciseId, set.set_number, field, event.target.value)
            }
            inputMode={inputMode}
            placeholder="0"
            className="min-w-0 rounded-xl bg-gray-900/70 px-1 py-1 text-center text-sm font-semibold text-white outline-none placeholder:text-gray-600 focus:bg-gray-900"
            aria-label={`${label} for set ${set.set_number}`}
          />
          <button
            type="button"
            onClick={() => stepSetValue(exercise.sessionExerciseId, set.set_number, field, step, 1)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-950 text-sm font-bold text-white transition hover:bg-blue-600"
            aria-label={`Increase ${label.toLowerCase()} for set ${set.set_number}`}
          >
            +
          </button>
        </div>
      </div>
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

  async function handleFinishWorkout() {
    setFinishing(true);
    setError(null);

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

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white">{session.name}</h1>
              <p className="mt-1 text-sm text-gray-400">{progressCopy}</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="flex min-h-14 flex-col items-center justify-center rounded-2xl bg-gray-900 px-3 py-2 text-center">
                <div className="text-lg font-bold text-white">{completionStats.percent}%</div>
                <div className="text-[10px] uppercase tracking-wide text-gray-500">Done</div>
              </div>
              <button
                type="button"
                onClick={() => void handleFinishWorkout()}
                disabled={finishing}
                className="min-h-14 rounded-2xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {finishing ? "Finishing..." : "Finish"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-gray-400">
            <span>Set Progress</span>
            <span>
              {completionStats.completedSets} of {completionStats.totalSets} complete
            </span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-900">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all duration-300"
              style={{ width: `${completionStats.percent}%` }}
            />
          </div>
        </section>

        {sessionExercises.length > 0 ? (
          sessionExercises.map((exercise, index) => {
            const loggingStyle = exercise.exercise?.logging_style;
            const exerciseComplete =
              exercise.sets.length > 0 && exercise.sets.every((set) => set.completed);

            return (
              <section
                key={exercise.sessionExerciseId}
                className={`rounded-3xl border p-5 shadow-sm transition ${
                  exerciseComplete
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-gray-700 bg-gray-800"
                }`}
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

                <div className="mt-4 rounded-3xl border border-gray-700 bg-gray-900 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Confirm Sets
                      </div>
                      <div className="mt-1 text-xs text-gray-400">
                        {buildSetTargetSummary(exercise)}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">
                      {exercise.sets.filter((set) => set.completed).length}/{exercise.sets.length} done
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {exercise.sets.map((set) => (
                      <div
                        key={`${exercise.sessionExerciseId}-${set.set_number}`}
                        className={`grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-2 rounded-2xl border p-2 ${
                          set.completed
                            ? "border-emerald-500/40 bg-emerald-500/10"
                            : "border-gray-700 bg-gray-800"
                        }`}
                      >
                        <div className="min-w-0">
                          {loggingStyle === "time" ? (
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
                              placeholder="Seconds"
                              className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                            />
                          ) : loggingStyle === "distance_time" ? (
                            <div className="grid grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)] gap-2">
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
                                placeholder="Distance"
                                className="min-w-0 rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-500"
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
                                className="rounded-xl border border-gray-700 bg-gray-900 px-2 py-2 text-sm text-white"
                              >
                                <option value="">Unit</option>
                                <option value="km">km</option>
                                <option value="mi">mi</option>
                                <option value="m">m</option>
                              </select>
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
                                placeholder="Seconds"
                                className="min-w-0 rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                              />
                            </div>
                          ) : loggingStyle === "reps_only" ? (
                            <div>
                              {renderSetStepper(exercise, set, "reps", "Reps", 1, "numeric")}
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-2">
                              {renderSetStepper(exercise, set, "weight", "Weight", 5, "decimal")}
                              {renderSetStepper(exercise, set, "reps", "Reps", 1, "numeric")}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            updateSet(
                              exercise.sessionExerciseId,
                              set.set_number,
                              "completed",
                              !set.completed
                            )
                          }
                          className={`h-10 w-10 rounded-full text-lg font-bold transition ${
                            set.completed
                              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                              : "bg-red-500/15 text-red-200 hover:bg-red-500/25"
                          }`}
                          aria-label={`${set.completed ? "Unconfirm" : "Confirm"} set ${set.set_number}`}
                        >
                          {set.completed ? "✓" : "×"}
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => addSet(exercise.sessionExerciseId)}
                      className="rounded-2xl bg-gray-800 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700"
                    >
                      Add Set
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSet(exercise.sessionExerciseId)}
                      disabled={exercise.sets.length <= 1}
                      className="rounded-2xl bg-gray-800 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Remove Set
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-gray-900 px-4 py-3 text-sm text-gray-400">
                  {exercise.notes || "No notes for this exercise yet."}
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
