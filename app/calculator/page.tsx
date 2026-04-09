"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "../components/AppShell";
import { addToHistory } from "../lib/history";
import { calculateMacros, type Activity, type Goal, type Sex } from "../lib/macros";

type CalculatorTab = "estimate" | "advanced";

const activityOptions: Array<{ value: Activity; label: string; hint: string }> = [
  { value: "sedentary", label: "Sedentary", hint: "Desk-based days with little exercise." },
  { value: "light", label: "Light", hint: "Training or movement 1-3 days per week." },
  { value: "moderate", label: "Moderate", hint: "Training 3-5 days per week." },
  { value: "very", label: "Very Active", hint: "Hard training most days of the week." },
  { value: "athlete", label: "Athlete", hint: "High-volume training or multiple sessions." },
];

const goalOptions: Array<{ value: Goal; label: string; hint: string }> = [
  { value: "cut", label: "Cut", hint: "Create a calorie deficit for fat loss." },
  { value: "maintain", label: "Maintain", hint: "Hold body weight while fueling performance." },
  { value: "bulk", label: "Bulk", hint: "Use a surplus for lean mass gain." },
];

const tabOptions: Array<{ value: CalculatorTab; label: string; description: string }> = [
  { value: "estimate", label: "Quick Estimate", description: "Fast setup using your core stats." },
  { value: "advanced", label: "Advanced", description: "Body-fat, formula, and pace controls." },
];

function formatGoalRate(goal: Goal) {
  if (goal === "cut") return "Suggested: 0.5-1.0% body weight loss per week";
  if (goal === "bulk") return "Suggested: 0.1-0.5% body weight gain per week";
  return "Maintenance uses your estimated TDEE without a pace adjustment.";
}

