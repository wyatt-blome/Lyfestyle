import { ING_HEAD, parseSections, STARTS_WITH_AMOUNT, STEP_HEAD, textLines } from "./text";
import { emptyRecipe, type ImportedRecipe } from "./types";

// Photos of recipes come in as pages: one card, or a recipe spread over two or three cookbook
// pages, or a page holding two short recipes. Each page is read into "parts" (one per recipe
// it shows), each part says whether it starts a recipe or carries one on, and the parts are then
// grouped into recipes. The household can join or split the groups before saving.

export interface RecipePart {
  /** the recipe's name, when this part starts a recipe */
  title: string | null;
  /** begins mid-recipe: no title, starts with steps or a "continued" note */
  continuesFromPrevious: boolean;
  /** runs off the page: "continued", or ingredients with no steps yet */
  continuesOnNext: boolean;
  description: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  ingredients: string[];
  steps: string[];
  tags: string[];
}

export interface PagePart extends RecipePart {
  page: number;
}

const CONTINUED = /\b(?:cont(?:inued|'d|\.)|continued (?:from|on)|see (?:next|other) (?:page|side)|turn over|over\s*[→>])/i;
const PAGE_NUMBER = /^(?:page\s*)?\d{1,3}$/i;

function isTitleLike(line: string | undefined): boolean {
  if (!line) return false;
  if (line.length < 3 || line.length > 70) return false;
  if (STARTS_WITH_AMOUNT.test(line) || ING_HEAD.test(line) || STEP_HEAD.test(line)) return false;
  if (/^[a-z]/.test(line) || /[.,;:]$/.test(line) || /^\d+[.)]/.test(line)) return false;
  if (CONTINUED.test(line)) return false;
  const letters = line.replace(/[^A-Za-z]/g, "").length;
  return letters / line.length > 0.6 && line.split(/\s+/).length <= 10;
}

/** Common slips of the on-device reader: bullets read as letters, "lb" as "1b", "oz" as "0z". */
export function fixOcrLine(line: string): string {
  return line
    .replace(/^(?:[«»•·*◦°©®~›‹>|]|[eoc](?=\s+[\d½⅓⅔¼¾⅛]))\s+/, "")
    .replace(/(\d)\s*[1Il]bs?\b/g, "$1 lb")
    .replace(/\b[1Il]b(s?)\b(?=\.?\s+[a-z])/g, "lb$1")
    .replace(/(\d)\s*0z\b/gi, "$1 oz")
    .replace(/\b0z\b/gi, "oz")
    .replace(/(\d)\s*[cC]\.\s/g, "$1 cup ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanPageLines(text: string): string[] {
  return textLines(text).map(fixOcrLine).filter((l) => {
    const alnum = l.replace(/[^A-Za-z0-9½⅓⅔¼¾⅛]/g, "").length;
    return alnum >= 2 && !PAGE_NUMBER.test(l);
  });
}

/**
 * Read one page of text (from the on-device reader) into recipe parts. A second "Ingredients"
 * heading on the same page starts a second recipe.
 */
export function readPageText(text: string): RecipePart[] {
  const lines = cleanPageLines(text);
  if (!lines.length) return [];

  const heads = lines.map((l, i) => (ING_HEAD.test(l) ? i : -1)).filter((i) => i >= 0);
  const starts: number[] = [0];
  for (const h of heads.slice(1)) {
    for (let back = 1; back <= 4 && h - back > starts[starts.length - 1]; back++) {
      if (isTitleLike(lines[h - back])) {
        starts.push(h - back);
        break;
      }
    }
  }

  return starts.map((start, k) => {
    const seg = lines.slice(start, starts[k + 1] ?? lines.length);
    const firstMeaningful = seg.find((l) => !CONTINUED.test(l)) ?? "";
    const nearTop = seg.slice(0, 10);
    const hasRecipeNearTop = nearTop.some((l) => ING_HEAD.test(l) || STARTS_WITH_AMOUNT.test(l));
    const title = isTitleLike(seg[0]) && hasRecipeNearTop && !CONTINUED.test(seg[0]) ? seg[0] : null;
    const body = title ? seg.slice(1) : seg;
    const startsWithStep = /^(?:step\s*)?([2-9]|\d{2,})[.):]\s/i.test(firstMeaningful) || /^[a-z]/.test(firstMeaningful);
    // A page without a name picks up mid-recipe: in the ingredient list, or in the steps.
    const startMode = title ? "intro" : STARTS_WITH_AMOUNT.test(firstMeaningful) && !startsWithStep ? "ing" : !body.some((l) => ING_HEAD.test(l)) ? "step" : "intro";
    const sections = parseSections(body.filter((l) => !CONTINUED.test(l)), startMode);
    const last = seg[seg.length - 1] ?? "";
    const continuesFromPrevious =
      k === 0 && !title && (CONTINUED.test(seg.slice(0, 2).join(" ")) || startsWithStep || !hasRecipeNearTop || sections.ingredients.length === 0);
    const continuesOnNext =
      k === starts.length - 1 &&
      (CONTINUED.test(seg.slice(-2).join(" ")) || (sections.ingredients.length > 0 && sections.steps.length === 0) || (sections.steps.length > 0 && !/[.!?)]$/.test(last)));
    return {
      title,
      continuesFromPrevious,
      continuesOnNext,
      description: sections.description,
      servings: sections.servings,
      prepMinutes: sections.prepMinutes,
      cookMinutes: sections.cookMinutes,
      ingredients: sections.ingredients,
      steps: sections.steps,
      tags: [],
    };
  });
}

