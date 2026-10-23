import { lookupUnit, UNIT_ALIASES_BY_LENGTH } from "./units";

export interface ParsedIngredient {
  raw: string;
  quantity: number | null;
  quantityMax: number | null;
  unit: string | null;
  /** "1 (14.5 oz) can" → size {14.5, "oz"} with unit "can" */
  size: { amount: number; unit: string } | null;
  name: string;
  note: string | null;
  optional: boolean;
}

const UNICODE_FRACTIONS: Record<string, string> = {
  "½": "1/2",
  "⅓": "1/3",
  "⅔": "2/3",
  "¼": "1/4",
  "¾": "3/4",
  "⅕": "1/5",
  "⅖": "2/5",
  "⅗": "3/5",
  "⅘": "4/5",
  "⅙": "1/6",
  "⅚": "5/6",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
};

const WORD_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  dozen: 12,
  half: 0.5,
};

const SIZE_WORDS = new Set([
  "large",
  "medium",
  "small",
  "extra-large",
  "xl",
  "jumbo",
  "heaping",
  "heaped",
  "level",
  "scant",
  "generous",
  "rounded",
  "big",
  "good",
  "whole",
]);

const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+)`;
const QTY_RE = new RegExp(String.raw`^(${NUM})(?:\s*(?:-|–|—|to|or)\s*(${NUM}))?`);
const SIZE_PAREN_RE = new RegExp(String.raw`^\(\s*(${NUM})\s*-?\s*([a-zA-Z. ]+?)\s*\)`);
const SIZE_HYPHEN_RE = new RegExp(String.raw`^(${NUM})\s*-?\s*(ounce|ounces|oz\.?|lb\.?|pound|g|gram|grams|ml|fl\.? ?oz\.?)\b`, "i");

export function toNumber(s: string): number {
  s = s.trim();
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[2]) === 0 ? NaN : Number(frac[1]) / Number(frac[2]);
  return Number(s);
}

/** Bullets, checkboxes and unicode fractions out; "1½" → "1 1/2". */
export function cleanLine(line: string): string {
  let s = line.replace(/[   ]/g, " ");
  s = s.replace(/^\s*(?:[-*•·▪▢☐□✓✔]|\d+[.)]\s+(?=\D))\s*/, "");
  s = s.replace(/(\d)([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, "$1 $2");
  s = s.replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (c) => UNICODE_FRACTIONS[c]);
  s = s.replace(/(\d)\s*⁄\s*(\d)/g, "$1/$2");
  s = s.replace(/(\d)-(\d+\/\d+)/g, "$1 $2"); // "1-1/2 cups"
  return s.replace(/\s+/g, " ").trim();
}

/** "For the sauce:" or "SAUCE" style lines inside an ingredient list. */
export function isSectionHeader(line: string): string | null {
  const s = cleanLine(line);
  if (!s || /\d/.test(s)) return null;
  const m = s.match(/^(?:for (?:the )?)?(.{2,40}?):$/i);
  if (m) return m[1].trim();
  if (/^for (?:the )?[a-z ]{2,30}$/i.test(s)) return s.replace(/^for (?:the )?/i, "").trim();
  return null;
}

function takeUnit(s: string): { unit: string; rest: string } | null {
  const firstToken = s.split(/[\s,]/)[0];
  if (firstToken === "T" || firstToken === "t" || firstToken === "Tbs" || firstToken === "Tb") {
    return { unit: lookupUnit(firstToken)!, rest: s.slice(firstToken.length).trim() };
  }
  const lower = s.toLowerCase();
  for (const alias of UNIT_ALIASES_BY_LENGTH) {
    if (!lower.startsWith(alias)) continue;
    const next = lower.charAt(alias.length);
    if (next && !/[\s,.;)]/.test(next)) continue;
    // "c" and "g" are only units when something follows; "l" needs care too.
    const unit = lookupUnit(alias);
    if (!unit) continue;
    let rest = s.slice(alias.length);
    if (rest.startsWith(".")) rest = rest.slice(1);
    return { unit, rest: rest.trim() };
  }
  return null;
}

const NOTE_PHRASES = [
  /\bto taste\b/i,
  /\bfor (?:garnish|serving|topping|dusting|greasing|frying|the pan)\b/i,
  /\b(?:plus|and) (?:more|extra)\b.*$/i,
  /\bor more\b.*$/i,
  /\bdivided\b/i,
  /\bas needed\b/i,
  /\bif desired\b/i,
  /\(?optional\)?/i,
];

function splitNameNote(s: string): { name: string; note: string | null; optional: boolean } {
  const notes: string[] = [];
  const optional = /\boptional\b/i.test(s);
  let name = s.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    if (inner.trim()) notes.push(inner.trim());
    return " ";
  });
  const comma = name.indexOf(",");
  if (comma >= 0) {
    const after = name.slice(comma + 1).trim();
    if (after) notes.unshift(after);
    name = name.slice(0, comma);
  }
  // " - finely chopped" style separators
  const dash = name.match(/\s[-–—]\s(.+)$/);
  if (dash) {
    notes.unshift(dash[1].trim());
    name = name.slice(0, dash.index);
  }
  for (const re of NOTE_PHRASES) {
    const m = name.match(re);
    if (m) {
      notes.push(m[0].replace(/[()]/g, "").trim());
      name = name.replace(re, " ");
    }
  }
  name = name.replace(/^of\s+/i, "").replace(/\s+/g, " ").replace(/[\s,;:.]+$/, "").trim();
  const note = notes.filter(Boolean).join(", ") || null;
  return { name, note, optional };
}

export function parseIngredientLine(line: string): ParsedIngredient {
  const raw = line.trim();
  let s = cleanLine(raw);
  // "Juice of 1 lemon", "zest and juice of 2 limes" → "1 lemon, juiced"
  const juice = s.match(/^(juice|zest|zest and juice|juice and zest)\s+(?:from|of)\s+(?:the\s+)?(.+)$/i);
  if (juice) s = `${juice[2]}, ${juice[1].toLowerCase().replace("juice", "juiced").replace("zest", "zested")}`;
  let quantity: number | null = null;
  let quantityMax: number | null = null;
  let unit: string | null = null;
  let size: ParsedIngredient["size"] = null;

  const q = s.match(QTY_RE);
  if (q) {
    quantity = toNumber(q[1]);
    quantityMax = q[2] ? toNumber(q[2]) : null;
    s = s.slice(q[0].length).trim();
    // "1 1/2" can be read as a range when written "1 - 2"; we keep the lower bound as quantity.
  } else {
    const w = s.match(/^([a-zA-Z]+)\s+/);
    if (w && WORD_NUMBERS[w[1].toLowerCase()] !== undefined) {
      const word = w[1].toLowerCase();
      const after = s.slice(w[0].length);
      // "a dozen eggs", "half a cup", "an onion", but not "a few" or a plain name like "one-pot..."
      if (word === "half") {
        quantity = 0.5;
        s = after.replace(/^(?:a|an)\s+/i, "");
      } else if (/^dozen\b/i.test(after)) {
        quantity = WORD_NUMBERS[word] * 12;
        s = after.replace(/^dozen\s*/i, "");
      } else if (!/^(few|couple|handful|little|bit)\b/i.test(after)) {
        quantity = WORD_NUMBERS[word];
        s = after;
      }
    }
  }

  if (quantity !== null) {
    // "2 x 400g tins"
    s = s.replace(/^x\s+/i, "");
    const paren = s.match(SIZE_PAREN_RE);
    if (paren) {
      const sizeUnit = lookupUnit(paren[2].trim().replace(/\.$/, "")) ?? lookupUnit(paren[2].trim());
      if (sizeUnit) {
        size = { amount: toNumber(paren[1]), unit: sizeUnit };
        s = s.slice(paren[0].length).trim();
      }
    } else {
      const hy = s.match(SIZE_HYPHEN_RE);
      if (hy) {
        const sizeUnit = lookupUnit(hy[2].replace(/\s+/g, " ").toLowerCase());
        if (sizeUnit) {
          size = { amount: toNumber(hy[1]), unit: sizeUnit };
          s = s.slice(hy[0].length).trim();
        }
      }
    }
    // size words before the unit: "2 large cloves garlic", "1 heaping cup"
    let words = s.split(" ");
    while (words.length > 1 && SIZE_WORDS.has(words[0].toLowerCase().replace(/,$/, ""))) {
      const nextUnit = takeUnit(words.slice(1).join(" "));
      if (!nextUnit) break; // "2 large eggs": keep "large" out of the unit but it is not a unit either
      words = words.slice(1);
    }
    s = words.join(" ");
    const u = takeUnit(s);
    if (u) {
      unit = u.unit;
      s = u.rest;
      // "1 package (8 oz) cream cheese"
      const after = !size && s.match(SIZE_PAREN_RE);
      if (after) {
        const sizeUnit = lookupUnit(after[2].trim());
        if (sizeUnit && sizeUnit !== unit) {
          size = { amount: toNumber(after[1]), unit: sizeUnit };
          s = s.slice(after[0].length).trim();
        }
      }
    } else if (size) {
      unit = "each";
    }
  }

  const { name, note, optional } = splitNameNote(s);
  return { raw, quantity, quantityMax, unit, size, name, note, optional };
}
