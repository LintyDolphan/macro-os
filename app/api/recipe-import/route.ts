import { NextResponse } from "next/server";
import {
  extractRecipeFromHtml,
  extractRecipeFromMirrorText,
  sourceNeedsIngredientWarning,
} from "../../lib/recipe-url-import";

async function fetchRecipeHtml(url: string) {
  return await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      pragma: "no-cache",
      referer: "https://www.google.com/",
      "upgrade-insecure-requests": "1",
    },
    cache: "no-store",
  });
}

async function fetchRecipeMirror(url: string) {
  return await fetch(`https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`, {
    headers: {
      accept: "text/plain, text/markdown;q=0.9, */*;q=0.8",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    },
    cache: "no-store",
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    const rawUrl = body.url?.trim();

    if (!rawUrl) {
      return NextResponse.json({ error: "A recipe URL is required." }, { status: 400 });
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return NextResponse.json({ error: "Enter a valid http or https URL." }, { status: 400 });
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: "Only http and https recipe URLs are supported." }, { status: 400 });
    }

    let recipe;
    const response = await fetchRecipeHtml(parsedUrl.toString());

    if (response.ok) {
      const html = await response.text();
      recipe = extractRecipeFromHtml(html, parsedUrl.toString());
    } else if ([401, 403, 406, 429].includes(response.status)) {
      const mirrorResponse = await fetchRecipeMirror(parsedUrl.toString());

      if (!mirrorResponse.ok) {
        return NextResponse.json(
          { error: `The recipe page returned ${response.status}.` },
          { status: 400 }
        );
      }

      const mirrorText = await mirrorResponse.text();
      recipe = extractRecipeFromMirrorText(mirrorText, parsedUrl.toString());
    } else {
      return NextResponse.json(
        { error: `The recipe page returned ${response.status}.` },
        { status: 400 }
      );
    }

    const warning = sourceNeedsIngredientWarning(
      parsedUrl.toString(),
      recipe.ingredients.length,
      recipe.steps.length
    )
      ? "Macro OS imported the steps from this Allrecipes page, but the ingredient list could not be extracted reliably. Please review or add ingredients manually."
      : null;

    return NextResponse.json({ recipe, warning });
  } catch (error) {
    console.error("Failed to import recipe URL:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Macro OS could not import that recipe URL.",
      },
      { status: 500 }
    );
  }
}
