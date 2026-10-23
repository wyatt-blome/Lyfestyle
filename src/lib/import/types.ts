export interface ImportedRecipe {
  title: string;
  description: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  /** one line per ingredient; section headers like "For the sauce:" kept as their own line */
  ingredients: string[];
  steps: string[];
  tags: string[];
}

export function emptyRecipe(partial: Partial<ImportedRecipe> = {}): ImportedRecipe {
  return {
    title: "",
    description: null,
    imageUrl: null,
    sourceUrl: null,
    servings: null,
    prepMinutes: null,
    cookMinutes: null,
    totalMinutes: null,
    ingredients: [],
    steps: [],
    tags: [],
    ...partial,
  };
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  frac13: "⅓",
  frac23: "⅔",
  frac18: "⅛",
  deg: "°",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  eacute: "é",
  ntilde: "ñ",
  frasl: "⁄",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Strip tags and entities from a scraped string; entities can be double-encoded. */
export function cleanText(s: unknown): string {
  if (typeof s !== "string") return "";
  let out = s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ");
  out = decodeEntities(decodeEntities(out));
  return out.replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

/** ISO 8601 durations ("PT1H30M", "P0DT0H20M") to minutes. */
export function parseDuration(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (m) {
    const [, d, h, min, s] = m;
    const total = Number(d ?? 0) * 1440 + Number(h ?? 0) * 60 + Number(min ?? 0) + Number(s ?? 0) / 60;
    return total > 0 ? Math.round(total) : null;
  }
  const loose = v.match(/(?:(\d+)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?/i);
  if (loose && (loose[1] || loose[2])) return Number(loose[1] ?? 0) * 60 + Number(loose[2] ?? 0);
  return null;
}

/** "4 servings", "Serves 6-8", ["4", "4 servings"], 12 → first number. */
export function parseYield(v: unknown): number | null {
  if (Array.isArray(v)) {
    for (const x of v) {
      const n = parseYield(x);
      if (n) return n;
    }
    return null;
  }
  if (typeof v === "number") return v > 0 && v < 500 ? Math.round(v) : null;
  if (typeof v !== "string") return null;
  const m = v.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Math.round(Number(m[1]));
  return n > 0 && n < 500 ? n : null;
}
