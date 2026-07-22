"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import {
  createFeedback,
  listMyFeedback,
  type FeedbackCategory,
  type FeedbackRecord,
  type FeedbackSentiment,
} from "../lib/supabase/feedback-db";

const categoryOptions: { value: FeedbackCategory; label: string }[] = [
  { value: "general", label: "General" },
  { value: "bug", label: "Bug" },
  { value: "idea", label: "Idea" },
  { value: "flow", label: "App Flow" },
  { value: "visual", label: "Visuals" },
  { value: "nutrition", label: "Nutrition" },
  { value: "workout", label: "Workout" },
  { value: "grocery", label: "Grocery" },
  { value: "account", label: "Account" },
];

const sentimentOptions: { value: FeedbackSentiment; label: string }[] = [
  { value: "idea", label: "Idea" },
  { value: "issue", label: "Issue" },
  { value: "praise", label: "Praise" },
  { value: "question", label: "Question" },
];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function SelectPill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition ${
        active
          ? "border-[rgba(189,238,255,0.42)] bg-[var(--mono-blue)] text-[#020405] shadow-[0_0_18px_rgba(111,213,255,0.18)]"
          : "border-gray-700 bg-gray-900 text-gray-300 hover:border-[rgba(189,238,255,0.28)]"
      }`}
    >
      {label}
    </button>
  );
}

export default function FeedbackPage() {
  const [category, setCategory] = useState<FeedbackCategory>("general");
  const [sentiment, setSentiment] = useState<FeedbackSentiment>("idea");
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [pagePath, setPagePath] = useState("");
  const [feedback, setFeedback] = useState<FeedbackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remainingChars = useMemo(() => 2000 - message.length, [message.length]);

  useEffect(() => {
    let active = true;

    async function loadFeedback() {
      try {
        const rows = await listMyFeedback();
        if (!active) return;
        setFeedback(rows);
        setError(null);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Feedback could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadFeedback();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    setSubmitting(true);
    setStatus(null);
    setError(null);

    try {
      const created = await createFeedback({
        category,
        sentiment,
        rating,
        page_path: pagePath,
        message,
      });

      setFeedback((current) => [created, ...current].slice(0, 5));
      setMessage("");
      setPagePath("");
      setRating(null);
      setStatus("Feedback sent. Thank you, this is genuinely useful.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Feedback could not be sent.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell
      title="Feedback"
      subtitle="Share comments, issues, and beta recommendations"
      backHref="/settings"
      backLabel="Settings"
    >
      <div className="mx-auto max-w-md space-y-4 pb-24">
        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h1 className="text-xl font-bold text-white">Send Feedback</h1>
          <p className="mt-2 text-sm leading-6 text-gray-400">
            Leave a note about anything that felt confusing, broken, useful, too slow, too hidden,
            or surprisingly good.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                Type
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {sentimentOptions.map((option) => (
                  <SelectPill
                    key={option.value}
                    active={sentiment === option.value}
                    label={option.label}
                    onClick={() => setSentiment(option.value)}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                Area
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {categoryOptions.map((option) => (
                  <SelectPill
                    key={option.value}
                    active={category === option.value}
                    label={option.label}
                    onClick={() => setCategory(option.value)}
                  />
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                Optional Page
              </span>
              <input
                value={pagePath}
                onChange={(event) => setPagePath(event.target.value)}
                placeholder="Example: /macros or workout session"
                className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white outline-none placeholder:text-gray-500 focus:border-blue-400"
              />
            </label>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                  Rating
                </span>
                <button
                  type="button"
                  onClick={() => setRating(null)}
                  className="text-xs font-semibold text-gray-500 hover:text-white"
                >
                  Clear
                </button>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    className={`rounded-2xl border px-3 py-3 text-sm font-bold transition ${
                      rating === value
                        ? "border-[rgba(189,238,255,0.46)] bg-[var(--mono-blue)] text-[#020405] shadow-[0_0_18px_rgba(111,213,255,0.18)]"
                        : "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                Comment
              </span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value.slice(0, 2000))}
                placeholder="What should be improved, fixed, added, or kept?"
                className="min-h-36 w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-gray-500 focus:border-blue-400"
              />
              <span className="mt-1 block text-right text-[11px] text-gray-500">
                {remainingChars} characters left
              </span>
            </label>

            {status ? (
              <div className="rounded-2xl border border-[rgba(189,238,255,0.28)] bg-[rgba(189,238,255,0.08)] p-3 text-sm text-[#d8f5ff]">
                {status}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting || message.trim().length < 3}
              className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Sending..." : "Send Feedback"}
            </button>
          </form>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-white">Recent Feedback</h2>
          <div className="mt-4 space-y-3">
            {loading ? (
              <div className="rounded-2xl bg-gray-900 p-4 text-sm text-gray-400">
                Loading feedback...
              </div>
            ) : feedback.length > 0 ? (
              feedback.map((item) => (
                <div key={item.id} className="rounded-2xl border border-gray-700 bg-gray-900 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-200">
                      {item.category} · {item.sentiment}
                    </div>
                    <div className="text-xs text-gray-500">{formatDate(item.created_at)}</div>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-300">{item.message}</p>
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500">
                    <span className="capitalize">Status: {item.status}</span>
                    {item.rating ? <span>{item.rating}/5</span> : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-gray-900 p-4 text-sm text-gray-400">
                No feedback sent yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
