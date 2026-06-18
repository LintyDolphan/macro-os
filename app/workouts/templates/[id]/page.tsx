"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import AppShell from "../../../components/AppShell";
import {
  appendWorkoutTemplateExercise,
  createWorkoutTemplate,
  deleteWorkoutTemplate,
  getCurrentUser,
  getWorkoutTemplate,
  getWorkoutTemplateExercises,
  listVisibleExercises,
  replaceWorkoutTemplateExercises,
  updateWorkoutTemplate,
  type DistanceUnit,
  type ExerciseRecord,
  type WorkoutTemplateExerciseRecord,
  type WorkoutTemplateExerciseInsert,
  type WorkoutTemplateRecord,
} from "../../../lib/supabase/workouts-db";

type BuilderExercise = {
  id: string;
  exercise_id: string;
  target_sets: string;
  target_reps: string;
  target_reps_min: string;
  target_reps_max: string;
  target_weight: string;
  target_duration_sec: string;
  target_distance: string;
  target_distance_unit: DistanceUnit | "";
  target_rest_sec: string;
  notes: string;
};

type BuilderNumberField =
  | "target_sets"
  | "target_reps_min"
  | "target_reps_max"
  | "target_weight"
  | "target_duration_sec"
  | "target_distance"
  | "target_rest_sec";

const distanceUnitOptions: Array<DistanceUnit | ""> = ["", "km", "mi", "m"];

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function toInputValue(value: number | null) {
  return value == null ? "" : String(value);
}

function stepInputValue(value: string, step: number, direction: 1 | -1) {
  const numericValue = Number(value);
  const baseValue = Number.isFinite(numericValue) ? numericValue : 0;
  const nextValue = Math.max(0, baseValue + step * direction);
  if (nextValue === 0) return "";
  return numberFormatter.format(nextValue);
}

function getStepperBaseValue(exercise: BuilderExercise, field: BuilderNumberField) {
  const value = String(exercise[field] ?? "");

  if (field === "target_reps_max" && !value && exercise.target_reps_min) {
    return exercise.target_reps_min;
  }

  return value;
}

function createBuilderExercise(
  exercise?: Partial<BuilderExercise> & { exercise_id?: string }
): BuilderExercise {
  return {
    id: crypto.randomUUID(),
    exercise_id: exercise?.exercise_id ?? "",
    target_sets: exercise?.target_sets ?? "",
    target_reps: exercise?.target_reps ?? "",
    target_reps_min: exercise?.target_reps_min ?? "",
    target_reps_max: exercise?.target_reps_max ?? "",
    target_weight: exercise?.target_weight ?? "",
    target_duration_sec: exercise?.target_duration_sec ?? "",
    target_distance: exercise?.target_distance ?? "",
    target_distance_unit: exercise?.target_distance_unit ?? "",
    target_rest_sec: exercise?.target_rest_sec ?? "",
    notes: exercise?.notes ?? "",
  };
}

function mapTemplateExerciseToBuilder(exercise: WorkoutTemplateExerciseRecord): BuilderExercise {
  return createBuilderExercise({
    exercise_id: exercise.exercise_id,
    target_sets: toInputValue(exercise.target_sets),
    target_reps: toInputValue(exercise.target_reps),
    target_reps_min: toInputValue(exercise.target_reps_min),
    target_reps_max: toInputValue(exercise.target_reps_max),
    target_weight: toInputValue(exercise.target_weight),
    target_duration_sec: toInputValue(exercise.target_duration_sec),
    target_distance: toInputValue(exercise.target_distance),
    target_distance_unit: exercise.target_distance_unit ?? "",
    target_rest_sec: toInputValue(exercise.target_rest_sec),
    notes: exercise.notes ?? "",
  });
}

