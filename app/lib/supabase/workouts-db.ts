import { supabase } from "./client"

export type ExerciseCategory = "strength" | "cardio" | "mobility" | "core"
export type ExerciseLoggingStyle = "reps_weight" | "time" | "distance_time" | "reps_only"
export type WorkoutSessionStatus = "in_progress" | "completed" | "cancelled"
export type DistanceUnit = "km" | "mi" | "m"

export type ExerciseRecord = {
  id: string
  created_at: string
  updated_at: string
  name: string
  slug: string | null
  category: ExerciseCategory
  primary_muscle_group: string | null
  secondary_muscle_groups: string[]
  equipment: string[]
  movement_pattern: string | null
  logging_style: ExerciseLoggingStyle
  instructions: string | null
  is_public: boolean
  created_by_user_id: string | null
}

export type ExerciseInsert = {
  name: string
  slug?: string | null
  category: ExerciseCategory
  primary_muscle_group?: string | null
  secondary_muscle_groups?: string[]
  equipment?: string[]
  movement_pattern?: string | null
  logging_style: ExerciseLoggingStyle
  instructions?: string | null
  is_public?: boolean
}

export type WorkoutTemplateRecord = {
  id: string
  created_at: string
  updated_at: string
  user_id: string
  name: string
  description: string | null
  focus_tags: string[]
  estimated_duration_min: number | null
  is_archived: boolean
}

export type WorkoutTemplateInsert = {
  name: string
  description?: string | null
  focus_tags?: string[]
  estimated_duration_min?: number | null
  is_archived?: boolean
}

export type WorkoutTemplateExerciseRecord = {
  id: string
  created_at: string
  template_id: string
  exercise_id: string
  sort_order: number
  target_sets: number | null
  target_reps: number | null
  target_reps_min: number | null
  target_reps_max: number | null
  target_weight: number | null
  target_duration_sec: number | null
  target_distance: number | null
  target_distance_unit: DistanceUnit | null
  target_rest_sec: number | null
  notes: string | null
  exercise?: ExerciseRecord | ExerciseRecord[] | null
}

export type WorkoutTemplateExerciseInsert = {
  exercise_id: string
  sort_order: number
  target_sets?: number | null
  target_reps?: number | null
  target_reps_min?: number | null
  target_reps_max?: number | null
  target_weight?: number | null
  target_duration_sec?: number | null
  target_distance?: number | null
  target_distance_unit?: DistanceUnit | null
  target_rest_sec?: number | null
  notes?: string | null
}

export type WorkoutSessionRecord = {
  id: string
  created_at: string
  updated_at: string
  user_id: string
  template_id: string | null
  name: string
  session_date: string
  started_at: string | null
  completed_at: string | null
  duration_sec: number | null
  status: WorkoutSessionStatus
  notes: string | null
}

export type WorkoutSessionInsert = {
  template_id?: string | null
  name: string
  session_date?: string
  started_at?: string | null
  completed_at?: string | null
  duration_sec?: number | null
  status?: WorkoutSessionStatus
  notes?: string | null
}

export type WorkoutSessionExerciseRecord = {
  id: string
  created_at: string
  session_id: string
  exercise_id: string
  template_exercise_id: string | null
  sort_order: number
  planned_sets: number | null
  planned_reps: number | null
  planned_duration_sec: number | null
  planned_distance: number | null
  notes: string | null
  exercise?: ExerciseRecord | ExerciseRecord[] | null
}

export type WorkoutSessionExerciseInsert = {
  exercise_id: string
  template_exercise_id?: string | null
  sort_order: number
  planned_sets?: number | null
  planned_reps?: number | null
  planned_duration_sec?: number | null
  planned_distance?: number | null
  notes?: string | null
}

export type WorkoutSetRecord = {
  id: string
  created_at: string
  session_exercise_id: string
  set_number: number
  reps: number | null
  weight: number | null
  duration_sec: number | null
  distance: number | null
  distance_unit: DistanceUnit | null
  rir: number | null
  completed: boolean
  notes: string | null
}

export type WorkoutSetInsert = {
  set_number: number
  reps?: number | null
  weight?: number | null
  duration_sec?: number | null
  distance?: number | null
  distance_unit?: DistanceUnit | null
  rir?: number | null
  completed?: boolean
  notes?: string | null
}

