import { cleanText, emptyRecipe, parseDuration, parseYield, type ImportedRecipe } from "./types";

type Json = unknown;

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function isRecipeNode(node: Json): node is Record<string, Json> {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  const t = (node as Record<string, Json>)["@type"];
  return asArray(t).some((x) => typeof x === "string" && x.toLowerCase().endsWith("recipe"));
}

function findRecipe(node: Json, depth = 0): Record<string, Json> | null {
  if (depth > 8 || !node || typeof node !== "object") return null;
  if (isRecipeNode(node)) return node;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findRecipe(n, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  const obj = node as Record<string, Json>;
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "item", "about"]) {
    const hit = findRecipe(obj[key], depth + 1);
    if (hit) return hit;
  }
  return null;
}

function parseJsonLoose(text: string): Json {
  const trimmed = text.trim().replace(/^<!--|-->$/g, "").replace(/^\/\*<!\[CDATA\[\*\/|\/\*\]\]>\*\/$/g, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    // Some sites put raw newlines or tabs inside strings.
    try {
      return JSON.parse(trimmed.replace(/[\u0000-\u001f]+/g, " "));
    } catch {
      return null;
    }
  }
}

function imageOf(v: Json): string | null {
  for (const x of asArray(v as Json)) {
    if (typeof x === "string" && /^https?:/i.test(x)) return x;
    if (x && typeof x === "object") {
      const o = x as Record<string, Json>;
      const u = o.url ?? o.contentUrl ?? o["@id"];
      if (typeof u === "string" && /^https?:/i.test(u)) return u;
    }
  }
  return null;
}

function instructionsOf(v: Json, out: string[] = [], depth = 0): string[] {
  if (depth > 5) return out;
  if (typeof v === "string") {
    const text = cleanText(v);
    // A single blob: split numbered steps or lines.
    const parts = text.split(/\n+|(?:^|\s)(?=\d{1,2}[.)]\s+[A-Z])/).map((s) => s.replace(/^\d{1,2}[.)]\s+/, "").trim());
    out.push(...parts.filter(Boolean));
    return out;
  }
  for (const item of asArray(v)) {
    if (typeof item === "string") {
      instructionsOf(item, out, depth + 1);
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, Json>;
    const type = asArray(o["@type"]).join(" ");
    if (/HowToSection/i.test(type) || o.itemListElement) {
      const name = cleanText(o.name);
      if (name) out.push(`${name}:`);
      instructionsOf(o.itemListElement, out, depth + 1);
    } else {
      const text = cleanText(o.text ?? o.name ?? o.description);
      if (text) out.push(text);
    }
  }
  return out;
}

function tagsOf(r: Record<string, Json>): string[] {
  const raw: string[] = [];
  for (const key of ["recipeCategory", "recipeCuisine", "keywords", "suitableForDiet"]) {
    for (const v of asArray(r[key])) {
      if (typeof v === "string") raw.push(...v.split(","));
    }
  }
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const t of raw) {
    const tag = cleanText(t)
      .replace(/https?:\/\/schema\.org\//i, "")
      .replace(/Diet$/, "")
      .trim()
      .toLowerCase();
    if (!tag || tag.length > 30 || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags.slice(0, 12);
}

function recipeFromNode(r: Record<string, Json>, url: string | null): ImportedRecipe {
  const ingredients = asArray(r.recipeIngredient ?? r.ingredients)
    .map((x) => cleanText(typeof x === "string" ? x : (x as Record<string, Json>)?.text))
    .flatMap((x) => x.split("\n"))
    .map((x) => x.trim())
    .filter(Boolean);
  return emptyRecipe({
    title: cleanText(r.name ?? r.headline) || "Untitled recipe",
    description: cleanText(r.description) || null,
    imageUrl: imageOf(r.image ?? r.thumbnailUrl),
    sourceUrl: url,
    servings: parseYield(r.recipeYield ?? r.yield),
    prepMinutes: parseDuration(r.prepTime),
    cookMinutes: parseDuration(r.cookTime),
    totalMinutes: parseDuration(r.totalTime) ?? sumOrNull(parseDuration(r.prepTime), parseDuration(r.cookTime)),
    ingredients,
    steps: instructionsOf(r.recipeInstructions),
    tags: tagsOf(r),
  });
}

function sumOrNull(a: number | null, b: number | null): number | null {
  return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
}

export function ldJsonBlocks(html: string): Json[] {
  const blocks: Json[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const parsed = parseJsonLoose(m[1]);
    if (parsed !== null) blocks.push(parsed);
  }
  return blocks;
}

export function metaContent(html: string, names: string[]): string | null {
  for (const name of names) {
    const esc = name.replace(/[.*+?^${}()|[\]\\:]/g, "\\$&");
    const a = html.match(new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${esc}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, "i"));
    if (a) return cleanText(a[1]);
    const b = html.match(new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${esc}["']`, "i"));
    if (b) return cleanText(b[1]);
  }
  return null;
}

/** Microdata fallback for older recipe plugins: itemprop="recipeIngredient". */
function microdata(html: string, url: string | null): ImportedRecipe | null {
  const grab = (prop: string) => {
    const out: string[] = [];
    const re = new RegExp(`<(\\w+)[^>]*itemprop\\s*=\\s*["']${prop}["'][^>]*>([\\s\\S]*?)<\\/\\1>`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const t = cleanText(m[2]);
      if (t) out.push(t);
    }
    return out;
  };
  const ingredients = [...grab("recipeIngredient"), ...grab("ingredients")];
  if (!ingredients.length) return null;
  const title = grab("name")[0] ?? metaContent(html, ["og:title"]) ?? "Untitled recipe";
  return emptyRecipe({
    title,
    sourceUrl: url,
    imageUrl: metaContent(html, ["og:image"]),
    description: metaContent(html, ["og:description", "description"]),
    ingredients,
    steps: grab("recipeInstructions").flatMap((s) => s.split("\n")).filter(Boolean),
  });
}

/** Pull a schema.org Recipe out of a web page; null when the page has none. */
export function extractRecipeFromHtml(html: string, url: string | null): ImportedRecipe | null {
  for (const block of ldJsonBlocks(html)) {
    const node = findRecipe(block);
    if (node) {
      const recipe = recipeFromNode(node, url);
      if (!recipe.imageUrl) recipe.imageUrl = metaContent(html, ["og:image"]);
      if (recipe.ingredients.length) return recipe;
    }
  }
  return microdata(html, url);
}

/** Title, description and image from Open Graph tags, for pages without recipe data. */
export function pageSummary(html: string): { title: string | null; description: string | null; imageUrl: string | null } {
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return {
    title: metaContent(html, ["og:title", "twitter:title"]) ?? (titleTag ? cleanText(titleTag[1]) : null),
    description: metaContent(html, ["og:description", "description", "twitter:description"]),
    imageUrl: metaContent(html, ["og:image", "og:image:url", "twitter:image"]),
  };
}
