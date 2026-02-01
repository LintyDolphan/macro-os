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

export function calculateMacros(inputs: MacroInputs) {
  const { weightLbs, heightIn, age, sex, activity, goal } = inputs;

  // Convert to metric
  const weightKg = weightLbs * 0.453592;
  const heightCm = heightIn * 2.54;

  // Mifflin-St Jeor BMR
  const sexConstant = sex === "male" ? 5 : -161;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + sexConstant;

  // TDEE
  const tdee = bmr * activityMultiplier(activity);

  // Goal adjustment
  let calories = tdee;
  if (goal === "cut") calories *= 0.85;
  if (goal === "bulk") calories *= 1.1;

  // Protein: fitness-friendly default (1g/lb)
  const protein = weightLbs;

  // Fat: 25% calories
  const fat = (calories * 0.25) / 9;

  // Carbs: remaining calories
  const carbs = (calories - protein * 4 - fat * 9) / 4;

  return {
    calories: Math.round(calories),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
  };
}