function buildExerciseSummary(exercise: BuilderExercise, options: ExerciseRecord[]) {
  const parts: string[] = [];

  if (exercise.target_sets) parts.push(`${exercise.target_sets} sets`);
  if (exercise.target_reps_min && exercise.target_reps_max) {
    parts.push(`${exercise.target_reps_min}-${exercise.target_reps_max} reps`);
  } else if (exercise.target_reps_min) {
    parts.push(`${exercise.target_reps_min} reps`);
  }
  if (exercise.target_weight) {
    parts.push(`${exercise.target_weight} lbs`);
  }
  if (exercise.target_duration_sec) {
    const minutes = Math.max(1, Math.round(Number(exercise.target_duration_sec) / 60));
    parts.push(`${minutes} min`);
  }
  if (usesCardioTargets(exercise.exercise_id, options) && exercise.target_distance) {
    parts.push(`${exercise.target_distance}${exercise.target_distance_unit}`);
  }
  if (exercise.target_rest_sec) {
    parts.push(`${exercise.target_rest_sec}s rest`);
  }

  return parts.length > 0 ? parts.join(" - ") : "Plan details not set yet";
}

function buildExercisePayload(
  exercises: BuilderExercise[],
  options: ExerciseRecord[]
): WorkoutTemplateExerciseInsert[] {
  return exercises
    .filter((exercise) => exercise.exercise_id)
    .map((exercise, index) => ({
      exercise_id: exercise.exercise_id,
      sort_order: index,
      target_sets: exercise.target_sets ? Number(exercise.target_sets) : null,
      target_reps: null,
      target_reps_min: exercise.target_reps_min ? Number(exercise.target_reps_min) : null,
      target_reps_max: exercise.target_reps_max
        ? Number(exercise.target_reps_max)
        : exercise.target_reps_min
          ? Number(exercise.target_reps_min)
          : null,
      target_weight: exercise.target_weight ? Number(exercise.target_weight) : null,
      target_duration_sec: exercise.target_duration_sec ? Number(exercise.target_duration_sec) : null,
      target_distance:
        usesCardioTargets(exercise.exercise_id, options) && exercise.target_distance
          ? Number(exercise.target_distance)
          : null,
      target_distance_unit: usesCardioTargets(exercise.exercise_id, options)
        ? exercise.target_distance_unit || null
        : null,
      target_rest_sec: exercise.target_rest_sec ? Number(exercise.target_rest_sec) : null,
      notes: exercise.notes || null,
    }));
}

function selectedExerciseName(exerciseId: string, options: ExerciseRecord[]) {
  return options.find((option) => option.id === exerciseId)?.name ?? "Choose exercise";
}

function selectedExercise(exerciseId: string, options: ExerciseRecord[]) {
  return options.find((option) => option.id === exerciseId) ?? null;
}

function usesCardioTargets(exerciseId: string, options: ExerciseRecord[]) {
  const exercise = selectedExercise(exerciseId, options);
  return exercise?.category === "cardio" || exercise?.logging_style === "distance_time";
}

