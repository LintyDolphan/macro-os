import { supabase } from "./client"

export type InventoryLocation =
  | "fridge"
  | "freezer"
  | "pantry"
  | "snacks"
  | "supplements"
  | "other"

export type InventorySuggestionSource =
  | "receipt_scan"
  | "barcode_scan"
  | "meal_log"
  | "snack_log"
  | "recipe_log"
  | "manual"

export type InventorySuggestionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "edited"
  | "applied"

export type InventoryItemRecord = {
  id: string
  created_at: string
  updated_at: string
  user_id: string
  household_id: string | null
  name: string
  normalized_name: string
  linked_ingredient_id: string | null
  location: InventoryLocation
  quantity: number
  unit: string
  min_quantity: number | null
  expiration_date: string | null
  notes: string | null
  is_low_stock: boolean
  is_archived: boolean
  last_suggested_at: string | null
}

export type InventoryEventRecord = {
  id: string
  created_at: string
  user_id: string
  inventory_item_id: string
  source_type: string
  event_type: string
  quantity_delta: number
  quantity_after: number | null
  unit: string
  source_id: string | null
  source_label: string | null
  notes: string | null
  metadata: Record<string, unknown>
}

export type InventorySuggestionRecord = {
  id: string
  created_at: string
  updated_at: string
  user_id: string
  household_id: string | null
  inventory_item_id: string | null
  linked_ingredient_id: string | null
  source_type: InventorySuggestionSource
  status: InventorySuggestionStatus
  action_type: "add" | "consume" | "adjust" | "create_item"
  proposed_name: string
  normalized_name: string
  proposed_location: InventoryLocation
  quantity_delta: number
  unit: string
  confidence: number | null
  source_id: string | null
  source_label: string | null
  reason: string | null
  notes: string | null
  metadata: Record<string, unknown>
  reviewed_at: string | null
}

export type InventoryItemInsert = {
  household_id?: string | null
  name: string
  linked_ingredient_id?: string | null
  location?: InventoryLocation
  quantity: number
  unit: string
  min_quantity?: number | null
  expiration_date?: string | null
  notes?: string | null
}

export type InventorySuggestionInsert = {
  household_id?: string | null
  inventory_item_id?: string | null
  linked_ingredient_id?: string | null
  source_type: InventorySuggestionSource
  action_type: InventorySuggestionRecord["action_type"]
  proposed_name: string
  proposed_location?: InventoryLocation
  quantity_delta: number
  unit: string
  confidence?: number | null
  source_id?: string | null
  source_label?: string | null
  reason?: string | null
  notes?: string | null
  metadata?: Record<string, unknown>
}

export type InventoryItemUpdate = {
  household_id?: string | null
  name?: string
  linked_ingredient_id?: string | null
  location?: InventoryLocation
  quantity?: number
  unit?: string
  min_quantity?: number | null
  expiration_date?: string | null
  notes?: string | null
  is_archived?: boolean
}

const INVENTORY_ITEM_SELECT = `
  id,
  created_at,
  updated_at,
  user_id,
  household_id,
  name,
  normalized_name,
  linked_ingredient_id,
  location,
  quantity,
  unit,
  min_quantity,
  expiration_date,
  notes,
  is_low_stock,
  is_archived,
  last_suggested_at
`

const INVENTORY_EVENT_SELECT = `
  id,
  created_at,
  user_id,
  inventory_item_id,
  source_type,
  event_type,
  quantity_delta,
  quantity_after,
  unit,
  source_id,
  source_label,
  notes,
  metadata
`

const INVENTORY_SUGGESTION_SELECT = `
  id,
  created_at,
  updated_at,
  user_id,
  household_id,
  inventory_item_id,
  linked_ingredient_id,
  source_type,
  status,
  action_type,
  proposed_name,
  normalized_name,
  proposed_location,
  quantity_delta,
  unit,
  confidence,
  source_id,
  source_label,
  reason,
  notes,
  metadata,
  reviewed_at
`

function normalizeOptionalString(value?: string | null) {
  return value?.trim() || null
}

function normalizeRequiredString(value: string, field: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${field} is required`)
  return trimmed
}

function normalizeNonNegativeNumber(value: unknown, field: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${field} must be 0 or greater`)
  }
  return parsed
}

function normalizeNameForInventory(value: string) {
  return value.trim().toLowerCase()
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getSession()

  if (error) throw error

  return data.session?.user ?? null
}

export async function listInventoryItems(options?: {
  location?: InventoryLocation
  includeArchived?: boolean
}) {
  let query = supabase
    .from("inventory_items")
    .select(INVENTORY_ITEM_SELECT)
    .order("updated_at", { ascending: false })

  if (!options?.includeArchived) {
    query = query.eq("is_archived", false)
  }

  if (options?.location) {
    query = query.eq("location", options.location)
  }

  const { data, error } = await query

  if (error) throw error
  return (data ?? []) as InventoryItemRecord[]
}

export async function getInventoryItem(itemId: string) {
  const { data, error } = await supabase
    .from("inventory_items")
    .select(INVENTORY_ITEM_SELECT)
    .eq("id", itemId)
    .single()

  if (error) throw error
  return data as InventoryItemRecord
}

