export type ImportedRecipeDraft = {
  sourceUrl: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  servings: number | null;
  ingredients: string[];
  steps: string[];
  prepTime: string | null;
  cookTime: string | null;
  totalTime: string | null;
};

export function sourceNeedsIngredientWarning(sourceUrl: string, ingredientCount: number, stepCount: number) {
  try {
    const url = new URL(sourceUrl);
    const hostname = url.hostname.replace(/^www\./, "");
    return hostname.includes("allrecipes.com") && ingredientCount === 0 && stepCount > 0;
  } catch {
    return false;
  }
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type RecipeNode = Record<string, JsonValue>;

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function cleanText(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = decodeHtmlEntities(stripHtml(value));
  return cleaned || null;
}

function normalizeStringList(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    const cleaned = cleanText(value);
    return cleaned ? [cleaned] : [];
  }
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizeStringList(item))
      .filter((item, index, items) => items.indexOf(item) === index);
  }
  return [];
}

function normalizeImage(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const image = normalizeImage(item);
      if (image) return image;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const maybeUrl = (value as { url?: unknown }).url;
    return typeof maybeUrl === "string" ? maybeUrl : null;
  }
  return null;
}

function parseRecipeYield(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const match = value.match(/\d+(?:\.\d+)?/);
    if (match) {
      const parsed = Number(match[0]);
      return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = parseRecipeYield(item);
      if (parsed) return parsed;
    }
  }

  return null;
}

function flattenInstructionValue(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    const cleaned = cleanText(value);
    return cleaned ? [cleaned] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenInstructionValue(item));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (typeof record.text === "string") {
      const cleaned = cleanText(record.text);
      return cleaned ? [cleaned] : [];
    }

    if (record.itemListElement) {
      return flattenInstructionValue(record.itemListElement);
    }
  }
  return [];
}

function findRecipeNodes(value: JsonValue): RecipeNode[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => findRecipeNodes(item));
  }

  if (typeof value === "object") {
    const record = value as RecipeNode;
    const typeValue = record["@type"];
    const typeList = Array.isArray(typeValue) ? typeValue : [typeValue];
    const hasRecipeType = typeList.some(
      (item) => typeof item === "string" && item.toLowerCase() === "recipe"
    );

    const nested = [
      ...findRecipeNodes(record["@graph"] as JsonValue),
      ...findRecipeNodes(record.mainEntity as JsonValue),
      ...findRecipeNodes(record.hasPart as JsonValue),
    ];

    return hasRecipeType ? [record, ...nested] : nested;
  }

  return [];
}

function parseJsonLdBlocks(html: string): JsonValue[] {
  const matches = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  const parsed: JsonValue[] = [];

  for (const match of matches) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    try {
      parsed.push(JSON.parse(raw) as JsonValue);
    } catch {
      try {
        const sanitized = raw
          .replace(/[\u0000-\u001F]+/g, " ")
          .replace(/,\s*([}\]])/g, "$1");
        parsed.push(JSON.parse(sanitized) as JsonValue);
      } catch {
        continue;
      }
    }
  }

  return parsed;
}

function parseMetaContent(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1].trim());
  }

  return null;
}

function extractBestRecipeNode(html: string): RecipeNode | null {
  const blocks = parseJsonLdBlocks(html);
  const nodes = blocks.flatMap((block) => findRecipeNodes(block));

  if (nodes.length === 0) return null;

  return nodes.sort((a, b) => {
    const aScore =
      normalizeStringList(a.recipeIngredient).length * 3 +
      flattenInstructionValue(a.recipeInstructions).length * 2 +
      (cleanText(a.name)?.length ?? 0);
    const bScore =
      normalizeStringList(b.recipeIngredient).length * 3 +
      flattenInstructionValue(b.recipeInstructions).length * 2 +
      (cleanText(b.name)?.length ?? 0);
    return bScore - aScore;
  })[0];
}

