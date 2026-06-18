"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import {
  appendWorkoutTemplateExercise,
  createExercise,
  getCurrentUser,
  listVisibleExercises,
  type ExerciseRecord,
} from "../../lib/supabase/workouts-db";
import type { NormalizedExerciseCandidate } from "../../lib/catalog/types";

const filterDefinitions = [
  {
    key: "all",
    label: "All",
    matches: () => true,
  },
  {
    key: "strength",
    label: "Strength",
    matches: (exercise: ExerciseRecord) => exercise.category === "strength",
  },
  {
    key: "cardio",
    label: "Cardio",
    matches: (exercise: ExerciseRecord) => exercise.category === "cardio",
  },
  {
    key: "mobility",
    label: "Mobility",
    matches: (exercise: ExerciseRecord) => exercise.category === "mobility",
  },
  {
    key: "core",
    label: "Core",
    matches: (exercise: ExerciseRecord) =>
      exercise.category === "core" ||
      exercise.primary_muscle_group?.toLowerCase().includes("core") === true,
  },
  {
    key: "upper",
    label: "Upper",
    matches: (exercise: ExerciseRecord) =>
      ["chest", "back", "shoulders", "biceps", "triceps", "upper body"].includes(
        (exercise.primary_muscle_group ?? "").toLowerCase()
      ),
  },
  {
    key: "lower",
    label: "Lower",
    matches: (exercise: ExerciseRecord) =>
      ["quads", "glutes", "hamstrings", "calves", "legs", "lower body"].includes(
        (exercise.primary_muscle_group ?? "").toLowerCase()
      ),
  },
  {
    key: "bodyweight",
    label: "Bodyweight",
    matches: (exercise: ExerciseRecord) =>
      exercise.equipment.some((item) => item.toLowerCase().includes("bodyweight")),
  },
];

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatExerciseMeta(exercise: ExerciseRecord) {
  const parts = [
    titleCase(exercise.category),
    exercise.primary_muscle_group,
    exercise.equipment[0],
  ].filter(Boolean);

  return parts.join(" - ");
}

function formatLibraryBadge(exercise: ExerciseRecord) {
  return exercise.is_public ? "Verified Library" : "My Exercise";
}

function defaultExternalQuery(activeFilter: string) {
  switch (activeFilter) {
    case "strength":
      return "press";
    case "cardio":
      return "run";
    case "mobility":
      return "stretch";
    case "core":
      return "plank";
    case "lower":
      return "squat";
    case "bodyweight":
    case "upper":
      return "push";
    default:
      return "push";
  }
}

function externalMatchesFilter(exercise: NormalizedExerciseCandidate, activeFilter: string) {
  const category = exercise.category.toLowerCase();
  const primary = exercise.primaryMuscleGroup?.toLowerCase() ?? "";
  const equipment = exercise.equipment.join(" ").toLowerCase();

  switch (activeFilter) {
    case "strength":
    case "cardio":
    case "mobility":
      return category === activeFilter;
    case "core":
      return category === "core" || primary.includes("abdominal") || primary.includes("core");
    case "upper":
      return ["chest", "back", "shoulders", "biceps", "triceps"].some((muscle) =>
        primary.includes(muscle)
      );
    case "lower":
      return ["quads", "glutes", "hamstrings", "calves", "legs"].some((muscle) =>
        primary.includes(muscle)
      );
    case "bodyweight":
      return equipment.includes("bodyweight") || equipment.includes("none");
    default:
      return true;
  }
}

function formatExternalExerciseMeta(exercise: NormalizedExerciseCandidate) {
  const parts = [
    titleCase(exercise.category),
    exercise.primaryMuscleGroup,
    exercise.equipment[0],
  ].filter(Boolean);

  return parts.join(" - ");
}