export async function listInventoryEvents(options?: {
  itemId?: string
  limit?: number
}) {
  let query = supabase
    .from("inventory_events")
    .select(INVENTORY_EVENT_SELECT)
    .order("created_at", { ascending: false })

  if (options?.itemId) {
    query = query.eq("inventory_item_id", options.itemId)
  }

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  const { data, error } = await query

  if (error) throw error
  return (data ?? []) as InventoryEventRecord[]
}

export async function listInventorySuggestions(options?: {
  status?: InventorySuggestionStatus
  limit?: number
}) {
  let query = supabase
    .from("inventory_suggestions")
    .select(INVENTORY_SUGGESTION_SELECT)
    .order("created_at", { ascending: false })

  if (options?.status) {
    query = query.eq("status", options.status)
  }

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  const { data, error } = await query

  if (error) throw error
  return (data ?? []) as InventorySuggestionRecord[]
}

export async function createInventoryItem(userId: string, input: InventoryItemInsert) {
  const name = normalizeRequiredString(input.name, "Item name")
  const unit = normalizeRequiredString(input.unit, "Unit")
  const quantity = normalizeNonNegativeNumber(input.quantity, "Quantity")

  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      user_id: userId,
      household_id: input.household_id ?? null,
      name,
      normalized_name: normalizeNameForInventory(name),
      linked_ingredient_id: input.linked_ingredient_id ?? null,
      location: input.location ?? "pantry",
      quantity,
      unit,
      min_quantity: input.min_quantity == null ? null : normalizeNonNegativeNumber(input.min_quantity, "Low stock threshold"),
      expiration_date: input.expiration_date ?? null,
      notes: normalizeOptionalString(input.notes),
      is_low_stock:
        input.min_quantity != null
          ? quantity <= normalizeNonNegativeNumber(input.min_quantity, "Low stock threshold")
          : false,
    })
    .select(INVENTORY_ITEM_SELECT)
    .single()

  if (error) throw error
  return data as InventoryItemRecord
}

export async function updateInventoryItem(itemId: string, input: InventoryItemUpdate) {
  const current = await getInventoryItem(itemId)
  const name =
    input.name != null
      ? normalizeRequiredString(input.name, "Item name")
      : current.name
  const quantity =
    input.quantity != null
      ? normalizeNonNegativeNumber(input.quantity, "Quantity")
      : Number(current.quantity)
  const unit =
    input.unit != null
      ? normalizeRequiredString(input.unit, "Unit")
      : current.unit
  const minQuantity =
    input.min_quantity === undefined
      ? current.min_quantity
      : input.min_quantity == null
        ? null
        : normalizeNonNegativeNumber(input.min_quantity, "Low stock threshold")

  const { data, error } = await supabase
    .from("inventory_items")
    .update({
      household_id:
        input.household_id === undefined ? current.household_id : input.household_id,
      name,
      normalized_name: normalizeNameForInventory(name),
      linked_ingredient_id:
        input.linked_ingredient_id === undefined
          ? current.linked_ingredient_id
          : input.linked_ingredient_id,
      location: input.location ?? current.location,
      quantity,
      unit,
      min_quantity: minQuantity,
      expiration_date:
        input.expiration_date === undefined
          ? current.expiration_date
          : input.expiration_date,
      notes:
        input.notes === undefined ? current.notes : normalizeOptionalString(input.notes),
      is_archived:
        input.is_archived === undefined ? current.is_archived : input.is_archived,
      is_low_stock: minQuantity != null ? quantity <= Number(minQuantity) : false,
    })
    .eq("id", itemId)
    .select(INVENTORY_ITEM_SELECT)
    .single()

  if (error) throw error
  return data as InventoryItemRecord
}

export async function createInventoryEvent(userId: string, input: {
  inventory_item_id: string
  source_type: string
  event_type: string
  quantity_delta: number
  quantity_after?: number | null
  unit: string
  source_id?: string | null
  source_label?: string | null
  notes?: string | null
  metadata?: Record<string, unknown>
}) {
  const { data, error } = await supabase
    .from("inventory_events")
    .insert({
      user_id: userId,
      inventory_item_id: input.inventory_item_id,
      source_type: input.source_type,
      event_type: input.event_type,
      quantity_delta: input.quantity_delta,
      quantity_after: input.quantity_after ?? null,
      unit: normalizeRequiredString(input.unit, "Unit"),
      source_id: input.source_id ?? null,
      source_label: normalizeOptionalString(input.source_label),
      notes: normalizeOptionalString(input.notes),
      metadata: input.metadata ?? {},
    })
    .select(INVENTORY_EVENT_SELECT)
    .single()

  if (error) throw error
  return data as InventoryEventRecord
}

