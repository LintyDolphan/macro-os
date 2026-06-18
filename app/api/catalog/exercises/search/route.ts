import { NextResponse } from "next/server"
import { searchApiNinjasExercises } from "../../../../lib/catalog/exercise-sources"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get("q")?.trim() ?? ""
  const limit = Number(searchParams.get("limit") ?? 10)

  if (!query) {
    return NextResponse.json({ error: "Missing search query." }, { status: 400 })
  }

  try {
    const exercises = await searchApiNinjasExercises(query, limit)
    return NextResponse.json({
      source: "api_ninjas",
      query,
      configured: Boolean(process.env.API_NINJAS_API_KEY),
      exercises,
    })
  } catch (error) {
    console.error("Exercise catalog search failed:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Exercise catalog search failed.",
      },
      { status: 502 }
    )
  }
}
