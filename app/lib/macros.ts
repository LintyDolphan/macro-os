export type Goal = "cut" | "maintain" | "bulk";
export type Sex = "male" | "female";

export type Activity =
  | "sedentary"
  | "light"
  | "moderate"
  | "very"
  | "athlete";

export type MacroInputs = {
  weightLbs: number;
  heightIn: number;
  age: number;
  sex: Sex;
  activity: Activity;
  goal: Goal;
  bodyFatPct?: number | null;
  weeklyRatePct?: number | null;
  formula?: "mifflin" | "katch";
  proteinPerLb?: number | null;
  fatRatio?: number | null;
};

function activityMultiplier(activity: Activity) {
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
  }
}

function roundCalories(value: number) {
  return Math.round(value / 10) * 10;
}

export function calculateMacros(inputs: MacroInputs) {
  const {
    weightLbs,
    heightIn,
    age,
    sex,
    activity,
    goal,
    bodyFatPct,
    weeklyRatePct,
    formula = "mifflin",
    proteinPerLb,
    fatRatio,
  } = inputs;

  // Convert to metric
  const weightKg = weightLbs * 0.453592;
  const heightCm = heightIn * 2.54;

  const leanMassKg =
    bodyFatPct != null && bodyFatPct > 0 && bodyFatPct < 100
      ? weightKg * (1 - bodyFatPct / 100)
      : null;

  // BMR
  const sexConstant = sex === "male" ? 5 : -161;
  const mifflinBmr = 10 * weightKg + 6.25 * heightCm - 5 * age + sexConstant;
  const katchBmr = leanMassKg ? 370 + 21.6 * leanMassKg : mifflinBmr;
  const bmr = formula === "katch" && leanMassKg ? katchBmr : mifflinBmr;

  // TDEE
  const tdee = bmr * activityMultiplier(activity);

  // Goal adjustment
  let calories = tdee;

  if (goal === "cut") {
    calories *= 1 - Math.min(Math.max(weeklyRatePct ?? 0.5, 0.25), 1.25) / 100 * 7;
  }

  if (goal === "bulk") {
    calories *= 1 + Math.min(Math.max(weeklyRatePct ?? 0.25, 0.1), 0.75) / 100 * 7;
  }

  // Protein: fitness-friendly default, slightly higher for cutting
  const defaultProteinPerLb = goal === "cut" ? 1 : 0.9;
  const protein = weightLbs * (proteinPerLb ?? defaultProteinPerLb);

  const roundedCalories = roundCalories(calories);

  // Fat: 25% calories by default
  const fat = (roundedCalories * (fatRatio ?? 0.25)) / 9;

  // Carbs: remaining calories
  const carbs = (roundedCalories - protein * 4 - fat * 9) / 4;

  return {
    calories: roundedCalories,
    protein: Math.round(protein),
    carbs: Math.max(0, Math.round(carbs)),
    fat: Math.round(fat),
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
  };
}