export async function createInventorySuggestion(userId: string, input: InventorySuggestionInsert) {
  const proposedName = normalizeRequiredString(input.proposed_name, "Suggested item name")
  const unit = normalizeRequiredString(input.unit, "Unit")

  const { data, error } = await supabase
    .from("inventory_suggestions")
    .insert({
      user_id: userId,
      household_id: input.household_id ?? null,
      inventory_item_id: input.inventory_item_id ?? null,
      linked_ingredient_id: input.linked_ingredient_id ?? null,
      source_type: input.source_type,
      action_type: input.action_type,
      proposed_name: proposedName,
      normalized_name: normalizeNameForInventory(proposedName),
      proposed_location: input.proposed_location ?? "pantry",
      quantity_delta: Number(input.quantity_delta),
      unit,
      confidence: input.confidence ?? null,
      source_id: input.source_id ?? null,
      source_label: normalizeOptionalString(input.source_label),
      reason: normalizeOptionalString(input.reason),
      notes: normalizeOptionalString(input.notes),
      metadata: input.metadata ?? {},
    })
    .select(INVENTORY_SUGGESTION_SELECT)
    .single()

  if (error) throw error
  return data as InventorySuggestionRecord
}

export async function updateInventorySuggestionStatus(
  suggestionId: string,
  status: InventorySuggestionStatus
) {
  const { data, error } = await supabase
    .from("inventory_suggestions")
    .update({
      status,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", suggestionId)
    .select(INVENTORY_SUGGESTION_SELECT)
    .single()

  if (error) throw error
  return data as InventorySuggestionRecord
}

export async function applyInventorySuggestion(userId: string, suggestion: InventorySuggestionRecord) {
  let item = suggestion.inventory_item_id
    ? await getInventoryItem(suggestion.inventory_item_id)
    : null

  if (!item) {
    item = await createInventoryItem(userId, {
      household_id: suggestion.household_id,
      name: suggestion.proposed_name,
      linked_ingredient_id: suggestion.linked_ingredient_id,
      location: suggestion.proposed_location,
      quantity: suggestion.action_type === "consume" ? 0 : Math.max(0, Number(suggestion.quantity_delta)),
      unit: suggestion.unit,
      notes: suggestion.notes,
    })
  }

  const currentQuantity = Number(item.quantity)
  const nextQuantity =
    suggestion.action_type === "consume"
      ? Math.max(0, currentQuantity - Math.abs(Number(suggestion.quantity_delta)))
      : suggestion.action_type === "adjust"
        ? Math.max(0, currentQuantity + Number(suggestion.quantity_delta))
        : Math.max(0, currentQuantity + Number(suggestion.quantity_delta))

  const { data: updatedItem, error: updateError } = await supabase
    .from("inventory_items")
    .update({
      quantity: nextQuantity,
      is_low_stock:
        item.min_quantity != null ? nextQuantity <= Number(item.min_quantity) : false,
      last_suggested_at: new Date().toISOString(),
    })
    .eq("id", item.id)
    .select(INVENTORY_ITEM_SELECT)
    .single()

  if (updateError) throw updateError

  await createInventoryEvent(userId, {
    inventory_item_id: item.id,
    source_type: suggestion.source_type,
    event_type:
      suggestion.action_type === "consume"
        ? "consume"
        : suggestion.action_type === "create_item"
          ? "add"
          : suggestion.action_type,
    quantity_delta:
      suggestion.action_type === "consume"
        ? -Math.abs(Number(suggestion.quantity_delta))
        : Number(suggestion.quantity_delta),
    quantity_after: nextQuantity,
    unit: suggestion.unit,
    source_id: suggestion.source_id,
    source_label: suggestion.source_label,
    notes: suggestion.reason ?? suggestion.notes,
    metadata: suggestion.metadata,
  })

  const { data: updatedSuggestion, error: suggestionError } = await supabase
    .from("inventory_suggestions")
    .update({
      inventory_item_id: item.id,
      status: "applied",
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", suggestion.id)
    .select(INVENTORY_SUGGESTION_SELECT)
    .single()

  if (suggestionError) throw suggestionError

  return {
    item: updatedItem as InventoryItemRecord,
    suggestion: updatedSuggestion as InventorySuggestionRecord,
  }
}

export async function adjustInventoryItemQuantity(userId: string, input: {
  itemId: string
  delta: number
  sourceLabel?: string | null
  notes?: string | null
}) {
  const item = await getInventoryItem(input.itemId)
  const delta = Number(input.delta)

  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error("Adjustment amount must be greater than 0")
  }

  const currentQuantity = Number(item.quantity)
  const nextQuantity = Math.max(0, currentQuantity + delta)

  const { data, error } = await supabase
    .from("inventory_items")
    .update({
      quantity: nextQuantity,
      is_low_stock:
        item.min_quantity != null ? nextQuantity <= Number(item.min_quantity) : false,
    })
    .eq("id", item.id)
    .select(INVENTORY_ITEM_SELECT)
    .single()

  if (error) throw error

  await createInventoryEvent(userId, {
    inventory_item_id: item.id,
    source_type: "manual",
    event_type: delta > 0 ? "add" : "consume",
    quantity_delta: delta,
    quantity_after: nextQuantity,
    unit: item.unit,
    source_label: input.sourceLabel ?? "Manual adjustment",
    notes: input.notes,
    metadata: {},
  })

  return data as InventoryItemRecord
}
