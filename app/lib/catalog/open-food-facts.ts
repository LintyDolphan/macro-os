import {
  compactText,
  nonNegativeNumber,
  normalizeBarcode,
  numberOrNull,
  type NormalizedFoodCandidate,
} from "./types"

const OPEN_FOOD_FACTS_BASE_URL = "https://world.openfoodfacts.org"

type OpenFoodFactsProduct = {
  code?: string
  product_name?: string
  generic_name?: string
  brands?: string
  categories?: string
  quantity?: string
  serving_size?: string
  serving_quantity?: number | string
  allergens_tags?: string[]
  labels_tags?: string[]
  image_url?: string
  nutriments?: Record<string, unknown>
}

type OpenFoodFactsProductResponse = {
  status?: number
  code?: string
  product?: OpenFoodFactsProduct
}

function normalizeTags(tags?: string[]) {
  return (tags ?? [])
    .map((tag) => tag.replace(/^[a-z]{2}:/, "").replace(/-/g, " ").trim())
    .filter(Boolean)
}

function nutrimentPer100g(product: OpenFoodFactsProduct, key: string) {
  return nonNegativeNumber(product.nutriments?.[`${key}_100g`])
}

function normalizeOpenFoodFactsProduct(
  product: OpenFoodFactsProduct,
  barcode: string
): NormalizedFoodCandidate {
  const dietaryTags = normalizeTags(product.labels_tags).filter((tag) =>
    ["vegan", "vegetarian", "gluten free", "dairy free", "organic"].includes(tag)
  )

  return {
    sourceName: "open_food_facts",
    sourceId: normalizeBarcode(product.code || barcode),
    sourceUrl: `${OPEN_FOOD_FACTS_BASE_URL}/product/${normalizeBarcode(product.code || barcode)}`,
    name:
      compactText(product.product_name) ||
      compactText(product.generic_name) ||
      `Barcode ${normalizeBarcode(barcode)}`,
    brandName: compactText(product.brands),
    foodCategory: compactText(product.categories?.split(",")[0]),
    barcode: normalizeBarcode(product.code || barcode),
    servingSizeG: numberOrNull(product.serving_quantity),
    servingLabel: compactText(product.serving_size),
    packageSize: compactText(product.quantity),
    caloriesPer100g: nutrimentPer100g(product, "energy-kcal"),
    proteinPer100g: nutrimentPer100g(product, "proteins"),
    carbsPer100g: nutrimentPer100g(product, "carbohydrates"),
    fatPer100g: nutrimentPer100g(product, "fat"),
    fiberPer100g: nutrimentPer100g(product, "fiber"),
    sugarPer100g: nutrimentPer100g(product, "sugars"),
    sodiumMgPer100g: nutrimentPer100g(product, "sodium") * 1000,
    dietaryTags,
    allergenTags: normalizeTags(product.allergens_tags),
    confidence: 0.72,
    raw: product,
  }
}

export async function lookupOpenFoodFactsBarcode(barcode: string) {
  const normalizedBarcode = normalizeBarcode(barcode)
  if (!normalizedBarcode) return null

  const response = await fetch(
    `${OPEN_FOOD_FACTS_BASE_URL}/api/v2/product/${normalizedBarcode}.json`,
    {
      headers: {
        "user-agent": "Macro OS - local development catalog lookup",
      },
      next: { revalidate: 60 * 60 * 24 },
    }
  )

  if (!response.ok) {
    throw new Error(`Open Food Facts lookup failed with status ${response.status}.`)
  }

  const payload = (await response.json()) as OpenFoodFactsProductResponse
  if (payload.status !== 1 || !payload.product) return null

  return normalizeOpenFoodFactsProduct(payload.product, normalizedBarcode)
}
