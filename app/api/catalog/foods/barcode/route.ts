import { NextResponse } from "next/server"
import { lookupOpenFoodFactsBarcode } from "../../../../lib/catalog/open-food-facts"
import { normalizeBarcode } from "../../../../lib/catalog/types"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const barcode = normalizeBarcode(searchParams.get("barcode") ?? "")

  if (!barcode) {
    return NextResponse.json({ error: "Missing barcode." }, { status: 400 })
  }

  try {
    const food = await lookupOpenFoodFactsBarcode(barcode)

    if (!food) {
      return NextResponse.json(
        {
          source: "open_food_facts",
          barcode,
          food: null,
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      source: "open_food_facts",
      barcode,
      food,
    })
  } catch (error) {
    console.error("Barcode food catalog lookup failed:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Barcode food catalog lookup failed.",
      },
      { status: 502 }
    )
  }
}
