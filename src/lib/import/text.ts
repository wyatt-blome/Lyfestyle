import { cleanLine } from "../ingredients/parse";
import { emptyRecipe, parseDuration, type ImportedRecipe } from "./types";

const ING_HEAD = /^(?:ingredients?|what you(?:'|’)ll need|you(?:'|’)ll need|shopping list)\s*:?$/i;
const STEP_HEAD = /^(?:instructions?|directions?|method|steps?|preparation|how to make(?: it)?|to make)\s*:?$/i;
const NOTE_HEAD = /^(?:notes?|tips?|nutrition(?: facts)?|storage)\s*:?$/i;
const STARTS_WITH_AMOUNT = /^(?:[-*•▢]\s*)?(?:\d|[½⅓⅔¼¾⅛]|(?:a|an|one|two|three|four|half)\s+(?:cup|tbsp|tsp|tablespoon|teaspoon|pinch|dash|can|lb|pound|clove|bunch|handful|package|stick)s?\b)/i;

function servingsFrom(lines: string[]): number | null {
  for (const l of lines) {
    const m = l.match(/\b(?:serves|servings|yield|yields|makes)\s*:?\s*(\d+)/i);
    if (m) return Number(m[1]);
  }
  return null;
}

function timeFrom(lines: string[], label: RegExp): number | null {
  for (const l of lines) {
    const m = l.match(label);
    if (m) return parseDuration(m[1]);
  }
  return null;
}

/**
 * Turn pasted recipe text (from a website, a note, or text copied out of a photo with Live Text)
 * into a draft recipe. Headings are used when present; otherwise lines that start with an
 * amount are ingredients and sentences are steps.
 */
export function parseRecipeText(text: string): ImportedRecipe {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return emptyRecipe();

  const title = lines[0].replace(/^#+\s*/, "").slice(0, 120);
  const rest = lines.slice(1);
  const ingredients: string[] = [];
  const steps: string[] = [];
  const descParts: string[] = [];
  let mode: "intro" | "ing" | "step" | "note" = "intro";
  const sawHeadings = rest.some((l) => ING_HEAD.test(l) || STEP_HEAD.test(l));

  for (const line of rest) {
    if (ING_HEAD.test(line)) {
      mode = "ing";
      continue;
    }
    if (STEP_HEAD.test(line)) {
      mode = "step";
      continue;
    }
    if (NOTE_HEAD.test(line)) {
      mode = "note";
      continue;
    }
    if (/^(?:serves|servings|yield|prep|cook|total|makes)\b/i.test(line)) continue;
    if (!sawHeadings) {
      if (STARTS_WITH_AMOUNT.test(line) && line.length < 120 && !/\.\s+\S/.test(line)) ingredients.push(cleanLine(line));
      else if (ingredients.length || /^\d+[.)]\s/.test(line)) steps.push(line.replace(/^\d+[.)]\s*/, ""));
      else descParts.push(line);
      continue;
    }
    if (mode === "ing") ingredients.push(cleanLine(line));
    else if (mode === "step") steps.push(line.replace(/^(?:step\s*)?\d+[.):]\s*/i, ""));
    else if (mode === "intro") descParts.push(line);
  }

  return emptyRecipe({
    title,
    description: descParts.join(" ").slice(0, 500) || null,
    servings: servingsFrom(lines),
    prepMinutes: timeFrom(lines, /prep(?:aration)?(?: time)?\s*:?\s*(.+)$/i),
    cookMinutes: timeFrom(lines, /cook(?:ing)?(?: time)?\s*:?\s*(.+)$/i),
    totalMinutes: timeFrom(lines, /total(?: time)?\s*:?\s*(.+)$/i),
    ingredients,
    steps,
  });
}
