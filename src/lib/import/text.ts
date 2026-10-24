import { tidyTitle } from "../ingredients/names";
import { cleanLine } from "../ingredients/parse";
import { emptyRecipe, parseDuration, type ImportedRecipe } from "./types";

export const ING_HEAD = /^(?:ingredients?|what you(?:'|’)ll need|you(?:'|’)ll need|shopping list)\s*:?$/i;
export const STEP_HEAD = /^(?:instructions?|directions?|method|steps?|preparation|how to make(?: it)?|to make)\s*:?$/i;
const NOTE_HEAD = /^(?:notes?|tips?|nutrition(?: facts)?|storage)\s*:?$/i;
export const STARTS_WITH_AMOUNT =
  /^(?:[-*•▢]\s*)?(?:\d|[½⅓⅔¼¾⅛]|(?:a|an|one|two|three|four|half)\s+(?:cup|tbsp|tsp|tablespoon|teaspoon|pinch|dash|can|lb|pound|clove|bunch|handful|package|stick)s?\b)/i;
const META_LINE = /^(?:serves|servings|yield|yields|prep|cook|total|makes)\b/i;

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

/** A line that carries on the one before it: text wrapped by a printed page or a photo. */
function continuesLine(prev: string, line: string): boolean {
  return /^[a-z(]/.test(line) || /[,;–-]$/.test(prev) || /\b(?:and|or|the|a|an|to|with|of|in|into|until|for|on)$/i.test(prev);
}

export interface Sections {
  description: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  ingredients: string[];
  steps: string[];
}

/**
 * Split recipe lines (everything after the title) into ingredients and steps. Headings are used
 * when present; otherwise lines that start with an amount are ingredients and sentences are steps.
 * `startIn` lets a continuation page pick up where the previous page left off.
 */
export function parseSections(lines: string[], startIn: "intro" | "ing" | "step" = "intro"): Sections {
  const ingredients: string[] = [];
  const steps: string[] = [];
  const descParts: string[] = [];
  let mode: "intro" | "ing" | "step" | "note" = startIn;
  const sawHeadings = lines.some((l) => ING_HEAD.test(l) || STEP_HEAD.test(l));

  const pushStep = (line: string) => {
    const text = line.replace(/^(?:step\s*)?\d+[.):]\s*/i, "");
    const prev = steps[steps.length - 1];
    if (prev !== undefined && !/^(?:step\s*)?\d+[.):]\s/i.test(line) && continuesLine(prev, text)) steps[steps.length - 1] = `${prev} ${text}`;
    else steps.push(text);
  };
  const pushIngredient = (line: string) => {
    const prev = ingredients[ingredients.length - 1];
    if (prev !== undefined && !STARTS_WITH_AMOUNT.test(line) && continuesLine(prev, line)) ingredients[ingredients.length - 1] = `${prev} ${line}`;
    else ingredients.push(cleanLine(line));
  };

  for (const line of lines) {
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
    if (META_LINE.test(line)) continue;
    if (!sawHeadings && mode !== "note") {
      const looksIngredient = STARTS_WITH_AMOUNT.test(line) && line.length < 120 && !/\.\s+\S/.test(line) && !/^\d+[.)]\s/.test(line);
      if (looksIngredient && mode !== "step") {
        mode = "ing";
        pushIngredient(line);
      } else if (mode === "ing" && !steps.length && continuesLine(ingredients[ingredients.length - 1] ?? "", line) && line.length < 60) {
        pushIngredient(line);
      } else if (ingredients.length || mode === "step" || /^\d+[.)]\s/.test(line)) {
        mode = "step";
        pushStep(line);
      } else descParts.push(line);
      continue;
    }
    if (mode === "ing") pushIngredient(line);
    else if (mode === "step") pushStep(line);
    else if (mode === "intro") descParts.push(line);
  }

  return {
    description: descParts.join(" ").slice(0, 500) || null,
    servings: servingsFrom(lines),
    prepMinutes: timeFrom(lines, /prep(?:aration)?(?: time)?\s*:?\s*(.+)$/i),
    cookMinutes: timeFrom(lines, /cook(?:ing)?(?: time)?\s*:?\s*(.+)$/i),
    totalMinutes: timeFrom(lines, /total(?: time)?\s*:?\s*(.+)$/i),
    ingredients,
    steps,
  };
}

export function textLines(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Turn pasted recipe text (from a website, a note, or text copied out of a photo with Live Text)
 * into a draft recipe. The first line is the name.
 */
export function parseRecipeText(text: string): ImportedRecipe {
  const lines = textLines(text);
  if (!lines.length) return emptyRecipe();
  const title = tidyTitle(lines[0].replace(/^#+\s*/, "")).slice(0, 120);
  return emptyRecipe({ title, ...parseSections(lines.slice(1)) });
}
