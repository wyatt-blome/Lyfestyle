// "What are you in the mood for?" choices, and how a recipe is matched to them. Matching reads
// the recipe's title, tags, description and ingredients, so imported recipes match without the
// household tagging anything by hand.

export type MealType = "breakfast" | "lunch" | "dinner";
export const MEAL_TYPES: { id: MealType; label: string }[] = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
];

export interface MatchableRecipe {
  title: string;
  description: string | null;
  tags: string[];
  ingredients: string[];
  totalMinutes: number | null;
  mealTypes: string[];
  lastPlannedOn: string | null;
}

export interface Mood {
  id: string;
  label: string;
  words?: string[];
  test?: (r: MatchableRecipe, text: string) => boolean;
}

const MEAT = /\b(chicken|beef|pork|turkey|bacon|sausage|ham|steak|lamb|shrimp|salmon|fish|tuna|cod|tilapia|crab|prosciutto|pepperoni|salami|chorizo|anchov|meatball|brisket|ribs?)\b/;

export const MOODS: Mood[] = [
  { id: "quick", label: "Quick (30 min)", test: (r, t) => (r.totalMinutes !== null && r.totalMinutes <= 30) || /\b(quick|15[- ]minute|20[- ]minute|30[- ]minute|weeknight|sheet[- ]pan|one[- ]pan|easy)\b/.test(t) },
  { id: "comfort", label: "Comfort food", words: ["casserole", "mac and cheese", "pot pie", "meatloaf", "mashed", "chili", "stew", "comfort", "baked ziti", "lasagna", "biscuits", "gravy", "pot roast", "shepherd", "enchilada", "dumpling", "grilled cheese"] },
  { id: "healthy", label: "Healthy & light", words: ["salad", "healthy", "light", "low-carb", "low carb", "keto", "whole30", "paleo", "quinoa", "bowl", "lean", "grilled", "zucchini noodle", "lettuce wrap", "veggie"] },
  { id: "mexican", label: "Mexican", words: ["taco", "enchilada", "burrito", "quesadilla", "fajita", "salsa", "tortilla", "mexican", "carnitas", "tamale", "nacho", "chimichanga", "tex-mex", "pozole", "elote"] },
  { id: "italian", label: "Italian", words: ["pasta", "lasagna", "spaghetti", "italian", "parmesan", "marinara", "risotto", "pizza", "alfredo", "penne", "ziti", "gnocchi", "bolognese", "pesto", "carbonara", "parmigiana", "tortellini"] },
  { id: "asian", label: "Asian", words: ["stir fry", "stir-fry", "teriyaki", "soy sauce", "sesame", "ginger", "thai", "chinese", "korean", "japanese", "vietnamese", "curry", "fried rice", "ramen", "lo mein", "pad thai", "bulgogi", "orange chicken", "kung pao", "pho", "sushi", "asian", "gochujang", "hoisin"] },
  { id: "southern", label: "Southern & Cajun", words: ["cajun", "creole", "gumbo", "jambalaya", "etouffee", "southern", "fried chicken", "grits", "cornbread", "red beans", "po boy", "andouille", "biscuit", "collard"] },
  { id: "slowcooker", label: "Slow cooker / Instant Pot", words: ["slow cooker", "crockpot", "crock pot", "crock-pot", "instant pot", "pressure cooker", "slow-cooker"] },
  { id: "grill", label: "Grilling", words: ["grill", "grilled", "bbq", "barbecue", "kabob", "kebab", "burger", "smoked"] },
  { id: "soup", label: "Soups & stews", words: ["soup", "stew", "chili", "chowder", "bisque", "gumbo", "pozole", "ramen", "pho"] },
  { id: "chicken", label: "Chicken", words: ["chicken"] },
  { id: "beef", label: "Beef", words: ["beef", "steak", "brisket", "burger", "meatball", "meatloaf", "roast"] },
  { id: "pork", label: "Pork", words: ["pork", "bacon", "sausage", "ham", "carnitas", "ribs"] },
  { id: "seafood", label: "Seafood", words: ["shrimp", "salmon", "fish", "tuna", "cod", "tilapia", "crab", "scallop", "seafood", "lobster", "crawfish", "catfish"] },
  { id: "vegetarian", label: "Meatless", test: (r, t) => /\b(vegetarian|vegan|meatless)\b/.test(t) || !MEAT.test(r.ingredients.join(" ").toLowerCase()) },
  { id: "kids", label: "Kid-friendly", words: ["kid", "kids", "family", "nugget", "mac and cheese", "pizza", "taco", "sloppy joe", "hot dog", "grilled cheese", "chicken tender", "spaghetti", "quesadilla", "pancake"] },
  { id: "new", label: "Something new", test: (r) => !r.lastPlannedOn },
];

