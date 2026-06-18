import { NextResponse } from "next/server"
import { searchFoodDataCentral } from "../../../../lib/catalog/food-data-central"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get("q")?.trim() ?? ""
  const limit = Number(searchParams.get("limit") ?? 10)

  if (!query) {
    return NextResponse.json({ error: "Missing search query." }, { status: 400 })
  }

  try {
    const foods = await searchFoodDataCentral(query, limit)
    return NextResponse.json({
      source: "usda_fdc",
      query,
      foods,
    })
  } catch (error) {
    console.error("Food catalog search failed:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Food catalog search failed.",
      },
      { status: 502 }
    )
  }
}