function WorkoutTemplateDetailPageContent() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const templateId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const isNewTemplate = templateId === "new";
  const addExerciseId = searchParams.get("addExerciseId");
  const scrollTo = searchParams.get("scrollTo");
  const handledAddExerciseIdRef = useRef<string | null>(null);
  const exercisesSectionRef = useRef<HTMLElement | null>(null);
  const actionBarRef = useRef<HTMLDivElement | null>(null);

  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [template, setTemplate] = useState<WorkoutTemplateRecord | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [focusTagsInput, setFocusTagsInput] = useState("");
  const [builderExercises, setBuilderExercises] = useState<BuilderExercise[]>([]);
  const [exerciseOptions, setExerciseOptions] = useState<ExerciseRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [actionBarDocked, setActionBarDocked] = useState(false);

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

        if (!active) return;
        setUserId(user.id);

        const loadedExercisesPromise = listVisibleExercises(user.id);
        const loadedTemplatePromise =
          templateId && !isNewTemplate ? getWorkoutTemplate(templateId) : Promise.resolve(null);
        const loadedTemplateExercisesPromise =
          templateId && !isNewTemplate
            ? getWorkoutTemplateExercises(templateId)
            : Promise.resolve([]);

        const [loadedExercises, loadedTemplate, loadedTemplateExercises] = await Promise.all([
          loadedExercisesPromise,
          loadedTemplatePromise,
          loadedTemplateExercisesPromise,
        ]);

        if (!active) return;

        setExerciseOptions(loadedExercises);

        if (loadedTemplate) {
          setTemplate(loadedTemplate);
          setTemplateName(loadedTemplate.name);
          setDescription(loadedTemplate.description ?? "");
          setDurationMinutes(
            loadedTemplate.estimated_duration_min == null
              ? ""
              : String(loadedTemplate.estimated_duration_min)
          );
          setFocusTagsInput(loadedTemplate.focus_tags.join(", "));
          setBuilderExercises(
            loadedTemplateExercises.length > 0
              ? loadedTemplateExercises.map(mapTemplateExerciseToBuilder)
              : [createBuilderExercise()]
          );
        } else {
          setTemplate(null);
          setTemplateName("");
          setDescription("");
          setDurationMinutes("");
          setFocusTagsInput("");
          setBuilderExercises([createBuilderExercise()]);
        }

        setError(null);
      } catch (error) {
        if (!active) return;
        console.error("Failed to load workout template:", error);
        setError(error instanceof Error ? error.message : "Template could not be loaded.");
      } finally {
        if (active) setAuthChecked(true);
      }
    }

    void init();

    return () => {
      active = false;
    };
  }, [isNewTemplate, templateId]);

  useEffect(() => {
    if (!authChecked || redirecting || isNewTemplate || !templateId || !addExerciseId) return;
    if (handledAddExerciseIdRef.current === addExerciseId) return;
    if (!exerciseOptions.some((exercise) => exercise.id === addExerciseId)) return;

    handledAddExerciseIdRef.current = addExerciseId;

    async function addPickedExercise() {
      try {
        setError(null);
        const inserted = await appendWorkoutTemplateExercise(templateId!, {
          exercise_id: addExerciseId!,
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

        setBuilderExercises((current) => [...current, mapTemplateExerciseToBuilder(inserted)]);
        setMessage(`Added ${selectedExerciseName(addExerciseId!, exerciseOptions)}.`);
        router.replace(`/workouts/templates/${templateId}`);
      } catch (error) {
        console.error("Failed to add exercise to template:", error);
        setError(error instanceof Error ? error.message : "Exercise could not be added.");
      }
    }

    void addPickedExercise();
  }, [
    addExerciseId,
    authChecked,
    exerciseOptions,
    isNewTemplate,
    redirecting,
    router,
    templateId,
  ]);

  useEffect(() => {
    if (!authChecked || redirecting || scrollTo !== "exercises" || !templateId) return;

    window.setTimeout(() => {
      exercisesSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      router.replace(`/workouts/templates/${templateId}`);
    }, 100);
  }, [authChecked, redirecting, router, scrollTo, templateId]);

  useEffect(() => {
    if (!deleteConfirming) return;

    const timeout = window.setTimeout(() => {
      setDeleteConfirming(false);
    }, 2000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [deleteConfirming]);

  useEffect(() => {
    const actionBar = actionBarRef.current;
    if (!actionBar || isNewTemplate || !template) {
      setActionBarDocked(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setActionBarDocked(!entry.isIntersecting);
      },
      {
        rootMargin: "0px 0px -176px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(actionBar);

    return () => {
      observer.disconnect();
    };
  }, [isNewTemplate, template]);

  const focusTags = useMemo(
    () =>
      focusTagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    [focusTagsInput]
  );

  const validExerciseCount = useMemo(
    () => builderExercises.filter((exercise) => exercise.exercise_id).length,
    [builderExercises]
  );

  function updateBuilderExercise(id: string, field: keyof BuilderExercise, value: string) {
    setBuilderExercises((current) =>
      current.map((exercise) => (exercise.id === id ? { ...exercise, [field]: value } : exercise))
    );
  }

  function renderStepperField(
    exercise: BuilderExercise,
    field: BuilderNumberField,
    label: string,
    step: number,
    inputMode: "numeric" | "decimal" = "numeric"
  ) {
    const value = String(exercise[field] ?? "");
    const stepperBaseValue = getStepperBaseValue(exercise, field);
    const placeholder =
      field === "target_reps_max" && !value && exercise.target_reps_min
        ? exercise.target_reps_min
        : "0";

    return (
      <div className="min-w-0 rounded-2xl border border-gray-700 bg-gray-800 p-2">
        <div className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          {label}
        </div>
        <div className="grid min-w-0 grid-cols-[1.45rem_minmax(0,1fr)_1.45rem] items-center gap-1">
          <button
            type="button"
            onClick={() =>
              updateBuilderExercise(
                exercise.id,
                field,
                stepInputValue(stepperBaseValue, step, -1)
              )
            }
            className="h-7 rounded-xl bg-gray-900 text-sm font-bold text-white hover:bg-gray-700"
            aria-label={`Decrease ${label}`}
          >
            -
          </button>
          <input
            value={value}
            onChange={(e) => updateBuilderExercise(exercise.id, field, e.target.value)}
            inputMode={inputMode}
            placeholder={placeholder}
            className="min-w-0 bg-transparent text-center text-sm font-semibold text-white outline-none placeholder:text-gray-500"
          />
          <button
            type="button"
            onClick={() =>
              updateBuilderExercise(
                exercise.id,
                field,
                stepInputValue(stepperBaseValue, step, 1)
              )
            }
            className="h-7 rounded-xl bg-gray-900 text-sm font-bold text-white hover:bg-gray-700"
            aria-label={`Increase ${label}`}
          >
            +
          </button>
        </div>
      </div>
    );
  }

  function addExerciseRow() {
    setBuilderExercises((current) => [...current, createBuilderExercise()]);
  }

  function removeExerciseRow(id: string) {
    setBuilderExercises((current) => {
      if (current.length === 1) return [createBuilderExercise()];
      return current.filter((exercise) => exercise.id !== id);
    });
  }

  function addExerciseHref(targetTemplateId = templateId) {
    if (!targetTemplateId || targetTemplateId === "new") return null;
    const params = new URLSearchParams({
      pickForTemplate: "1",
      templateId: targetTemplateId,
    });
    return `/workouts/exercises?${params.toString()}`;
  }

  function buildTemplatePayload() {
    const trimmedName = templateName.trim();

    if (!trimmedName) {
      setError("Template name is required.");
      return null;
    }

    return {
      name: trimmedName,
      description,
      focus_tags: focusTags,
      estimated_duration_min: durationMinutes ? Number(durationMinutes) : null,
      is_archived: false,
    };
  }

  async function handleCreateTemplateAndAddExercise() {
    if (!userId) return;

    const payload = buildTemplatePayload();
    if (!payload) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const savedTemplate = await createWorkoutTemplate(userId, payload);
      await replaceWorkoutTemplateExercises(
        savedTemplate.id,
        buildExercisePayload(builderExercises, exerciseOptions)
      );

      const href = addExerciseHref(savedTemplate.id);
      if (href) {
        router.replace(href);
      }
    } catch (error) {
      console.error("Failed to create workout template before adding exercise:", error);
      setError(error instanceof Error ? error.message : "Template could not be created.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveTemplate() {
    if (!userId) return;

    const payload = buildTemplatePayload();
    if (!payload) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const savedTemplate = isNewTemplate
        ? await createWorkoutTemplate(userId, payload)
        : await updateWorkoutTemplate(templateId!, userId, payload);

      await replaceWorkoutTemplateExercises(
        savedTemplate.id,
        buildExercisePayload(builderExercises, exerciseOptions)
      );

      setTemplate(savedTemplate);
      setMessage(isNewTemplate ? "Template created." : "Template updated.");

      if (isNewTemplate) {
        router.replace(`/workouts/templates/${savedTemplate.id}`);
        return;
      }

      const refreshedExercises = await getWorkoutTemplateExercises(savedTemplate.id);
      setBuilderExercises(
        refreshedExercises.length > 0
          ? refreshedExercises.map(mapTemplateExerciseToBuilder)
          : [createBuilderExercise()]
      );
    } catch (error) {
      console.error("Failed to save workout template:", error);
      setError(error instanceof Error ? error.message : "Template could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTemplate() {
    if (!template || !userId) return;

    setDeleting(true);
    setDeleteConfirming(false);
    setError(null);
    setMessage(null);

    try {
      await deleteWorkoutTemplate(template.id, userId);
      router.replace("/workouts/templates");
    } catch (error) {
      console.error("Failed to delete workout template:", error);
      setError(error instanceof Error ? error.message : "Template could not be deleted.");
      setDeleting(false);
    }
  }

  function renderActionBar(isDocked = false) {
    return (
      <div
        ref={isDocked ? undefined : actionBarRef}
        className={`grid grid-cols-[2fr_5fr_2fr] gap-2 rounded-3xl border border-gray-700 bg-gray-800/90 p-2 shadow-sm backdrop-blur ${
          isDocked ? "shadow-2xl" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => void handleSaveTemplate()}
          disabled={saving || deleting}
          className="rounded-2xl bg-blue-600 px-3 py-4 text-center text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-blue-500 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : isNewTemplate ? "Create Template" : "Save Changes"}
        </button>

        {!isNewTemplate && template ? (
          <Link
            href={`/workouts/session/${template.id}`}
            className="rounded-2xl bg-gray-900 px-4 py-4 text-center text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-blue-600 hover:shadow-lg"
          >
            Start Workout
          </Link>
        ) : (
          <Link
            href="/workouts/exercises"
            className="rounded-2xl bg-gray-900 px-4 py-4 text-center text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-blue-600 hover:shadow-lg"
          >
            Browse Exercises
          </Link>
        )}

        {!isNewTemplate && template ? (
          <button
            type="button"
            onClick={() => {
              if (deleteConfirming) {
                void handleDeleteTemplate();
                return;
              }
              setDeleteConfirming(true);
            }}
            disabled={saving || deleting}
            className={`rounded-2xl px-3 py-4 text-center text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 ${
              deleteConfirming
                ? "bg-red-600 text-white hover:bg-red-500"
                : "bg-red-500/15 text-red-200 hover:bg-red-500/25"
            }`}
          >
            {deleting ? "Deleting..." : deleteConfirming ? "Confirm Delete" : "Delete Template"}
          </button>
        ) : (
          <Link
            href="/workouts/templates"
            className="rounded-2xl bg-gray-900 px-3 py-4 text-center text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-gray-700 hover:shadow-lg"
          >
            Back To Templates
          </Link>
        )}
      </div>
    );
  }

  if (redirecting || !authChecked) {
    return (
      <AppShell
        title={isNewTemplate ? "New Template" : "Template"}
        subtitle="Build and organize a workout"
        backHref="/workouts/templates"
        backLabel="Templates"
      >
        <div className="text-sm text-gray-400">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={isNewTemplate ? "New Template" : "Template"}
      subtitle="Build and organize a workout"
      backHref="/workouts/templates"
      backLabel="Templates"
    >
      <div className="space-y-4 pb-8">
        {actionBarDocked ? (
          <div className="fixed inset-x-0 bottom-[6.75rem] z-30 mx-auto w-full max-w-md px-4">
            {renderActionBar(true)}
          </div>
        ) : null}

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
          <h1 className="text-2xl font-bold text-white">
            {isNewTemplate ? "Create Workout Template" : template?.name ?? "Edit Template"}
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Build a repeatable workout with saved exercises, set targets, and timing notes.
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                Template Name
              </label>
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Upper Body Strength"
                className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder:text-gray-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Push emphasis with chest, shoulders, and triceps work."
                className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder:text-gray-500"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Estimated Duration (min)
                </label>
                <input
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  inputMode="numeric"
                  placeholder="45"
                  className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder:text-gray-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Focus Tags
                </label>
                <input
                  value={focusTagsInput}
                  onChange={(e) => setFocusTagsInput(e.target.value)}
                  placeholder="Upper, Push, Strength"
                  className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder:text-gray-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-gray-300">
              <span className="rounded-full bg-gray-900 px-3 py-1.5">
                {validExerciseCount} exercise{validExerciseCount === 1 ? "" : "s"}
              </span>
              <span className="rounded-full bg-gray-900 px-3 py-1.5">
                {durationMinutes ? `${durationMinutes} min` : "Duration not set"}
              </span>
              {(focusTags.length > 0 ? focusTags : ["No tags"]).map((tag) => (
                <span key={tag} className="rounded-full bg-gray-900 px-3 py-1.5">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section
          ref={exercisesSectionRef}
          className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm scroll-mt-4"
        >
          <div>
            <h2 className="text-lg font-semibold text-white">Exercises</h2>
            <p className="mt-1 text-sm text-gray-400">
              Add movements from the exercise library, then tune sets, reps, rest, and notes here.
            </p>
          </div>

          {addExerciseHref() ? (
            <Link
              href={addExerciseHref()!}
              className="mt-4 block w-full rounded-2xl bg-blue-600 px-4 py-4 text-center text-sm font-semibold text-white hover:bg-blue-700"
            >
              Add Exercise
            </Link>
          ) : (
            <button
              type="button"
              disabled={saving || deleting}
              onClick={() =>
                isNewTemplate
                  ? void handleCreateTemplateAndAddExercise()
                  : addExerciseRow()
              }
              className="mt-4 w-full rounded-2xl bg-blue-600 px-4 py-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving && isNewTemplate
                ? "Creating Template..."
                : isNewTemplate
                  ? "Create Template And Add Exercise"
                  : "Add Exercise"}
            </button>
          )}

          <div className="mt-4 space-y-4">
            {builderExercises.filter((exercise) => exercise.exercise_id).length > 0 ? (
            builderExercises
              .filter((exercise) => exercise.exercise_id)
              .map((exercise, index) => (
              <div key={exercise.id} className="rounded-3xl bg-gray-900 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {index + 1}. {selectedExerciseName(exercise.exercise_id, exerciseOptions)}
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      {buildExerciseSummary(exercise, exerciseOptions)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeExerciseRow(exercise.id)}
                    className="rounded-2xl bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-gray-700"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {renderStepperField(exercise, "target_sets", "Sets", 1)}
                  {renderStepperField(exercise, "target_reps_min", "Min Reps", 1)}
                  {renderStepperField(exercise, "target_reps_max", "Max Reps", 1)}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {renderStepperField(exercise, "target_weight", "Weight", 5, "decimal")}
                  {renderStepperField(exercise, "target_duration_sec", "Duration", 15)}
                  {renderStepperField(exercise, "target_rest_sec", "Rest", 15)}
                </div>

                {usesCardioTargets(exercise.exercise_id, exerciseOptions) ? (
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
                    {renderStepperField(exercise, "target_distance", "Distance", 0.25, "decimal")}
                    <select
                      value={exercise.target_distance_unit}
                      onChange={(e) =>
                        updateBuilderExercise(
                          exercise.id,
                          "target_distance_unit",
                          e.target.value as DistanceUnit | ""
                        )
                      }
                      className="rounded-2xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white"
                    >
                      {distanceUnitOptions.map((option) => (
                        <option key={option || "blank"} value={option}>
                          {option || "Unit"}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <textarea
                  value={exercise.notes}
                  onChange={(e) => updateBuilderExercise(exercise.id, "notes", e.target.value)}
                  rows={2}
                  placeholder="Optional notes or cues"
                  className="mt-3 w-full rounded-2xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder:text-gray-500"
                />
              </div>
            ))
            ) : (
              <div className="rounded-3xl border border-dashed border-gray-700 bg-gray-900/60 p-5 text-sm text-gray-400">
                No exercises yet. Use the Add Exercise button to search the library and bring one
                back into this template.
              </div>
            )}
          </div>
        </section>

        {renderActionBar()}
      </div>
    </AppShell>
  );
}

export default function WorkoutTemplateDetailPage() {
  return (
    <Suspense
      fallback={
        <AppShell
          title="Template"
          subtitle="Build and organize a workout"
          backHref="/workouts/templates"
          backLabel="Templates"
        >
          <div className="text-sm text-gray-400">Loading...</div>
        </AppShell>
      }
    >
      <WorkoutTemplateDetailPageContent />
    </Suspense>
  );
}