const EXERCISE_SELECT = `
  id,
  created_at,
  updated_at,
  name,
  slug,
  category,
  primary_muscle_group,
  secondary_muscle_groups,
  equipment,
  movement_pattern,
  logging_style,
  instructions,
  is_public,
  created_by_user_id
`

const TEMPLATE_SELECT = `
  id,
  created_at,
  updated_at,
  user_id,
  name,
  description,
  focus_tags,
  estimated_duration_min,
  is_archived
`

const TEMPLATE_EXERCISE_SELECT = `
  id,
  created_at,
  template_id,
  exercise_id,
  sort_order,
  target_sets,
  target_reps,
  target_reps_min,
  target_reps_max,
  target_weight,
  target_duration_sec,
  target_distance,
  target_distance_unit,
  target_rest_sec,
  notes,
  exercise:exercises (${EXERCISE_SELECT})
`

const SESSION_SELECT = `
  id,
  created_at,
  updated_at,
  user_id,
  template_id,
  name,
  session_date,
  started_at,
  completed_at,
  duration_sec,
  status,
  notes
`

const SESSION_EXERCISE_SELECT = `
  id,
  created_at,
  session_id,
  exercise_id,
  template_exercise_id,
  sort_order,
  planned_sets,
  planned_reps,
  planned_duration_sec,
  planned_distance,
  notes,
  exercise:exercises (${EXERCISE_SELECT})
`

const SET_SELECT = `
  id,
  created_at,
  session_exercise_id,
  set_number,
  reps,
  weight,
  duration_sec,
  distance,
  distance_unit,
  rir,
  completed,
  notes
`

function normalizePositiveNumber(value: unknown): number | null {
  if (value == null || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeStringList(value?: string[] | null) {
  return (value ?? []).map((item) => item.trim()).filter(Boolean)
}

function normalizeOptionalString(value?: string | null) {
  return value?.trim() || null
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getSession()

  if (error) throw error

  return data.session?.user ?? null
}

export async function listVisibleExercises(userId: string) {
  const [publicResult, privateResult] = await Promise.all([
    supabase
      .from("exercises")
      .select(EXERCISE_SELECT)
      .eq("is_public", true)
      .order("name", { ascending: true }),
    supabase
      .from("exercises")
      .select(EXERCISE_SELECT)
      .eq("created_by_user_id", userId)
      .order("name", { ascending: true }),
  ])

  if (publicResult.error || privateResult.error) {
    console.warn("Exercise library unavailable, continuing without it.", {
      publicError: publicResult.error?.message,
      privateError: privateResult.error?.message,
    })
    return []
  }

  const deduped = new Map<string, ExerciseRecord>()

  for (const row of publicResult.data ?? []) {
    deduped.set(row.id, row as ExerciseRecord)
  }

  for (const row of privateResult.data ?? []) {
    deduped.set(row.id, row as ExerciseRecord)
  }

  return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name))
}

export async function getVisibleExerciseById(userId: string, exerciseId: string) {
  const { data, error } = await supabase
    .from("exercises")
    .select(EXERCISE_SELECT)
    .eq("id", exerciseId)
    .or(`is_public.eq.true,created_by_user_id.eq.${userId}`)
    .maybeSingle()

  if (error) throw error
  return (data as ExerciseRecord | null) ?? null
}

export async function createExercise(userId: string, input: ExerciseInsert) {
  const { data, error } = await supabase
    .from("exercises")
    .insert({
      name: input.name.trim(),
      slug: normalizeOptionalString(input.slug),
      category: input.category,
      primary_muscle_group: normalizeOptionalString(input.primary_muscle_group),
      secondary_muscle_groups: normalizeStringList(input.secondary_muscle_groups),
      equipment: normalizeStringList(input.equipment),
      movement_pattern: normalizeOptionalString(input.movement_pattern),
      logging_style: input.logging_style,
      instructions: normalizeOptionalString(input.instructions),
      is_public: input.is_public ?? false,
      created_by_user_id: userId,
    })
    .select(EXERCISE_SELECT)
    .single()

  if (error) throw error
  return data as ExerciseRecord
}

export async function listWorkoutTemplates(userId: string) {
  const { data, error } = await supabase
    .from("workout_templates")
    .select(TEMPLATE_SELECT)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })

  if (error) throw error
  return (data ?? []) as WorkoutTemplateRecord[]
}

