"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "../components/AppShell";
import { saveMacroTarget, type SaveMacroTargetInput } from "../lib/macro-db";
import {
  saveUserProfile,
  type BudgetPriority,
  type OnboardingActivity,
  type OnboardingGender,
  type OnboardingGoal,
  type TrainingGoal,
} from "../lib/user-profile-db";

type StepId = "basics" | "goal" | "food" | "training" | "preview";

type Draft = {
  age: string;
  gender: OnboardingGender | "";
  heightFt: string;
  heightIn: string;
  weightLbs: string;
  targetWeightLbs: string;
  goal: OnboardingGoal;
  activity: OnboardingActivity;
  dietaryRestrictions: string[];
  foodPreferences: string[];
  budgetPriority: BudgetPriority;
  trainingGoal: TrainingGoal;
  trainingDaysPerWeek: string;
  equipmentAccess: string[];
  healthLimitations: string;
  workoutPreferences: string[];
};

const steps: { id: StepId; label: string; helper: string }[] = [
  { id: "basics", label: "Basics", helper: "Your starting point" },
  { id: "goal", label: "Goal", helper: "Where we are aiming" },
  { id: "food", label: "Food", helper: "How meals should feel" },
  { id: "training", label: "Training", helper: "What workouts can use" },
  { id: "preview", label: "Preview", helper: "Starter beta plan" },
];

const restrictionOptions = [
  "High Protein",
  "Low Carb",
  "Vegetarian",
  "Vegan",
  "Dairy-Free",
  "Gluten-Free",
  "Nut-Free",
  "No Pork",
];

const foodPreferenceOptions = [
  "Quick Meals",
  "Meal Prep",
  "Budget Friendly",
  "Simple Ingredients",
  "Higher Variety",
  "Leftover Friendly",
];

const equipmentOptions = [
  "Full Gym",
  "Dumbbells",
  "Barbell",
  "Cable Machine",
  "Resistance Bands",
  "Bodyweight",
  "Cardio Machine",
];

const workoutPreferenceOptions = [
  "Strength",
  "Hypertrophy",
  "Cardio",
  "Mobility",
  "Short Sessions",
  "Beginner Friendly",
];

const initialDraft: Draft = {
  age: "",
  gender: "",
  heightFt: "",
  heightIn: "",
  weightLbs: "",
  targetWeightLbs: "",
  goal: "maintain",
  activity: "moderate",
  dietaryRestrictions: [],
  foodPreferences: ["Simple Ingredients"],
  budgetPriority: "balanced",
  trainingGoal: "general",
  trainingDaysPerWeek: "3",
  equipmentAccess: ["Bodyweight"],
  healthLimitations: "",
  workoutPreferences: ["Beginner Friendly"],
};

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function lbsToKg(value: number) {
  return value * 0.45359237;
}

function inchesToCm(value: number) {
  return value * 2.54;
}

function kgToLbs(value: number) {
  return value / 0.45359237;
}