export default function CalculatorPage() {
  const router = useRouter();

  const [tab, setTab] = useState<CalculatorTab>("estimate");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [goal, setGoal] = useState<Goal>("maintain");
  const [sex, setSex] = useState<Sex>("male");
  const [age, setAge] = useState("");
  const [activity, setActivity] = useState<Activity>("moderate");
  const [bodyFatPct, setBodyFatPct] = useState("");
  const [weeklyRatePct, setWeeklyRatePct] = useState("");
  const [formula, setFormula] = useState<"mifflin" | "katch">("mifflin");
  const [proteinPerLb, setProteinPerLb] = useState("");
  const [fatRatio, setFatRatio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const preview = useMemo(() => {
    const w = Number(weight);
    const h = Number(height);
    const a = Number(age);

    if (!w || !h || !a) return null;

    try {
      return calculateMacros({
        weightLbs: w,
        heightIn: h,
        age: a,
        sex,
        activity,
        goal,
        bodyFatPct: bodyFatPct ? Number(bodyFatPct) : null,
        weeklyRatePct: weeklyRatePct ? Number(weeklyRatePct) : null,
        formula,
        proteinPerLb: proteinPerLb ? Number(proteinPerLb) : null,
        fatRatio: fatRatio ? Number(fatRatio) / 100 : null,
      });
    } catch {
      return null;
    }
  }, [activity, age, bodyFatPct, fatRatio, formula, goal, height, proteinPerLb, sex, weight, weeklyRatePct]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const w = Number(weight);
    const h = Number(height);
    const a = Number(age);
    const bodyFat = bodyFatPct ? Number(bodyFatPct) : null;
    const weeklyRate = weeklyRatePct ? Number(weeklyRatePct) : null;
    const proteinTarget = proteinPerLb ? Number(proteinPerLb) : null;
    const fatTarget = fatRatio ? Number(fatRatio) : null;

    if (!w || w < 50 || w > 500) {
      setError("Please enter a valid weight between 50 and 500 lbs.");
      return;
    }
    if (!h || h < 48 || h > 90) {
      setError("Please enter a valid height between 48 and 90 inches.");
      return;
    }
    if (!a || a < 13 || a > 90) {
      setError("Please enter a valid age between 13 and 90.");
      return;
    }
    if (bodyFat !== null && (bodyFat < 3 || bodyFat > 60)) {
      setError("Body fat percentage should be between 3 and 60.");
      return;
    }
    if (weeklyRate !== null && weeklyRate <= 0) {
      setError("Weekly rate should be greater than 0 if provided.");
      return;
    }
    if (proteinTarget !== null && (proteinTarget < 0.6 || proteinTarget > 1.4)) {
      setError("Protein target should be between 0.6 and 1.4 g per lb.");
      return;
    }
    if (fatTarget !== null && (fatTarget < 15 || fatTarget > 40)) {
      setError("Fat percentage should be between 15% and 40%.");
      return;
    }

    setError(null);
    setSaving(true);

    const macros = calculateMacros({
      weightLbs: w,
      heightIn: h,
      age: a,
      sex,
      activity,
      goal,
      bodyFatPct: bodyFat,
      weeklyRatePct: weeklyRate,
      formula,
      proteinPerLb: proteinTarget,
      fatRatio: fatTarget != null ? fatTarget / 100 : null,
    });

    const payload = {
      id: crypto.randomUUID(),
      calories: macros.calories,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
      inputs: {
        sex,
        age: a,
        activity,
        weightLbs: w,
        heightIn: h,
        goal,
      },
      updatedAt: new Date().toISOString(),
    };

    try {
      await addToHistory(payload);
      router.push("/");
    } catch (error) {
      console.error("Failed to save macro target:", error);
      setError("Could not save your macro targets. Please try again.");
      setSaving(false);
      return;
    }

    setSaving(false);
  }

  return (
    <AppShell
      title="Macro Calculator"
      subtitle="Build a more personalized daily target"
      backHref="/"
      backLabel="Dashboard"
    >
      <div className="space-y-4 pb-6">
        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">Set Your Macros</h1>
              <p className="mt-2 text-sm text-gray-400">
                Start with the quick estimate or use the advanced tab for a tighter calorie and macro setup.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {tabOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTab(option.value)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  tab === option.value
                    ? "border-blue-400/45 bg-blue-600 text-white"
                    : "border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-700"
                }`}
              >
                <div className="text-sm font-semibold">{option.label}</div>
                <div className={`mt-1 text-xs leading-5 ${tab === option.value ? "text-blue-100" : "text-gray-500"}`}>
                  {option.description}
                </div>
              </button>
            ))}
          </div>
        </section>

        {preview ? (
          <section className="rounded-3xl border border-blue-400/20 bg-gradient-to-br from-blue-500/12 to-slate-800 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-200/80">
                  Live Preview
                </div>
                <div className="mt-2 text-lg font-semibold text-white">{preview.calories} calories / day</div>
              </div>
              <div className="rounded-2xl bg-slate-950/70 px-3 py-2 text-xs text-gray-300">
                BMR {preview.bmr} • TDEE {preview.tdee}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-slate-950/70 p-4 text-center">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">Protein</div>
                <div className="mt-2 text-lg font-semibold text-white">{preview.protein}g</div>
              </div>
              <div className="rounded-2xl bg-slate-950/70 p-4 text-center">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">Carbs</div>
                <div className="mt-2 text-lg font-semibold text-white">{preview.carbs}g</div>
              </div>
              <div className="rounded-2xl bg-slate-950/70 p-4 text-center">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">Fat</div>
                <div className="mt-2 text-lg font-semibold text-white">{preview.fat}g</div>
              </div>
            </div>
          </section>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-white">Core Stats</h2>
              <p className="mt-1 text-sm text-gray-400">These drive your baseline estimate.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-gray-300">Sex</label>
                <select
                  value={sex}
                  onChange={(e) => setSex(e.target.value as Sex)}
                  className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-gray-300">Age</label>
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="25"
                  className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-gray-300">Weight (lbs)</label>
                <input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="180"
                  className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-gray-300">Height (inches)</label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="70"
                  className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-white">Activity & Goal</h2>
              <p className="mt-1 text-sm text-gray-400">Pick the setup closest to your real weekly routine.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-gray-300">Activity</label>
                <select
                  value={activity}
                  onChange={(e) => setActivity(e.target.value as Activity)}
                  className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {activityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="mt-2 text-xs text-gray-500">
                  {activityOptions.find((option) => option.value === activity)?.hint}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm text-gray-300">Goal</label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {goalOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setGoal(option.value)}
                      className={`rounded-2xl border px-4 py-3 text-left transition ${
                        goal === option.value
                          ? "border-blue-400/45 bg-blue-600 text-white"
                          : "border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-700"
                      }`}
                    >
                      <div className="text-sm font-semibold">{option.label}</div>
                      <div className={`mt-1 text-xs leading-5 ${goal === option.value ? "text-blue-100" : "text-gray-500"}`}>
                        {option.hint}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="mt-2 text-xs text-gray-500">{formatGoalRate(goal)}</div>
              </div>
            </div>
          </section>

          {tab === "advanced" ? (
            <section className="rounded-3xl border border-gray-700 bg-gray-800 p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-white">Advanced Inputs</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Optional inputs for a tighter estimate and more customized macro split.
                </p>
              </div>

              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-gray-300">Formula</label>
                    <select
                      value={formula}
                      onChange={(e) => setFormula(e.target.value as "mifflin" | "katch")}
                      className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="mifflin">Mifflin-St Jeor</option>
                      <option value="katch">Katch-McArdle</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-gray-300">Body Fat %</label>
                    <input
                      type="number"
                      value={bodyFatPct}
                      onChange={(e) => setBodyFatPct(e.target.value)}
                      placeholder="Optional"
                      className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-gray-300">Weekly Rate %</label>
                    <input
                      type="number"
                      step="0.1"
                      value={weeklyRatePct}
                      onChange={(e) => setWeeklyRatePct(e.target.value)}
                      placeholder={goal === "bulk" ? "0.25" : goal === "cut" ? "0.5" : "Optional"}
                      className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-gray-300">Protein (g / lb)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={proteinPerLb}
                      onChange={(e) => setProteinPerLb(e.target.value)}
                      placeholder="Default based on goal"
                      className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm text-gray-300">Fat % of Calories</label>
                    <input
                      type="number"
                      step="1"
                      value={fatRatio}
                      onChange={(e) => setFatRatio(e.target.value)}
                      placeholder="25"
                      className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <div className="mt-2 text-xs text-gray-500">
                      Useful if you prefer slightly higher-fat or higher-carb setups while keeping calories fixed.
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-2xl bg-gray-800 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Targets"}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