export async function getWorkoutTemplate(templateId: string) {
  const { data, error } = await supabase
    .from("workout_templates")
    .select(TEMPLATE_SELECT)
    .eq("id", templateId)
    .single()

  if (error) throw error
  return data as WorkoutTemplateRecord
}

export async function getWorkoutTemplateExercises(templateId: string) {
  const { data, error } = await supabase
    .from("workout_template_exercises")
    .select(TEMPLATE_EXERCISE_SELECT)
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true })

  if (error) throw error
  return (data ?? []) as WorkoutTemplateExerciseRecord[]
}

export async function createWorkoutTemplate(userId: string, input: WorkoutTemplateInsert) {
  const { data, error } = await supabase
    .from("workout_templates")
    .insert({
      user_id: userId,
      name: input.name.trim(),
      description: normalizeOptionalString(input.description),
      focus_tags: normalizeStringList(input.focus_tags),
      estimated_duration_min: normalizePositiveNumber(input.estimated_duration_min),
      is_archived: input.is_archived ?? false,
    })
    .select(TEMPLATE_SELECT)
    .single()

  if (error) throw error
  return data as WorkoutTemplateRecord
}

export async function updateWorkoutTemplate(
  templateId: string,
  userId: string,
  input: WorkoutTemplateInsert
) {
  const { data, error } = await supabase
    .from("workout_templates")
    .update({
      name: input.name.trim(),
      description: normalizeOptionalString(input.description),
      focus_tags: normalizeStringList(input.focus_tags),
      estimated_duration_min: normalizePositiveNumber(input.estimated_duration_min),
      is_archived: input.is_archived ?? false,
    })
    .eq("id", templateId)
    .eq("user_id", userId)
    .select(TEMPLATE_SELECT)
    .single()

  if (error) throw error
  return data as WorkoutTemplateRecord
}

export async function replaceWorkoutTemplateExercises(
  templateId: string,
  exercises: WorkoutTemplateExerciseInsert[]
) {
  const { error: deleteError } = await supabase
    .from("workout_template_exercises")
    .delete()
    .eq("template_id", templateId)

  if (deleteError) throw deleteError

  if (exercises.length === 0) return

  const { error: insertError } = await supabase
    .from("workout_template_exercises")
    .insert(
      exercises.map((exercise) => ({
        template_id: templateId,
        exercise_id: exercise.exercise_id,
        sort_order: exercise.sort_order,
        target_sets: normalizePositiveNumber(exercise.target_sets),
        target_reps: normalizePositiveNumber(exercise.target_reps),
        target_reps_min: normalizePositiveNumber(exercise.target_reps_min),
        target_reps_max: normalizePositiveNumber(exercise.target_reps_max),
        target_weight: normalizePositiveNumber(exercise.target_weight),
        target_duration_sec: normalizePositiveNumber(exercise.target_duration_sec),
        target_distance: normalizePositiveNumber(exercise.target_distance),
        target_distance_unit: exercise.target_distance_unit ?? null,
        target_rest_sec: normalizePositiveNumber(exercise.target_rest_sec),
        notes: normalizeOptionalString(exercise.notes),
      }))
    )

  if (insertError) throw insertError
}

export async function deleteWorkoutTemplate(templateId: string, userId: string) {
  const { error } = await supabase
    .from("workout_templates")
    .delete()
    .eq("id", templateId)
    .eq("user_id", userId)

  if (error) throw error
}

export async function listWorkoutSessions(userId: string) {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select(SESSION_SELECT)
    .eq("user_id", userId)
    .order("session_date", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) throw error
  return (data ?? []) as WorkoutSessionRecord[]
}

export async function getWorkoutSession(sessionId: string) {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select(SESSION_SELECT)
    .eq("id", sessionId)
    .single()

  if (error) throw error
  return data as WorkoutSessionRecord
}

export async function getWorkoutSessionByIdMaybe(sessionId: string) {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select(SESSION_SELECT)
    .eq("id", sessionId)
    .maybeSingle()

  if (error) throw error
  return (data as WorkoutSessionRecord | null) ?? null
}

export async function getWorkoutSessionExercises(sessionId: string) {
  const { data, error } = await supabase
    .from("workout_session_exercises")
    .select(SESSION_EXERCISE_SELECT)
    .eq("session_id", sessionId)
    .order("sort_order", { ascending: true })

  if (error) throw error
  return (data ?? []) as WorkoutSessionExerciseRecord[]
}

