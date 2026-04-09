"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AppShell from "../../../components/AppShell";
import {
  getCurrentUser,
  getVisibleExerciseById,
  type ExerciseRecord,
} from "../../../lib/supabase/workouts-db";

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatInstructionSteps(instructions: string | null) {
  if (!instructions) return [];

  return instructions
    .split(/\r?\n+/)
    .map((step) => step.trim())
    .filter(Boolean);
}

function buildMetaChips(exercise: ExerciseRecord) {
  const chips = [
    exercise.primary_muscle_group,
    ...exercise.secondary_muscle_groups,
    ...exercise.equipment,
  ].filter(Boolean);

  return chips.slice(0, 6);
}

export default function WorkoutExerciseDetailPage() {
  const params = useParams<{ id: string }>();
  const exerciseId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [exercise, setExercise] = useState<ExerciseRecord | null>(null);
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

        if (!exerciseId) {
          if (!active) return;
          setExercise(null);
          setError("Exercise not found.");
          return;
        }

        const loadedExercise = await getVisibleExerciseById(user.id, exerciseId);

        if (!active) return;

        if (!loadedExercise) {
          setExercise(null);
          setError("Exercise not found.");
          return;
        }

        setExercise(loadedExercise);
        setError(null);
      } catch (error) {
        if (!active) return;
        console.error("Failed to load exercise detail:", error);
        setError(error instanceof Error ? error.message : "Exercise could not be loaded.");
      } finally {
        if (active) setAuthChecked(true);
      }
    }

    void init();

    return () => {
      active = false;
    };
  }, [exerciseId]);

  const instructionSteps = useMemo(
    () => formatInstructionSteps(exercise?.instructions ?? null),
    [exercise?.instructions]
  );

  const metaChips = useMemo(() => (exercise ? buildMetaChips(exercise) : []), [exercise]);

  if (redirecting || !authChecked) {
    return (
      <AppShell
        title="Exercise"
        subtitle="Exercise details and cues"
        backHref="/workouts/exercises"
        backLabel="Exercises"
      >
        <div className="text-sm text-gray-400">Loading...</div>
      </AppShell>
    );
  }

  if (!exercise) {
    return (
      <AppShell
        title="Exercise"
        subtitle="Exercise details and cues"
        backHref="/workouts/exercises"
        backLabel="Exercises"
      >
        <div className="rounded-3xl border border-dashed border-gray-700 bg-gray-800/40 p-5 text-sm text-gray-400">
          {error ?? "Exercise not found."}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Exercise"
      subtitle="Exercise details and cues"
      backHref="/workouts/exercises"
      backLabel="Exercises"
    >
      <div className="space-y-4">
        {error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <div className="text-xs uppercase tracking-[0.18em] text-blue-300/80">
            {titleCase(exercise.category)}
          </div>
          <h1 className="mt-2 text-2xl font-bold text-white">{exercise.name}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-300">
            {metaChips.length > 0 ? (
              metaChips.map((chip) => (
                <span key={chip} className="rounded-full bg-gray-900 px-3 py-1.5">
                  {chip}
                </span>
              ))
            ) : (
              <span className="rounded-full bg-gray-900 px-3 py-1.5">No tags yet</span>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Exercise Details</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-gray-900 p-4">
              <div className="text-[11px] uppercase tracking-wide text-gray-500">Logging Style</div>
              <div className="mt-2 text-sm font-semibold text-white">
                {titleCase(exercise.logging_style)}
              </div>
            </div>
            <div className="rounded-2xl bg-gray-900 p-4">
              <div className="text-[11px] uppercase tracking-wide text-gray-500">Movement</div>
              <div className="mt-2 text-sm font-semibold text-white">
                {exercise.movement_pattern || "Not set"}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Instructions</h2>
          {instructionSteps.length > 0 ? (
            <ol className="mt-4 space-y-3">
              {instructionSteps.map((step, index) => (
                <li key={`${index + 1}-${step}`} className="flex gap-3 rounded-2xl bg-gray-900 p-4">
                  <span className="text-sm font-semibold text-blue-300">{index + 1}</span>
                  <span className="text-sm leading-6 text-gray-200">{step}</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="mt-4 rounded-2xl bg-gray-900 p-4 text-sm text-gray-400">
              No exercise instructions have been added yet.
            </div>
          )}
        </section>

        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/workouts/templates"
            className="rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-700"
          >
            Add To Template
          </Link>
          <Link
            href="/workouts/exercises"
            className="rounded-2xl bg-gray-900 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-gray-700"
          >
            Back To Library
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