function roundMacro(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function niceGoal(goal: OnboardingGoal) {
  if (goal === "recomp") return "Recomposition";
  return goal.charAt(0).toUpperCase() + goal.slice(1);
}

function toggleListValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function activityMultiplier(activity: OnboardingActivity) {
  switch (activity) {
    case "sedentary":
      return 1.2;
    case "light":
      return 1.375;
    case "moderate":
      return 1.55;
    case "very":
      return 1.725;
    case "athlete":
      return 1.9;
    default:
      return 1.55;
  }
}

function goalAdjustment(goal: OnboardingGoal) {
  switch (goal) {
    case "cut":
      return 0.85;
    case "bulk":
      return 1.1;
    case "recomp":
      return 1;
    case "maintain":
    default:
      return 1;
  }
}

function calculateStarterMacros(draft: Draft) {
  const age = toNumber(draft.age);
  const weightLbs = toNumber(draft.weightLbs);
  const heightIn = toNumber(draft.heightFt) * 12 + toNumber(draft.heightIn);
  const weightKg = lbsToKg(weightLbs);
  const heightCm = inchesToCm(heightIn);
  const sexOffset = draft.gender === "male" ? 5 : draft.gender === "female" ? -161 : -78;
  const bmr =
    age > 0 && weightKg > 0 && heightCm > 0
      ? 10 * weightKg + 6.25 * heightCm - 5 * age + sexOffset
      : 2000;
  const calories = roundMacro(bmr * activityMultiplier(draft.activity) * goalAdjustment(draft.goal));
  const proteinPerLb = draft.goal === "cut" || draft.goal === "recomp" ? 0.9 : 0.8;
  const protein = roundMacro(weightLbs * proteinPerLb);
  const fat = roundMacro((calories * 0.25) / 9);
  const carbs = roundMacro((calories - protein * 4 - fat * 9) / 4);

  return {
    calories,
    protein,
    carbs,
    fat,
  };
}

function SelectCard({
  active,
  title,
  body,
  onClick,
}: {
  active: boolean;
  title: string;
  body?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition ${
        active
          ? "border-blue-400 bg-blue-500/20 text-white"
          : "border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-500"
      }`}
    >
      <div className="text-sm font-semibold">{title}</div>
      {body ? <div className="mt-1 text-xs leading-5 text-gray-400">{body}</div> : null}
    </button>
  );
}

function Chip({
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
      className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
        active
          ? "bg-blue-500 text-white"
          : "bg-gray-900 text-gray-300 hover:bg-gray-700"
      }`}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode = "numeric",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: "numeric" | "text";
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={inputMode}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white outline-none focus:border-blue-400"
      />
    </label>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeStep = steps[stepIndex];
  const starterMacros = useMemo(() => calculateStarterMacros(draft), [draft]);
  const heightIn = toNumber(draft.heightFt) * 12 + toNumber(draft.heightIn);
  const weightLbs = toNumber(draft.weightLbs);
  const targetWeightLbs = toNumber(draft.targetWeightLbs);

  function patch(patch: Partial<Draft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setError(null);
  }

  function validateCurrentStep() {
    if (activeStep.id === "basics") {
      if (!toNumber(draft.age) || !draft.gender || !heightIn || !weightLbs) {
        return "Add age, gender, height, and weight before continuing.";
      }
    }

    if (activeStep.id === "training" && toNumber(draft.trainingDaysPerWeek) > 7) {
      return "Training days should be between 0 and 7.";
    }

    return null;
  }

  function goNext() {
    const validation = validateCurrentStep();
    if (validation) {
      setError(validation);
      return;
    }

    setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
  }

  async function finishOnboarding() {
    const validation = validateCurrentStep();
    if (validation) {
      setError(validation);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await saveUserProfile({
        age: Math.round(toNumber(draft.age)),
        gender: draft.gender || null,
        height_cm: inchesToCm(heightIn),
        weight_kg: lbsToKg(weightLbs),
        target_weight_kg: targetWeightLbs > 0 ? lbsToKg(targetWeightLbs) : null,
        goal_type: draft.goal,
        activity_level: draft.activity,
        dietary_restrictions: draft.dietaryRestrictions,
        food_preferences: draft.foodPreferences,
        budget_priority: draft.budgetPriority,
        training_goal: draft.trainingGoal,
        training_days_per_week: Math.max(0, Math.min(7, Math.round(toNumber(draft.trainingDaysPerWeek)))),
        equipment_access: draft.equipmentAccess,
        health_limitations: draft.healthLimitations,
        workout_preferences: draft.workoutPreferences,
        onboarding_completed: true,
        intelligence_notes: {
          betaStarterMacros: starterMacros,
          units: "imperial_input_metric_storage",
        },
      });

      const macroTarget: SaveMacroTargetInput = {
        calories: starterMacros.calories,
        protein: starterMacros.protein,
        carbs: starterMacros.carbs,
        fat: starterMacros.fat,
        sex: draft.gender === "male" || draft.gender === "female" ? draft.gender : null,
        age: Math.round(toNumber(draft.age)),
        activity: draft.activity,
        weight_lbs: Math.round(weightLbs),
        height_in: Math.round(heightIn),
        goal: draft.goal === "recomp" ? "maintain" : draft.goal,
        is_current: true,
      };

      await saveMacroTarget(macroTarget);
      router.push("/");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Onboarding could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Personal Setup" subtitle="Give Macro OS enough context to stop being generic" backHref="/" backLabel="Dashboard">
      <div className="space-y-4">
        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
                Step {stepIndex + 1} of {steps.length}
              </div>
              <h1 className="mt-1 text-xl font-bold text-white">{activeStep.label}</h1>
              <p className="mt-1 text-sm text-gray-400">{activeStep.helper}</p>
            </div>
            <div className="rounded-2xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white">
              {Math.round(((stepIndex + 1) / steps.length) * 100)}%
            </div>
          </div>
          <div className="mt-4 grid grid-cols-5 gap-1.5">
            {steps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                onClick={() => setStepIndex(index)}
                className={`h-2 rounded-full transition ${
                  index <= stepIndex ? "bg-blue-500" : "bg-gray-900"
                }`}
                aria-label={step.label}
              />
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-700 bg-gray-800 p-4">
          {activeStep.id === "basics" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Age" value={draft.age} onChange={(age) => patch({ age })} placeholder="28" />
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                    Gender
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["male", "Male"],
                      ["female", "Female"],
                      ["other", "Other"],
                      ["prefer_not_to_say", "Skip"],
                    ].map(([value, label]) => (
                      <Chip
                        key={value}
                        active={draft.gender === value}
                        label={label}
                        onClick={() => patch({ gender: value as OnboardingGender })}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Height ft" value={draft.heightFt} onChange={(heightFt) => patch({ heightFt })} placeholder="5" />
                <Field label="Height in" value={draft.heightIn} onChange={(heightIn) => patch({ heightIn })} placeholder="10" />
              </div>

              <Field label="Current weight lbs" value={draft.weightLbs} onChange={(weightLbs) => patch({ weightLbs })} placeholder="180" />
            </div>
          ) : null}

          {activeStep.id === "goal" ? (
            <div className="space-y-4">
              <div className="grid gap-2">
                <SelectCard
                  active={draft.goal === "cut"}
                  title="Cut"
                  body="Prioritize fat loss while keeping protein high."
                  onClick={() => patch({ goal: "cut" })}
                />
                <SelectCard
                  active={draft.goal === "maintain"}
                  title="Maintain"
                  body="Keep body weight fairly stable while building consistency."
                  onClick={() => patch({ goal: "maintain" })}
                />
                <SelectCard
                  active={draft.goal === "bulk"}
                  title="Bulk"
                  body="Add calories to support muscle gain."
                  onClick={() => patch({ goal: "bulk" })}
                />
                <SelectCard
                  active={draft.goal === "recomp"}
                  title="Recomposition"
                  body="Stay near maintenance with stronger protein and training focus."
                  onClick={() => patch({ goal: "recomp" })}
                />
              </div>

              <Field
                label="Target weight lbs"
                value={draft.targetWeightLbs}
                onChange={(targetWeightLbs) => patch({ targetWeightLbs })}
                placeholder="Optional"
              />

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Activity Level
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["sedentary", "Sedentary"],
                    ["light", "Light"],
                    ["moderate", "Moderate"],
                    ["very", "Very Active"],
                    ["athlete", "Athlete"],
                  ].map(([value, label]) => (
                    <Chip
                      key={value}
                      active={draft.activity === value}
                      label={label}
                      onClick={() => patch({ activity: value as OnboardingActivity })}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {activeStep.id === "food" ? (
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Dietary Notes
                </div>
                <div className="flex flex-wrap gap-2">
                  {restrictionOptions.map((option) => (
                    <Chip
                      key={option}
                      active={draft.dietaryRestrictions.includes(option)}
                      label={option}
                      onClick={() =>
                        patch({
                          dietaryRestrictions: toggleListValue(draft.dietaryRestrictions, option),
                        })
                      }
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Meal Style
                </div>
                <div className="flex flex-wrap gap-2">
                  {foodPreferenceOptions.map((option) => (
                    <Chip
                      key={option}
                      active={draft.foodPreferences.includes(option)}
                      label={option}
                      onClick={() =>
                        patch({ foodPreferences: toggleListValue(draft.foodPreferences, option) })
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  ["low", "Budget First"],
                  ["balanced", "Balanced"],
                  ["flexible", "Flexible"],
                ].map(([value, label]) => (
                  <Chip
                    key={value}
                    active={draft.budgetPriority === value}
                    label={label}
                    onClick={() => patch({ budgetPriority: value as BudgetPriority })}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {activeStep.id === "training" ? (
            <div className="space-y-4">
              <div className="grid gap-2">
                {[
                  ["strength", "Strength", "Build stronger main lifts and movement patterns."],
                  ["muscle", "Muscle", "Hypertrophy-oriented templates and volume."],
                  ["fat_loss", "Fat Loss", "Mix lifting, steps, and conditioning."],
                  ["endurance", "Endurance", "More cardio and conditioning support."],
                  ["general", "General Fitness", "Balanced training without over-specializing."],
                ].map(([value, title, body]) => (
                  <SelectCard
                    key={value}
                    active={draft.trainingGoal === value}
                    title={title}
                    body={body}
                    onClick={() => patch({ trainingGoal: value as TrainingGoal })}
                  />
                ))}
              </div>

              <Field
                label="Training days per week"
                value={draft.trainingDaysPerWeek}
                onChange={(trainingDaysPerWeek) => patch({ trainingDaysPerWeek })}
                placeholder="3"
              />

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Equipment Access
                </div>
                <div className="flex flex-wrap gap-2">
                  {equipmentOptions.map((option) => (
                    <Chip
                      key={option}
                      active={draft.equipmentAccess.includes(option)}
                      label={option}
                      onClick={() =>
                        patch({ equipmentAccess: toggleListValue(draft.equipmentAccess, option) })
                      }
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Workout Preferences
                </div>
                <div className="flex flex-wrap gap-2">
                  {workoutPreferenceOptions.map((option) => (
                    <Chip
                      key={option}
                      active={draft.workoutPreferences.includes(option)}
                      label={option}
                      onClick={() =>
                        patch({
                          workoutPreferences: toggleListValue(draft.workoutPreferences, option),
                        })
                      }
                    />
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Limitations or injuries
                </span>
                <textarea
                  value={draft.healthLimitations}
                  onChange={(event) => patch({ healthLimitations: event.target.value })}
                  placeholder="Optional, for example: sensitive knees, avoid overhead pressing..."
                  className="min-h-24 w-full rounded-2xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white outline-none focus:border-blue-400"
                />
              </label>
            </div>
          ) : null}

          {activeStep.id === "preview" ? (
            <div className="space-y-4">
              <div className="rounded-3xl border border-blue-400/30 bg-blue-500/10 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">
                  Starter Macro Target
                </div>
                <div className="mt-2 text-3xl font-bold text-white">
                  {starterMacros.calories} kcal
                </div>
                <div className="mt-2 text-sm text-blue-100">
                  P {starterMacros.protein}g • C {starterMacros.carbs}g • F {starterMacros.fat}g
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-gray-900 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                    Goal
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">{niceGoal(draft.goal)}</div>
                </div>
                <div className="rounded-2xl bg-gray-900 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                    Training
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">
                    {draft.trainingDaysPerWeek || 0} days / week
                  </div>
                </div>
                <div className="rounded-2xl bg-gray-900 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                    Food
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">
                    {draft.budgetPriority === "low" ? "Budget first" : draft.budgetPriority}
                  </div>
                </div>
                <div className="rounded-2xl bg-gray-900 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                    Target
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">
                    {targetWeightLbs > 0 ? `${Math.round(targetWeightLbs)} lb` : "Not set"}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-gray-900 p-4 text-sm leading-6 text-gray-300">
                Beta note: this saves your profile and creates a starter macro target. Later, the same
                profile can drive meal suggestions, grocery budget logic, workout templates, and smarter
                dashboard recommendations.
              </div>

              <div className="rounded-2xl bg-gray-900 p-4 text-xs text-gray-500">
                Stored as metric internally: {heightIn > 0 ? Math.round(inchesToCm(heightIn)) : 0} cm,
                {" "}
                {weightLbs > 0 ? Math.round(lbsToKg(weightLbs)) : 0} kg
                {targetWeightLbs > 0 ? `, target ${Math.round(kgToLbs(lbsToKg(targetWeightLbs)))} lb` : ""}.
              </div>
            </div>
          ) : null}
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-[1fr_1.5fr] gap-2">
          <button
            type="button"
            onClick={() => (stepIndex === 0 ? router.push("/") : setStepIndex((prev) => prev - 1))}
            className="rounded-2xl bg-gray-800 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700"
          >
            {stepIndex === 0 ? "Explore First" : "Back"}
          </button>
          {activeStep.id === "preview" ? (
            <button
              type="button"
              onClick={() => void finishOnboarding()}
              disabled={saving}
              className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving Setup..." : "Finish Setup"}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
}
