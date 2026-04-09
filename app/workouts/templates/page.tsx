"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import {
  getCurrentUser,
  listWorkoutTemplates,
  type WorkoutTemplateRecord,
} from "../../lib/supabase/workouts-db";

function formatTemplateMeta(template: WorkoutTemplateRecord) {
  const duration =
    template.estimated_duration_min && template.estimated_duration_min > 0
      ? `${template.estimated_duration_min} min`
      : "Duration not set";

  const updated = new Date(template.updated_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return `${duration} • Updated ${updated}`;
}

export default function WorkoutTemplatesPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [search, setSearch] = useState("");
  const [templates, setTemplates] = useState<WorkoutTemplateRecord[]>([]);
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

        const loadedTemplates = await listWorkoutTemplates(user.id);
        if (!active) return;

        setTemplates(loadedTemplates);
        setError(null);
      } catch (error) {
        if (!active) return;
        console.error("Failed to initialize workout templates page:", error);
        setError(error instanceof Error ? error.message : "Templates could not be loaded.");
      } finally {
        if (active) setAuthChecked(true);
      }
    }

    void init();

    return () => {
      active = false;
    };
  }, []);

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return templates;

    return templates.filter((template) => {
      const matchesName = template.name.toLowerCase().includes(query);
      const matchesDescription = template.description?.toLowerCase().includes(query) ?? false;
      const matchesTags = template.focus_tags.some((tag) => tag.toLowerCase().includes(query));
      return matchesName || matchesDescription || matchesTags;
    });
  }, [search, templates]);

  if (redirecting || !authChecked) {
    return (
      <AppShell
        title="Templates"
        subtitle="Build and reuse your workouts"
        backHref="/workouts"
        backLabel="Workout"
      >
        <div className="text-sm text-gray-400">Loading...</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Templates"
      subtitle="Build and reuse your workouts"
      backHref="/workouts"
      backLabel="Workout"
    >
      <div className="space-y-4 pb-16">
        {error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-4 shadow-sm">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder:text-gray-500"
          />
        </section>

        <div className="space-y-3">
          {filteredTemplates.length > 0 ? (
            filteredTemplates.map((template) => (
              <article
                key={template.id}
                className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm"
              >
                <div className="text-base font-semibold text-white">{template.name}</div>
                <div className="mt-1 text-sm text-gray-400">{formatTemplateMeta(template)}</div>
                {template.description ? (
                  <div className="mt-2 text-sm text-gray-400">{template.description}</div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(template.focus_tags.length > 0 ? template.focus_tags : ["No tags"]).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-gray-900 px-3 py-1.5 text-xs text-gray-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <Link
                    href={`/workouts/session/${template.id}`}
                    className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Start
                  </Link>
                  <Link
                    href={`/workouts/templates/${template.id}`}
                    className="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700"
                  >
                    Edit
                  </Link>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-3xl border border-dashed border-gray-700 bg-gray-800/40 p-5 text-sm text-gray-400">
              {templates.length === 0
                ? "No workout templates yet. Create your first one to start building the workout side of Macro OS."
                : `No templates match "${search.trim()}".`}
            </div>
          )}
        </div>

        <Link
          href="/workouts/templates/new"
          className="fixed bottom-32 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-[20px] border-2 border-blue-300/45 bg-blue-600 text-3xl font-light text-white shadow-[0_18px_40px_rgba(37,99,235,0.35)] transition hover:bg-blue-700 sm:right-[calc(50%-12rem)]"
          aria-label="Create template"
        >
          +
        </Link>
      </div>
    </AppShell>
  );
}