/** Where each recipe starts: true at index i means part i begins a new recipe. */
export function defaultBreaks(parts: PagePart[]): boolean[] {
  return parts.map((part, i) => {
    if (i === 0) return true;
    const prev = parts[i - 1];
    if (part.continuesFromPrevious) return false;
    // No name found but a recipe of its own: only joins a page that said it carries on.
    if (!part.title) return !prev.continuesOnNext;
    // The previous page says it carries on, and this one has no ingredients of its own.
    if (prev.continuesOnNext && part.ingredients.length === 0) return false;
    return true;
  });
}

function joinSteps(a: string[], b: string[]): string[] {
  if (!a.length || !b.length) return [...a, ...b];
  const last = a[a.length - 1];
  // A step cut off at the bottom of a page continues at the top of the next.
  if (!/[.!?)]$/.test(last) && /^[a-z]/.test(b[0])) return [...a.slice(0, -1), `${last} ${b[0]}`, ...b.slice(1)];
  return [...a, ...b];
}

export interface PageGroup {
  /** indexes into the parts list */
  parts: number[];
  /** photo numbers (0-based) the recipe was read from */
  pages: number[];
  recipe: ImportedRecipe;
}

export function buildGroups(parts: PagePart[], breaks: boolean[]): PageGroup[] {
  const groups: PageGroup[] = [];
  parts.forEach((part, i) => {
    if (breaks[i] || !groups.length) groups.push({ parts: [], pages: [], recipe: emptyRecipe() });
    const g = groups[groups.length - 1];
    g.parts.push(i);
    if (!g.pages.includes(part.page)) g.pages.push(part.page);
    const r = g.recipe;
    r.title ||= part.title ?? "";
    r.description ??= part.description;
    r.servings ??= part.servings;
    r.prepMinutes ??= part.prepMinutes;
    r.cookMinutes ??= part.cookMinutes;
    r.ingredients = [...r.ingredients, ...part.ingredients];
    r.steps = joinSteps(r.steps, part.steps);
    r.tags = [...new Set([...r.tags, ...part.tags])];
  });
  for (const g of groups) {
    if (!g.recipe.title) g.recipe.title = "Untitled recipe";
    if (g.recipe.prepMinutes || g.recipe.cookMinutes) g.recipe.totalMinutes = (g.recipe.prepMinutes ?? 0) + (g.recipe.cookMinutes ?? 0);
  }
  return groups;
}