function WorkoutExercisesPageContent() {
  const searchParams = useSearchParams();
  const templateId = searchParams.get("templateId");
  const templatePickerMode = searchParams.get("pickForTemplate") === "1" && Boolean(templateId);
  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [exercises, setExercises] = useState<ExerciseRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [externalExercises, setExternalExercises] = useState<NormalizedExerciseCandidate[]>([]);
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalConfigured, setExternalConfigured] = useState<boolean | null>(null);
  const [externalError, setExternalError] = useState<string | null>(null);
  const [importingExternalId, setImportingExternalId] = useState<string | null>(null);
  const [addingTemplateExerciseId, setAddingTemplateExerciseId] = useState<string | null>(null);
  const [addedTemplateExerciseCount, setAddedTemplateExerciseCount] = useState(0);
  const [addedTemplateExerciseNames, setAddedTemplateExerciseNames] = useState<string[]>([]);
  const [viewingExercise, setViewingExercise] = useState<ExerciseRecord | null>(null);
  const [viewingExternalExercise, setViewingExternalExercise] =
    useState<NormalizedExerciseCandidate | null>(null);

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

        setCurrentUserId(user.id);
        const loadedExercises = await listVisibleExercises(user.id);
        if (!active) return;

        setExercises(loadedExercises);
        setError(null);
      } catch (error) {
        if (!active) return;
        console.error("Failed to initialize exercise library:", error);
        setError(error instanceof Error ? error.message : "Exercises could not be loaded.");
      } finally {
        if (active) setAuthChecked(true);
      }
    }

    void init();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!authChecked || redirecting) return;

    const controller = new AbortController();
    const query = search.trim() || defaultExternalQuery(activeFilter);

    async function loadExternalExercises() {
      setExternalLoading(true);
      setExternalError(null);

      try {
        const params = new URLSearchParams({
          q: query,
          limit: "10",
        });
        const response = await fetch(`/api/catalog/exercises/search?${params.toString()}`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          configured?: boolean;
          exercises?: NormalizedExerciseCandidate[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "External exercise lookup failed.");
        }

        setExternalConfigured(Boolean(payload.configured));
        setExternalExercises(payload.exercises ?? []);
      } catch (error) {
        if (controller.signal.aborted) return;
        setExternalExercises([]);
        setExternalError(
          error instanceof Error ? error.message : "External exercise lookup failed."
        );
      } finally {
        if (!controller.signal.aborted) setExternalLoading(false);
      }
    }

    const timeout = window.setTimeout(() => {
      void loadExternalExercises();
    }, search.trim() ? 300 : 0);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [activeFilter, authChecked, redirecting, search]);

  const filteredExercises = useMemo(() => {
    const query = search.trim().toLowerCase();
    const activeDefinition =
      filterDefinitions.find((definition) => definition.key === activeFilter) ??
      filterDefinitions[0];

    return exercises.filter((exercise) => {
      if (!activeDefinition.matches(exercise)) return false;

      if (!query) return true;

      const haystacks = [
        exercise.name,
        exercise.category,
        exercise.primary_muscle_group ?? "",
        exercise.movement_pattern ?? "",
        exercise.logging_style,
        ...exercise.secondary_muscle_groups,
        ...exercise.equipment,
      ];

      return haystacks.some((value) => value.toLowerCase().includes(query));
    });
  }, [activeFilter, exercises, search]);

  const filteredExternalExercises = useMemo(
    () =>
      externalExercises.filter((exercise) => externalMatchesFilter(exercise, activeFilter)),
    [activeFilter, externalExercises]
  );

  function templateDoneHref() {
    if (!templateId) return;
    const params = new URLSearchParams({ scrollTo: "exercises" });
    return `/workouts/templates/${templateId}?${params.toString()}`;
  }

  async function addExerciseToTemplate(exerciseId: string, exerciseName: string) {
    if (!templateId) return;

    try {
      setAddingTemplateExerciseId(exerciseId);
      setExternalError(null);
      await appendWorkoutTemplateExercise(templateId, {
        exercise_id: exerciseId,
        target_sets: null,
        target_reps: null,
        target_reps_min: null,
        target_reps_max: null,
        target_weight: null,
        target_duration_sec: null,
        target_distance: null,
        target_distance_unit: null,
        target_rest_sec: null,
        notes: null,
      });
      setAddedTemplateExerciseCount((current) => current + 1);
      setAddedTemplateExerciseNames((current) => [exerciseName, ...current].slice(0, 4));
    } catch (error) {
      console.error("Failed to add exercise to template:", error);
      setExternalError(error instanceof Error ? error.message : "Exercise could not be added.");
    } finally {
      setAddingTemplateExerciseId(null);
    }
  }

  async function importExternalExercise(exercise: NormalizedExerciseCandidate) {
    if (!currentUserId) return;

    try {
      setImportingExternalId(exercise.sourceId);
      const created = await createExercise(currentUserId, {
        name: exercise.name,
        slug: null,
        category: exercise.category,
        primary_muscle_group: exercise.primaryMuscleGroup,
        secondary_muscle_groups: exercise.secondaryMuscleGroups,
        equipment: exercise.equipment,
        movement_pattern: null,
        logging_style: exercise.category === "cardio" ? "distance_time" : "reps_weight",
        instructions: exercise.instructions,
        is_public: false,
      });

      setExercises((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));

      if (templatePickerMode) {
        await addExerciseToTemplate(created.id, created.name);
      }
    } catch (error) {
      console.error("Failed to import external exercise:", error);
      setExternalError(error instanceof Error ? error.message : "Exercise could not be imported.");
    } finally {
      setImportingExternalId(null);
    }
  }

  if (redirecting || !authChecked) {
    return (
      <AppShell
        title="Exercises"
        subtitle={templatePickerMode ? "Choose a movement for this template" : "Browse and organize your movement library"}
        backHref={templatePickerMode && templateDoneHref() ? templateDoneHref() : "/workouts"}
        backLabel={templatePickerMode ? "Template" : "Workout"}
      >
        <div className="text-sm text-gray-400">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Exercises"
      subtitle={templatePickerMode ? "Choose a movement for this template" : "Browse and organize your movement library"}
      backHref={templatePickerMode && templateDoneHref() ? templateDoneHref() : "/workouts"}
      backLabel={templatePickerMode ? "Template" : "Workout"}
    >
      <div className={`space-y-4 ${templatePickerMode ? "pb-36" : ""}`}>
        {error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {templatePickerMode && templateDoneHref() ? (
          <section className="fixed inset-x-0 bottom-[7.5rem] z-30 mx-auto w-full max-w-md px-4">
            <div className="rounded-3xl border border-blue-500/30 bg-blue-950/95 p-4 shadow-lg backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">
                    {addedTemplateExerciseNames.length > 0
                      ? `${addedTemplateExerciseCount} added`
                      : "Add exercises to this template"}
                  </div>
                  <p className="mt-1 text-xs text-blue-100/75">
                    {addedTemplateExerciseNames[0]
                      ? `Last added: ${addedTemplateExerciseNames[0]}`
                      : "Pick as many movements as you need, then tap Done."}
                  </p>
                </div>
                <Link
                  href={templateDoneHref()!}
                  className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Done
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search exercises..."
            className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder:text-gray-500"
          />
          <div className="mt-3 overflow-x-auto pb-1 [scrollbar-width:none]">
            <div className="flex min-w-max gap-2">
              {filterDefinitions.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setActiveFilter(filter.key)}
                  className={`rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap transition ${
                    activeFilter === filter.key
                      ? "bg-blue-600 text-white"
                      : "bg-gray-900 text-gray-300 hover:bg-gray-700"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="space-y-3">
          {filteredExercises.length > 0 ? (
            filteredExercises.map((exercise) => {
              const cardContent = (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-white">{exercise.name}</div>
                      <span className="rounded-full bg-gray-900 px-2.5 py-1 text-[11px] font-medium text-blue-200">
                        {formatLibraryBadge(exercise)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-400">{formatExerciseMeta(exercise)}</div>
                    {exercise.instructions ? (
                      <div className="mt-2 line-clamp-2 text-xs leading-5 text-gray-500">
                        {exercise.instructions}
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-2xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white">
                    {addingTemplateExerciseId === exercise.id
                      ? "Adding"
                      : templatePickerMode
                        ? "Add"
                        : "View"}
                  </div>
                </div>
              );

              return templatePickerMode ? (
                <article
                  key={exercise.id}
                  className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm transition hover:bg-gray-700"
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setViewingExercise(exercise)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-white">{exercise.name}</div>
                        <span className="rounded-full bg-gray-900 px-2.5 py-1 text-[11px] font-medium text-blue-200">
                          {formatLibraryBadge(exercise)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-gray-400">
                        {formatExerciseMeta(exercise)}
                      </div>
                      {exercise.instructions ? (
                        <div className="mt-2 line-clamp-2 text-xs leading-5 text-gray-500">
                          {exercise.instructions}
                        </div>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => void addExerciseToTemplate(exercise.id, exercise.name)}
                      disabled={addingTemplateExerciseId === exercise.id}
                      className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label={`Add ${exercise.name} to this template`}
                    >
                      {addingTemplateExerciseId === exercise.id ? "Adding" : "Add"}
                    </button>
                  </div>
                </article>
              ) : (
                <Link
                  key={exercise.id}
                  href={`/workouts/exercises/${exercise.id}`}
                  className="block rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm transition hover:bg-gray-700"
                >
                  {cardContent}
                </Link>
              );
            })
          ) : (
            <div className="rounded-3xl border border-dashed border-gray-700 bg-gray-800/40 p-5 text-sm text-gray-400">
              {exercises.length === 0
                ? "No exercises are in your library yet. Once you add public or custom exercises, they will show up here."
                : `No exercises match "${search.trim()}" in this filter.`}
            </div>
          )}
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">API Ninjas Library</h2>
              <p className="mt-1 text-xs text-gray-400">
                {templatePickerMode
                  ? "Search outside the saved library, then add one straight into this template."
                  : "Search outside the saved library, then add useful exercises into your app."}
              </p>
            </div>
            {externalLoading ? (
              <div className="rounded-full bg-gray-800 px-3 py-1 text-xs font-semibold text-gray-300">
                Loading
              </div>
            ) : null}
          </div>

          {externalConfigured === false ? (
            <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              Add `API_NINJAS_API_KEY` to `.env.local` and Vercel environment variables to load
              external exercises here.
            </div>
          ) : null}

          {externalError ? (
            <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
              {externalError}
            </div>
          ) : null}

          {filteredExternalExercises.length > 0 ? (
            filteredExternalExercises.map((exercise) => (
              <article
                key={`${exercise.sourceName}-${exercise.sourceId}`}
                className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setViewingExternalExercise(exercise)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-white">{exercise.name}</div>
                      <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-200">
                        External
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      {formatExternalExerciseMeta(exercise)}
                    </div>
                    {exercise.instructions ? (
                      <div className="mt-2 line-clamp-3 text-xs leading-5 text-gray-500">
                        {exercise.instructions}
                      </div>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => importExternalExercise(exercise)}
                    disabled={importingExternalId === exercise.sourceId}
                    className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label={`Add ${exercise.name} to your exercise library`}
                  >
                    {importingExternalId === exercise.sourceId
                      ? "Adding"
                      : templatePickerMode
                        ? "Add"
                        : "+"}
                  </button>
                </div>
              </article>
            ))
          ) : externalConfigured && !externalLoading ? (
            <div className="rounded-3xl border border-dashed border-gray-700 bg-gray-800/40 p-5 text-sm text-gray-400">
              No external exercises found yet. Try a search like “push up”, “squat”, or “curl”.
            </div>
          ) : null}
        </section>

        {viewingExercise ? (
          <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 px-4 pb-36 pt-4 sm:items-center sm:pt-10">
            <div className="max-h-[calc(100vh-9.5rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-gray-700 bg-gray-900 p-5 shadow-2xl [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-blue-300/80">
                    {formatExerciseMeta(viewingExercise) || "Exercise"}
                  </div>
                  <h2 className="mt-2 text-2xl font-bold text-white">{viewingExercise.name}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingExercise(null)}
                  className="rounded-2xl bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  titleCase(viewingExercise.category),
                  viewingExercise.primary_muscle_group,
                  ...viewingExercise.secondary_muscle_groups,
                  ...viewingExercise.equipment,
                ]
                  .filter(Boolean)
                  .map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-gray-800 px-3 py-1.5 text-xs text-gray-300"
                    >
                      {tag}
                    </span>
                  ))}
              </div>

              <section className="mt-5 rounded-3xl border border-gray-700 bg-gray-800 p-4">
                <h3 className="text-sm font-semibold text-white">Instructions</h3>
                {viewingExercise.instructions ? (
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-gray-300">
                    {viewingExercise.instructions}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-gray-500">
                    No instructions have been added for this exercise yet.
                  </p>
                )}
              </section>

              {templatePickerMode ? (
                <div className="sticky bottom-0 -mx-5 mt-4 border-t border-gray-800 bg-gray-900/95 px-5 pb-1 pt-4 backdrop-blur">
                  <button
                    type="button"
                    onClick={() => void addExerciseToTemplate(viewingExercise.id, viewingExercise.name)}
                    disabled={addingTemplateExerciseId === viewingExercise.id}
                    className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {addingTemplateExerciseId === viewingExercise.id
                      ? "Adding Exercise..."
                      : "Add To Template"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {viewingExternalExercise ? (
          <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 px-4 pb-36 pt-4 sm:items-center sm:pt-10">
            <div className="max-h-[calc(100vh-9.5rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-gray-700 bg-gray-900 p-5 shadow-2xl [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-blue-300/80">
                    {formatExternalExerciseMeta(viewingExternalExercise) || "External Exercise"}
                  </div>
                  <h2 className="mt-2 text-2xl font-bold text-white">
                    {viewingExternalExercise.name}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingExternalExercise(null)}
                  className="rounded-2xl bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  viewingExternalExercise.exerciseType,
                  viewingExternalExercise.primaryMuscleGroup,
                  viewingExternalExercise.difficulty,
                  ...viewingExternalExercise.equipment,
                ]
                  .filter(Boolean)
                  .map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-gray-800 px-3 py-1.5 text-xs text-gray-300"
                    >
                      {tag}
                    </span>
                  ))}
              </div>

              <section className="mt-5 rounded-3xl border border-gray-700 bg-gray-800 p-4">
                <h3 className="text-sm font-semibold text-white">Instructions</h3>
                {viewingExternalExercise.instructions ? (
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-gray-300">
                    {viewingExternalExercise.instructions}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-gray-500">
                    No instructions were provided by this source.
                  </p>
                )}
              </section>

              {viewingExternalExercise.safetyCues.length > 0 ? (
                <section className="mt-3 rounded-3xl border border-amber-500/30 bg-amber-500/10 p-4">
                  <h3 className="text-sm font-semibold text-amber-100">Safety Cues</h3>
                  <ul className="mt-3 space-y-2 text-sm text-amber-100/85">
                    {viewingExternalExercise.safetyCues.map((cue) => (
                      <li key={cue}>{cue}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <div className="sticky bottom-0 -mx-5 mt-4 border-t border-gray-800 bg-gray-900/95 px-5 pb-1 pt-4 backdrop-blur">
                <button
                  type="button"
                  onClick={() => importExternalExercise(viewingExternalExercise)}
                  disabled={importingExternalId === viewingExternalExercise.sourceId}
                  className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importingExternalId === viewingExternalExercise.sourceId
                    ? "Adding Exercise..."
                    : templatePickerMode
                      ? "Add To Template"
                      : "Add To My Library"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function WorkoutExercisesPage() {
  return (
    <Suspense
      fallback={
        <AppShell
          title="Exercises"
          subtitle="Browse and organize your movement library"
          backHref="/workouts"
          backLabel="Workout"
        >
          <div className="text-sm text-gray-400">Loading...</div>
        </AppShell>
      }
    >
      <WorkoutExercisesPageContent />
    </Suspense>
  );
}
