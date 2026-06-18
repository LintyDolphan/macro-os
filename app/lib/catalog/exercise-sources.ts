import {
  compactText,
  type NormalizedExerciseCandidate,
} from "./types"

type ApiNinjasExercise = {
  name?: string
  type?: string
  muscle?: string
  difficulty?: string
  instructions?: string
  equipments?: string[]
  safety_info?: string
}

function normalizeDifficulty(value?: string): NormalizedExerciseCandidate["difficulty"] {
  if (value === "beginner" || value === "intermediate" || value === "expert") return value
  if (value === "advanced") return "advanced"
  return null
}

function normalizeExerciseCategory(value?: string): NormalizedExerciseCandidate["category"] {
  if (value === "cardio") return "cardio"
  if (value === "stretching") return "mobility"
  if (value === "plyometrics") return "strength"
  if (value === "powerlifting" || value === "olympic_weightlifting") return "strength"
  if (value === "strength" || value === "strongman") return "strength"
  return "strength"
}

function normalizeApiNinjasExercise(exercise: ApiNinjasExercise): NormalizedExerciseCandidate {
  const name = compactText(exercise.name) || "Exercise"
  const muscle = compactText(exercise.muscle)
  const safety = compactText(exercise.safety_info)

  return {
    sourceName: "api_ninjas",
    sourceId: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    name,
    aliases: [],
    category: normalizeExerciseCategory(exercise.type),
    exerciseType: compactText(exercise.type),
    primaryMuscleGroup: muscle,
    secondaryMuscleGroups: [],
    equipment: exercise.equipments ?? [],
    difficulty: normalizeDifficulty(exercise.difficulty),
    description: null,
    instructions: compactText(exercise.instructions),
    safetyCues: safety ? [safety] : [],
    confidence: 0.72,
    raw: exercise,
  }
}

export async function searchApiNinjasExercises(query: string, limit = 10) {
  const apiKey = process.env.API_NINJAS_API_KEY
  const cleanedQuery = query.trim()
  if (!apiKey || !cleanedQuery) return []

  const params = new URLSearchParams({
    name: cleanedQuery,
  })

  const response = await fetch(`https://api.api-ninjas.com/v1/exercises?${params.toString()}`, {
    headers: {
      "X-Api-Key": apiKey,
    },
    next: { revalidate: 60 * 60 * 24 },
  })

  if (!response.ok) {
    throw new Error(`Exercise lookup failed with status ${response.status}.`)
  }

  const payload = (await response.json()) as ApiNinjasExercise[]
  return payload.slice(0, Math.min(Math.max(limit, 1), 25)).map(normalizeApiNinjasExercise)
}
