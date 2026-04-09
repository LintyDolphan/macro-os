"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import {
  getCurrentUser,
  listVisibleExercises,
  type ExerciseRecord,
} from "../../lib/supabase/workouts-db";

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

export default function WorkoutExercisesPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
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

  if (redirecting || !authChecked) {
    return (
      <AppShell
        title="Exercises"
        subtitle="Browse and organize your movement library"
        backHref="/workouts"
        backLabel="Workout"
      >
        <div className="text-sm text-gray-400">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Exercises"
      subtitle="Browse and organize your movement library"
      backHref="/workouts"
      backLabel="Workout"
    >
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
            filteredExercises.map((exercise) => (
              <Link
                key={exercise.id}
                href={`/workouts/exercises/${exercise.id}`}
                className="block rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm transition hover:bg-gray-700"
              >
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
                    View
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-3xl border border-dashed border-gray-700 bg-gray-800/40 p-5 text-sm text-gray-400">
              {exercises.length === 0
                ? "No exercises are in your library yet. Once you add public or custom exercises, they will show up here."
                : `No exercises match "${search.trim()}" in this filter.`}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