export async function getWorkoutSets(sessionExerciseId: string) {
  const { data, error } = await supabase
    .from("workout_sets")
    .select(SET_SELECT)
    .eq("session_exercise_id", sessionExerciseId)
    .order("set_number", { ascending: true })

  if (error) throw error
  return (data ?? []) as WorkoutSetRecord[]
}

export async function createWorkoutSession(userId: string, input: WorkoutSessionInsert) {
  const { data, error } = await supabase
    .from("workout_sessions")
    .insert({
      user_id: userId,
      template_id: input.template_id ?? null,
      name: input.name.trim(),
      session_date: input.session_date ?? undefined,
      started_at: input.started_at ?? null,
      completed_at: input.completed_at ?? null,
      duration_sec: normalizePositiveNumber(input.duration_sec),
      status: input.status ?? "in_progress",
      notes: normalizeOptionalString(input.notes),
    })
    .select(SESSION_SELECT)
    .single()

  if (error) throw error
  return data as WorkoutSessionRecord
}

export async function updateWorkoutSession(
  sessionId: string,
  userId: string,
  input: Partial<WorkoutSessionInsert>
) {
  const { data, error } = await supabase
    .from("workout_sessions")
    .update({
      template_id: input.template_id === undefined ? undefined : input.template_id,
      name: input.name === undefined ? undefined : input.name.trim(),
      session_date: input.session_date ?? undefined,
      started_at: input.started_at === undefined ? undefined : input.started_at,
      completed_at: input.completed_at === undefined ? undefined : input.completed_at,
      duration_sec:
        input.duration_sec === undefined ? undefined : normalizePositiveNumber(input.duration_sec),
      status: input.status ?? undefined,
      notes: input.notes === undefined ? undefined : normalizeOptionalString(input.notes),
    })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select(SESSION_SELECT)
    .single()

  if (error) throw error
  return data as WorkoutSessionRecord
}

export async function createWorkoutSessionExercises(
  sessionId: string,
  exercises: WorkoutSessionExerciseInsert[]
) {
  if (exercises.length === 0) return []

  const { data, error } = await supabase
    .from("workout_session_exercises")
    .insert(
      exercises.map((exercise) => ({
        session_id: sessionId,
        exercise_id: exercise.exercise_id,
        template_exercise_id: exercise.template_exercise_id ?? null,
        sort_order: exercise.sort_order,
        planned_sets: normalizePositiveNumber(exercise.planned_sets),
        planned_reps: normalizePositiveNumber(exercise.planned_reps),
        planned_duration_sec: normalizePositiveNumber(exercise.planned_duration_sec),
        planned_distance: normalizePositiveNumber(exercise.planned_distance),
        notes: normalizeOptionalString(exercise.notes),
      }))
    )
    .select(SESSION_EXERCISE_SELECT)

  if (error) throw error
  return (data ?? []) as WorkoutSessionExerciseRecord[]
}

export async function replaceWorkoutSets(
  sessionExerciseId: string,
  sets: WorkoutSetInsert[]
) {
  const { error: deleteError } = await supabase
    .from("workout_sets")
    .delete()
    .eq("session_exercise_id", sessionExerciseId)

  if (deleteError) throw deleteError

  if (sets.length === 0) return []

  const { data, error } = await supabase
    .from("workout_sets")
    .insert(
      sets.map((set) => ({
        session_exercise_id: sessionExerciseId,
        set_number: set.set_number,
        reps: normalizePositiveNumber(set.reps),
        weight: normalizePositiveNumber(set.weight),
        duration_sec: normalizePositiveNumber(set.duration_sec),
        distance: normalizePositiveNumber(set.distance),
        distance_unit: set.distance_unit ?? null,
        rir: normalizePositiveNumber(set.rir),
        completed: set.completed ?? false,
        notes: normalizeOptionalString(set.notes),
      }))
    )
    .select(SET_SELECT)
    .order("set_number", { ascending: true })

  if (error) throw error
  return (data ?? []) as WorkoutSetRecord[]
}

export async function deleteWorkoutSession(sessionId: string, userId: string) {
  const { error } = await supabase
    .from("workout_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", userId)

  if (error) throw error
}