export function extractRecipeFromHtml(html: string, sourceUrl: string): ImportedRecipeDraft {
  const recipeNode = extractBestRecipeNode(html);

  if (!recipeNode) {
    throw new Error(
      "This page does not expose recipe data in a format Macro OS can import yet."
    );
  }

  const title =
    cleanText(recipeNode.name) ??
    parseMetaContent(html, "og:title") ??
    parseMetaContent(html, "twitter:title");

  if (!title) {
    throw new Error("Recipe title could not be read from this page.");
  }

  const ingredients = normalizeStringList(recipeNode.recipeIngredient);
  const steps = flattenInstructionValue(recipeNode.recipeInstructions);

  if (ingredients.length === 0 && steps.length === 0) {
    throw new Error("This page was found, but its ingredient and step data could not be parsed.");
  }

  return {
    sourceUrl,
    title,
    description:
      cleanText(recipeNode.description) ??
      parseMetaContent(html, "og:description") ??
      parseMetaContent(html, "description"),
    imageUrl: normalizeImage(recipeNode.image) ?? parseMetaContent(html, "og:image"),
    servings: parseRecipeYield(recipeNode.recipeYield),
    ingredients,
    steps,
    prepTime: cleanText(recipeNode.prepTime),
    cookTime: cleanText(recipeNode.cookTime),
    totalTime: cleanText(recipeNode.totalTime),
  };
}

function splitMirrorLines(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripMirrorListPrefix(line: string) {
  if (/^[-*]\s+/.test(line)) return line.replace(/^[-*]\s+/, "").trim();
  if (/^\d+\.\s+/.test(line)) return line.replace(/^\d+\.\s+/, "").trim();
  return line.trim();
}

function isMirrorNavigationLine(line: string) {
  const normalized = stripMirrorListPrefix(line);

  if (/^\[[^\]]+\]\(https?:\/\/[^)]+\)$/.test(normalized)) return true;
  if (/\b(photo|video|watch|follow|facebook|instagram|pinterest|tiktok)\b/i.test(normalized)) {
    return true;
  }
  if (
    /\b(main dishes|one-pot meals|quick & easy|family dinners|soups, stews & chili|comfort food|sheet pan dinners|view all)\b/i.test(
      normalized
    )
  ) {
    return true;
  }
  if (
    /\b(allrecipes|dotdash meredith|newsletter|magazine|subscribe|login|log in|sign up)\b/i.test(
      normalized
    )
  ) {
    return true;
  }

  return false;
}

function looksLikeIngredientLine(line: string) {
  const normalized = stripMirrorListPrefix(line);
  if (!normalized) return false;
  if (isMirrorNavigationLine(normalized)) return false;
  if (/^[A-Z][A-Za-z\s/&-]+:$/.test(normalized)) return false;
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return false;
  if (/^\d+\s*(?:mins?|minutes?|hrs?|hours?)$/i.test(normalized)) return false;
  if (/^\d+\s*(?:reviews?|photos?)$/i.test(normalized)) return false;
  if (/^\d+(?:\.\d+)?\s*stars?$/i.test(normalized)) return false;
  if (
    /\b(mix|return|bring|place|add|heat|stir|cook|cover|refrigerate|marinate|simmer|boil|fry|bake|whisk|pour|serve|remove|combine)\b/i.test(
      normalized
    )
  ) {
    return false;
  }
  if (
    /\b(this website uses|tracking technologies|privacy choices|advertisement|advertising)\b/i.test(
      normalized
    )
  ) {
    return false;
  }
  if (/^\d+\/\d+x$/i.test(normalized)) return false;

  if (
    /^(\d+(?:\.\d+)?|\d+\/\d+|\d+\s+\d+\/\d+|pinch|dash|salt|pepper)\b/i.test(normalized)
  ) {
    return true;
  }

  return /\b(cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|ounce|ounces|oz|pound|pounds|lb|lbs|gram|grams|g|kg|clove|cloves|slice|slices|can|cans|package|packages)\b/i.test(
    normalized
  );
}

function looksLikeStepLine(line: string) {
  const normalized = stripMirrorListPrefix(line);
  if (!normalized) return false;
  if (isMirrorNavigationLine(normalized)) return false;
  if (/^[A-Z][A-Za-z\s/&-]+:$/.test(normalized)) return false;
  if (normalized.length < 20) return false;
  if (/^\[[^\]]+\]\(https?:\/\/[^)]+\)$/.test(normalized)) return false;
  return /[a-z]/i.test(normalized) && /\b(add|cook|heat|stir|mix|combine|place|whisk|bring|serve|remove|pour|bake|fry|boil|simmer|season)\b/i.test(normalized);
}

