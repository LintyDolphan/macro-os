import {
  compactText,
  nonNegativeNumber,
  numberOrNull,
  type NormalizedFoodCandidate,
} from "./types"

const USDA_BASE_URL = "https://api.nal.usda.gov/fdc/v1"

type FdcSearchFood = {
  fdcId: number
  description?: string
  brandOwner?: string
  brandName?: string
  dataType?: string
  foodCategory?: string
  gtinUpc?: string
  householdServingFullText?: string
  servingSize?: number
  servingSizeUnit?: string
  foodNutrients?: {
    nutrientId?: number
    nutrientName?: string
    nutrientNumber?: string
    value?: number
    unitName?: string
  }[]
}

type FdcSearchResponse = {
  foods?: FdcSearchFood[]
}

function getUsdaApiKey() {
  return process.env.USDA_FDC_API_KEY || process.env.FOODDATA_CENTRAL_API_KEY || "DEMO_KEY"
}

function nutrientValue(food: FdcSearchFood, nutrientIds: number[], nutrientNumbers: string[]) {
  const nutrient = food.foodNutrients?.find((item) => {
    if (item.nutrientId != null && nutrientIds.includes(item.nutrientId)) return true
    return item.nutrientNumber != null && nutrientNumbers.includes(String(item.nutrientNumber))
  })

  return nonNegativeNumber(nutrient?.value)
}

function normalizeFdcFood(food: FdcSearchFood): NormalizedFoodCandidate {
  const servingSize = numberOrNull(food.servingSize)
  const servingUnit = compactText(food.servingSizeUnit)
  const servingLabel =
    compactText(food.householdServingFullText) ||
    (servingSize && servingUnit ? `${servingSize}${servingUnit}` : null)

  return {
    sourceName: "usda_fdc",
    sourceId: String(food.fdcId),
    sourceUrl: `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${food.fdcId}/nutrients`,
    name: compactText(food.description) || "USDA food",
    brandName: compactText(food.brandName) || compactText(food.brandOwner),
    foodCategory: compactText(food.foodCategory) || compactText(food.dataType),
    barcode: compactText(food.gtinUpc),
    servingSizeG: servingUnit?.toLowerCase() === "g" ? servingSize : null,
    servingLabel,
    packageSize: null,
    caloriesPer100g: nutrientValue(food, [1008], ["208"]),
    proteinPer100g: nutrientValue(food, [1003], ["203"]),
    carbsPer100g: nutrientValue(food, [1005], ["205"]),
    fatPer100g: nutrientValue(food, [1004], ["204"]),
    fiberPer100g: nutrientValue(food, [1079], ["291"]),
    sugarPer100g: nutrientValue(food, [2000], ["269"]),
    sodiumMgPer100g: nutrientValue(food, [1093], ["307"]),
    dietaryTags: [],
    allergenTags: [],
    confidence: food.dataType === "Foundation" || food.dataType === "SR Legacy" ? 0.95 : 0.82,
    raw: food,
  }
}

export async function searchFoodDataCentral(query: string, limit = 10) {
  const cleanedQuery = query.trim()
  if (!cleanedQuery) return []

  const response = await fetch(`${USDA_BASE_URL}/foods/search?api_key=${getUsdaApiKey()}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query: cleanedQuery,
      pageSize: Math.min(Math.max(limit, 1), 25),
      dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"],
    }),
    next: { revalidate: 60 * 60 * 24 },
  })

  if (!response.ok) {
    throw new Error(`USDA FoodData Central lookup failed with status ${response.status}.`)
  }

  const payload = (await response.json()) as FdcSearchResponse
  return (payload.foods ?? []).map(normalizeFdcFood)
}
