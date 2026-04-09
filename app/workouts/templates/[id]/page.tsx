"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AppShell from "../../../components/AppShell";
import {
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

const distanceUnitOptions: Array<DistanceUnit | ""> = ["", "km", "mi", "m"];

function toInputValue(value: number | null) {
  return value == null ? "" : String(value);
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

function buildExerciseSummary(exercise: BuilderExercise) {
  const parts: string[] = [];

  if (exercise.target_sets) parts.push(`${exercise.target_sets} sets`);
  if (exercise.target_reps) parts.push(`${exercise.target_reps} reps`);
  if (exercise.target_reps_min && exercise.target_reps_max) {
    parts.push(`${exercise.target_reps_min}-${exercise.target_reps_max} reps`);
  }
  if (exercise.target_duration_sec) {
    const minutes = Math.max(1, Math.round(Number(exercise.target_duration_sec) / 60));
    parts.push(`${minutes} min`);
  }
  if (exercise.target_distance) {
    parts.push(`${exercise.target_distance}${exercise.target_distance_unit}`);
  }
  if (exercise.target_rest_sec) {
    parts.push(`${exercise.target_rest_sec}s rest`);
  }

  return parts.length > 0 ? parts.join(" - ") : "Plan details not set yet";
}

function buildExercisePayload(exercises: BuilderExercise[]): WorkoutTemplateExerciseInsert[] {
  return exercises
    .filter((exercise) => exercise.exercise_id)
    .map((exercise, index) => ({
      exercise_id: exercise.exercise_id,
      sort_order: index,
      target_sets: exercise.target_sets ? Number(exercise.target_sets) : null,
      target_reps: exercise.target_reps ? Number(exercise.target_reps) : null,
      target_reps_min: exercise.target_reps_min ? Number(exercise.target_reps_min) : null,
      target_reps_max: exercise.target_reps_max ? Number(exercise.target_reps_max) : null,
      target_weight: exercise.target_weight ? Number(exercise.target_weight) : null,
      target_duration_sec: exercise.target_duration_sec ? Number(exercise.target_duration_sec) : null,
      target_distance: exercise.target_distance ? Number(exercise.target_distance) : null,
      target_distance_unit: exercise.target_distance_unit || null,
      target_rest_sec: exercise.target_rest_sec ? Number(exercise.target_rest_sec) : null,
      notes: exercise.notes || null,
    }));
}

function selectedExerciseName(exerciseId: string, options: ExerciseRecord[]) {
  return options.find((option) => option.id === exerciseId)?.name ?? "Choose exercise";
}

export default function WorkoutTemplateDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const templateId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const isNewTemplate = templateId === "new";

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

  function addExerciseRow() {
    setBuilderExercises((current) => [...current, createBuilderExercise()]);
  }

  function removeExerciseRow(id: string) {
    setBuilderExercises((current) => {
      if (current.length === 1) return [createBuilderExercise()];
      return current.filter((exercise) => exercise.id !== id);
    });
  }

  async function handleSaveTemplate() {
    if (!userId) return;

    const trimmedName = templateName.trim();
    if (!trimmedName) {
      setError("Template name is required.");
      return;
    }

    const payload = {
      name: trimmedName,
      description,
      focus_tags: focusTags,
      estimated_duration_min: durationMinutes ? Number(durationMinutes) : null,
      is_archived: false,
    };

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const savedTemplate = isNewTemplate
        ? await createWorkoutTemplate(userId, payload)
        : await updateWorkoutTemplate(templateId!, userId, payload);

      await replaceWorkoutTemplateExercises(savedTemplate.id, buildExercisePayload(builderExercises));

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

    const confirmed = window.confirm(`Delete "${template.name}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeleting(true);
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

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Exercises</h2>
              <p className="mt-1 text-sm text-gray-400">
                Choose exercises and set your targets for each movement.
              </p>
            </div>
            <button
              type="button"
              onClick={addExerciseRow}
              className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Add Exercise
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {builderExercises.map((exercise, index) => (
              <div key={exercise.id} className="rounded-3xl bg-gray-900 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {index + 1}. {selectedExerciseName(exercise.exercise_id, exerciseOptions)}
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      {buildExerciseSummary(exercise)}
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

                <div className="mt-4">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Exercise
                  </label>
                  <select
                    value={exercise.exercise_id}
                    onChange={(e) => updateBuilderExercise(exercise.id, "exercise_id", e.target.value)}
                    className="w-full rounded-2xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white"
                  >
                    <option value="">Choose exercise</option>
                    {exerciseOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <input
                    value={exercise.target_sets}
                    onChange={(e) => updateBuilderExercise(exercise.id, "target_sets", e.target.value)}
                    inputMode="numeric"
                    placeholder="Sets"
                    className="rounded-2xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder:text-gray-500"
                  />
                  <input
                    value={exercise.target_reps}
                    onChange={(e) => updateBuilderExercise(exercise.id, "target_reps", e.target.value)}
                    inputMode="numeric"
                    placeholder="Reps"
                    className="rounded-2xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder:text-gray-500"
                  />
                  <input
                    value={exercise.target_weight}
                    onChange={(e) =>
                      updateBuilderExercise(exercise.id, "target_weight", e.target.value)
                    }
                    inputMode="decimal"
                    placeholder="Weight"
                    className="rounded-2xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder:text-gray-500"
                  />
                  <input
                    value={exercise.target_reps_min}
                    onChange={(e) =>
                      updateBuilderExercise(exercise.id, "target_reps_min", e.target.value)
                    }
                    inputMode="numeric"
                    placeholder="Reps Min"
                    className="rounded-2xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder:text-gray-500"
                  />
                  <input
                    value={exercise.target_reps_max}
                    onChange={(e) =>
                      updateBuilderExercise(exercise.id, "target_reps_max", e.target.value)
                    }
                    inputMode="numeric"
                    placeholder="Reps Max"
                    className="rounded-2xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder:text-gray-500"
                  />
                  <input
                    value={exercise.target_rest_sec}
                    onChange={(e) =>
                      updateBuilderExercise(exercise.id, "target_rest_sec", e.target.value)
                    }
                    inputMode="numeric"
                    placeholder="Rest Sec"
                    className="rounded-2xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder:text-gray-500"
                  />
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem]">
                  <input
                    value={exercise.target_duration_sec}
                    onChange={(e) =>
                      updateBuilderExercise(exercise.id, "target_duration_sec", e.target.value)
                    }
                    inputMode="numeric"
                    placeholder="Duration Sec"
                    className="rounded-2xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder:text-gray-500"
                  />
                  <input
                    value={exercise.target_distance}
                    onChange={(e) =>
                      updateBuilderExercise(exercise.id, "target_distance", e.target.value)
                    }
                    inputMode="decimal"
                    placeholder="Distance"
                    className="rounded-2xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder:text-gray-500"
                  />
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

                <textarea
                  value={exercise.notes}
                  onChange={(e) => updateBuilderExercise(exercise.id, "notes", e.target.value)}
                  rows={2}
                  placeholder="Optional notes or cues"
                  className="mt-3 w-full rounded-2xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white placeholder:text-gray-500"
                />
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => void handleSaveTemplate()}
            disabled={saving || deleting}
            className="rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : isNewTemplate ? "Create Template" : "Save Changes"}
          </button>

          {!isNewTemplate && template ? (
            <Link
              href={`/workouts/session/${template.id}`}
              className="rounded-2xl bg-gray-900 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-gray-700"
            >
              Start Workout
            </Link>
          ) : (
            <Link
              href="/workouts/exercises"
              className="rounded-2xl bg-gray-900 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-gray-700"
            >
              Browse Exercises
            </Link>
          )}

          {!isNewTemplate && template ? (
            <button
              type="button"
              onClick={() => void handleDeleteTemplate()}
              disabled={saving || deleting}
              className="rounded-2xl bg-red-500/15 px-4 py-3 text-center text-sm font-semibold text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? "Deleting..." : "Delete Template"}
            </button>
          ) : (
            <Link
              href="/workouts/templates"
              className="rounded-2xl bg-gray-900 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-gray-700"
            >
              Back To Templates
            </Link>
          )}
        </div>
      </div>
    </AppShell>
  );
}