function normalizeMirrorHeading(line: string) {
  return line
    .replace(/^#+\s*/, "")
    .replace(/[:\-\s]+$/, "")
    .trim()
    .toLowerCase();
}

function lineLooksLikeHeading(line: string, headingNames: string[]) {
  const normalized = normalizeMirrorHeading(line);
  return headingNames.some(
    (heading) =>
      normalized === heading ||
      normalized.startsWith(`${heading} `) ||
      normalized.includes(` ${heading}`) ||
      normalized.includes(heading)
  );
}

function parseMirrorSections(lines: string[], headingNames: string[], stopHeadings: string[]) {
  const collected: string[] = [];
  let active = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (lineLooksLikeHeading(line, headingNames)) {
      active = true;
      continue;
    }

    if (!active) continue;

    if (
      /^#{1,6}\s+/.test(line) ||
      lineLooksLikeHeading(line, stopHeadings) ||
      /^(nutrition|nutrition facts|recipe summary|tips|notes|footnotes|reviews?)[:\s-]*$/i.test(
        line
      )
    ) {
      active = false;
      continue;
    }
    if (isMirrorNavigationLine(line)) {
      continue;
    }
    if (/^[A-Z][A-Za-z\s/&-]+:$/.test(stripMirrorListPrefix(line))) {
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      collected.push(line.replace(/^[-*]\s+/, "").trim());
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      collected.push(line.replace(/^\d+\.\s+/, "").trim());
      continue;
    }
    collected.push(line);
  }

  return collected.filter(Boolean);
}

function findMirrorHeadingIndex(lines: string[], headingNames: string[]) {
  return lines.findIndex((line) => lineLooksLikeHeading(line, headingNames));
}

function collectIngredientFallback(lines: string[]) {
  const stepHeadingIndex = findMirrorHeadingIndex(lines, [
    "directions",
    "steps",
    "method",
    "instructions",
    "preparation",
  ]);

  const upperBound = stepHeadingIndex >= 0 ? stepHeadingIndex : lines.length;
  const candidates = lines.slice(0, upperBound).filter((line) => {
    const normalized = stripMirrorListPrefix(line);
    if (!normalized) return false;
    if (isMirrorNavigationLine(normalized)) return false;
    if (/^#\s+/.test(normalized)) return false;
    if (lineLooksLikeHeading(normalized, ["ingredients", "what you'll need", "ingredient list"])) {
      return false;
    }
    return looksLikeIngredientLine(normalized);
  });

  return candidates.filter((line, index, items) => items.indexOf(line) === index);
}

export function extractRecipeFromMirrorText(markdown: string, sourceUrl: string): ImportedRecipeDraft {
  const lines = splitMirrorLines(markdown);

  const title =
    lines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, "").trim() ??
    lines.find((line) => line.length > 10) ??
    "Imported Recipe";

  let ingredients = parseMirrorSections(
    lines,
    ["ingredients", "what you'll need", "ingredient list", "for the sauce", "for the pork", "for the vegetables"],
    ["directions", "steps", "method", "instructions", "preparation"]
  );
  let steps = parseMirrorSections(
    lines,
    ["directions", "steps", "method", "instructions", "preparation"],
    ["nutrition", "nutrition facts", "notes", "footnotes", "tips", "recipe summary"]
  );

  ingredients = ingredients.filter(looksLikeIngredientLine);
  steps = steps.filter(looksLikeStepLine);

  if (ingredients.length === 0) {
    ingredients = collectIngredientFallback(lines);
  }

  if (ingredients.length === 0 && steps.length === 0) {
    throw new Error("Macro OS could not extract recipe ingredients or steps from the fallback reader.");
  }

  const servingsLine = lines.find((line) => /^(yield|servings?)\b/i.test(line));
  const servings = servingsLine ? parseRecipeYield(servingsLine) : null;

  return {
    sourceUrl,
    title,
    description: null,
    imageUrl: null,
    servings,
    ingredients,
    steps,
    prepTime: null,
    cookTime: null,
    totalTime: null,
  };
}