export const MOODS_BY_ID = new Map(MOODS.map((m) => [m.id, m]));

export function recipeText(r: MatchableRecipe): string {
  return [r.title, r.description ?? "", r.tags.join(" "), r.ingredients.join(" ")].join(" \n ").toLowerCase();
}

function hasWord(text: string, word: string): boolean {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}(?:e?s)?\\b`).test(text);
}

const STOP = new Set(["something", "with", "and", "the", "a", "an", "some", "for", "of", "in", "we", "want", "like", "maybe", "food", "meal", "meals", "dinner", "lunch", "breakfast", "this", "week", "that", "are", "is", "to", "or", "not", "too", "very", "really", "good", "nice", "kind"]);

/** Words from the free-text box worth matching ("something with salmon" → ["salmon"]). */
export function noteWords(note: string): string[] {
  return note
    .toLowerCase()
    .split(/[^a-z-]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * How well a recipe fits what the household asked for: 0 = no match, 1 = matches everything.
 * Several moods mean "any of these", so the best one counts most.
 */
export function moodScore(r: MatchableRecipe, moodIds: string[], note: string): number {
  const words = noteWords(note);
  if (!moodIds.length && !words.length) return 0;
  const text = recipeText(r);
  let hits = 0;
  for (const id of moodIds) {
    const mood = MOODS_BY_ID.get(id);
    if (!mood) continue;
    const ok = mood.test ? mood.test(r, text) : (mood.words ?? []).some((w) => hasWord(text, w));
    if (ok) hits++;
  }
  const moodPart = moodIds.length ? Math.min(1, hits / Math.min(moodIds.length, 2)) : 0;
  const notePart = words.length ? words.filter((w) => hasWord(text, w)).length / words.length : 0;
  if (!moodIds.length) return notePart;
  if (!words.length) return moodPart;
  return Math.max(moodPart, notePart) * 0.7 + Math.min(moodPart, notePart) * 0.3;
}

const BREAKFAST = ["breakfast", "brunch", "pancake", "waffle", "french toast", "omelet", "omelette", "frittata", "scramble", "muffin", "oatmeal", "overnight oats", "granola", "smoothie", "breakfast burrito", "egg bake", "hash brown", "biscuits and gravy", "quiche", "crepe", "bagel", "parfait"];
const LUNCH = ["lunch", "sandwich", "wrap", "salad", "soup", "panini", "quesadilla", "burger", "melt", "pita", "bowl", "slider", "chowder", "chili", "sub"];
const NOT_MEAL = ["dessert", "cookie", "cake", "brownie", "pie crust", "frosting", "icing", "cupcake", "candy", "fudge", "dip", "drink", "cocktail", "smoothie bowl", "dressing", "seasoning mix", "side dish", "appetizer"];

/** Meal types a recipe suits when the household hasn't set them: read from its tags and title. */
export function inferMealTypes(r: { title: string; tags: string[] }): MealType[] {
  const text = `${r.title} ${r.tags.join(" ")}`.toLowerCase();
  const out: MealType[] = [];
  if (BREAKFAST.some((w) => hasWord(text, w))) out.push("breakfast");
  if (LUNCH.some((w) => hasWord(text, w))) out.push("lunch");
  if (/\b(dinner|main|main course|main dish|entree|supper)\b/.test(text) || (!out.length && !NOT_MEAL.some((w) => hasWord(text, w)))) out.push("dinner");
  return out;
}

/** Whether a recipe can fill a slot. Dinners also work as lunch; breakfast stays breakfast. */
export function fitsSlot(mealTypes: string[], slot: MealType): number {
  if (mealTypes.includes(slot)) return 1;
  if (slot === "lunch" && mealTypes.includes("dinner")) return 0.5;
  return 0;
}
