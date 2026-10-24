// One way of writing names everywhere: sentence case ("Fish sauce", not "FISH SAUCE" or
// "Fish Sauce"), except words that are always capitalized ("Italian sausage", "Dijon mustard").

const PROPER = new Map(
  [
    "american",
    "asian",
    "bbq",
    "cajun",
    "cheddar:cheddar",
    "chinese",
    "creole",
    "dijon",
    "english",
    "french",
    "gala",
    "granny",
    "greek",
    "honeycrisp",
    "indian",
    "italian",
    "jack",
    "japanese",
    "kalamata",
    "korean",
    "marzano",
    "mexican",
    "monterey",
    "parmesan",
    "pecorino",
    "romano",
    "san",
    "smith",
    "spanish",
    "sriracha",
    "swiss",
    "tabasco",
    "texas",
    "thai",
    "tuscan",
    "vidalia",
    "worcestershire",
    "yukon",
    "gold:gold",
  ].map((w) => {
    const [key, fixed] = w.split(":");
    return [key, fixed ?? (key === "bbq" ? "BBQ" : key.charAt(0).toUpperCase() + key.slice(1))];
  }),
);

/** "FISH SAUCE" / "Fish Sauce" / "fish sauce" → "Fish sauce"; keeps "Italian", "Dijon", "BBQ". */
export function sentenceCase(text: string): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const out = words.map((w, i) => {
    const lower = w.toLowerCase();
    const proper = PROPER.get(lower.replace(/[^a-z]/g, ""));
    if (proper && proper !== lower) return w.replace(/[a-z]+/i, proper);
    // Keep short all-caps abbreviations ("BLT", "XL") as written.
    if (/^[A-Z]{2,4}$/.test(w) && i > 0) return w;
    return lower;
  });
  const joined = out.join(" ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with", "n'"]);

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.replace(/^([("']?)([a-z])/, (_, p: string, c: string) => p + c.toUpperCase())))
    .join(" ");
}

/**
 * Tidy a recipe title from an import: drop site names and "Recipe" suffixes, fix ALL CAPS
 * or all-lowercase titles, and collapse stray spaces. Titles that already look deliberate stay.
 */
export function tidyTitle(raw: string): string {
  let t = raw.replace(/\s+/g, " ").trim();
  t = t.replace(/\s+[|•·]\s+.*$/, ""); // "Taco Soup | Allrecipes"
  t = t.replace(/\s+[-–—]\s+(?:[A-Z][\w'.]*\s*){1,4}$/, (m) => (/recipe|kitchen|blog|food|eats|cooking|\.com/i.test(m) ? "" : m));
  t = t.replace(/\s+recipe$/i, "").replace(/^recipe:\s*/i, "");
  t = t.replace(/[.:;,]+$/, "");
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters && (letters === letters.toUpperCase() || letters === letters.toLowerCase())) t = titleCase(t);
  return t || raw.trim();
}
