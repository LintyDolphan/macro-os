"use client";

import { addToHistory } from "../lib/history";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { calculateMacros, Activity, Sex, Goal } from "../lib/macros";

export default function CalculatorPage() {
  const router = useRouter();

  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [goal, setGoal] = useState<Goal>("maintain");
  const [sex, setSex] = useState<Sex>("male");
  const [age, setAge] = useState("");
  const [activity, setActivity] = useState<Activity>("moderate");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();

  const w = Number(weight);
  const h = Number(height);
  const a = Number(age);

  if (!w || w < 50 || w > 500) {
    setError("Please enter a valid weight (50–500 lbs).");
    return;
  }
  if (!h || h < 48 || h > 90) {
    setError("Please enter a valid height (48–90 inches).");
    return;
  }
  if (!a || a < 13 || a > 90) {
    setError("Please enter a valid age (13–90).");
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
  });

  const payload = {
    id: crypto.randomUUID(),
    ...macros,
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
    setError("Couldn’t save your macro targets. Please try again.");
    setSaving(false);
  }
}

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-900 text-white">
      <div className="w-full max-w-md bg-gray-800 p-6 rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold mb-2">Set Your Macros</h1>
        <p className="text-gray-300 mb-6">
          Enter your info and we’ll calculate your daily targets.
        </p>

        {error && (
          <div className="mb-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
  <label className="block text-sm text-gray-300 mb-1">Sex</label>
<select
  value={sex}
  onChange={(e) => setSex(e.target.value as Sex)}
  className="w-full p-3 rounded bg-gray-900 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
>
  <option value="male">Male</option>
  <option value="female">Female</option>
</select>
</div>
<div>
  <label className="block text-sm text-gray-300 mb-1">Age</label>
  <input
    type="number"
    value={age}
    onChange={(e) => setAge(e.target.value)}
    placeholder="25"
    className="w-full p-3 rounded bg-gray-900 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
  />
</div>
<div>
  <label className="block text-sm text-gray-300 mb-1">Activity</label>
  <select
    value={activity}
    onChange={(e) => setActivity(e.target.value as Activity)}
    className="w-full p-3 rounded bg-gray-900 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
  >
    <option value="sedentary">Sedentary (little exercise)</option>
    <option value="light">Light (1–3 days/week)</option>
    <option value="moderate">Moderate (3–5 days/week)</option>
    <option value="very">Very Active (6–7 days/week)</option>
    <option value="athlete">Athlete (hard training / 2x day)</option>
  </select>
</div>


          <div>
            <label className="block text-sm text-gray-300 mb-1">Weight (lbs)</label>
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full p-3 rounded bg-gray-900 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Height (inches)</label>
            <input
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className="w-full p-3 rounded bg-gray-900 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Goal</label>
            <select
              value={goal}
              onChange={(e) => setGoal(e.target.value as "cut" | "maintain" | "bulk")}
              className="w-full p-3 rounded bg-gray-900 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="cut">Cut</option>
              <option value="maintain">Maintain</option>
              <option value="bulk">Bulk</option>
            </select>
          </div>

          <button
  type="submit"
  disabled={saving}
  className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
>
  {saving ? "Saving..." : "Calculate"}
</button>
        </form>
      </div>
    </main>
  );
}
