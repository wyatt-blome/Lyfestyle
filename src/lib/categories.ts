import { MOODS_BY_ID, recipeText, type MatchableRecipe } from "./moods";

// Categories for browsing the recipe list. They're worked out from each recipe's name, tags,
// meal types and ingredients, so recipes don't need sorting by hand.

export interface Category {
  id: string;
  label: string;
  group: "Collections" | "Meal" | "Course" | "Main ingredient" | "Kind of dish" | "Cuisine" | "Other";
  test: (r: CategoryRecipe, text: string) => boolean;
}

export interface CategoryRecipe extends MatchableRecipe {
  isFavorite: boolean;
  isStaple: boolean;
  rating: number | null;
  minutes: number | null;
  needsIngredients: boolean;
  needsName: boolean;
}

const has = (words: string[]) => (_: CategoryRecipe, text: string) => words.some((w) => new RegExp(`\\b${w}(?:e?s)?\\b`).test(text));
const mood = (id: string) => (r: CategoryRecipe, text: string) => {
  const m = MOODS_BY_ID.get(id)!;
  return m.test ? m.test(r, text) : (m.words ?? []).some((w) => new RegExp(`\\b${w}(?:e?s)?\\b`).test(text));
};
/** Name and tags only: ingredients would make every cake a "chicken" recipe if it used broth. */
const named = (words: string[]) => (r: CategoryRecipe) => {
  const t = `${r.title} ${r.tags.join(" ")}`.toLowerCase();
  return words.some((w) => new RegExp(`\\b${w}(?:e?s)?\\b`).test(t));
};

const DESSERT = ["dessert", "cookie", "cake", "cupcake", "brownie", "pie", "cobbler", "crisp", "pudding", "fudge", "candy", "bars", "cheesecake", "frosting", "ice cream", "tart", "sweet bread", "banana bread", "muffin"];
const SIDE = ["side", "sides", "side dish", "slaw", "coleslaw", "mashed potato", "roasted vegetable", "green bean", "corn", "rice pilaf", "potato salad", "baked beans", "rolls", "biscuit", "cornbread", "dip", "appetizer"];
const DRINK = ["drink", "tea", "lemonade", "smoothie", "punch", "cocktail", "coffee", "latte"];

export const CATEGORIES: Category[] = [
  { id: "favorites", label: "Favorites", group: "Collections", test: (r) => r.isFavorite },
  { id: "staples", label: "Staples", group: "Collections", test: (r) => r.isStaple },
  { id: "top", label: "4★ and up", group: "Collections", test: (r) => (r.rating ?? 0) >= 4 },
  { id: "quick", label: "30 minutes or less", group: "Collections", test: (r) => r.minutes !== null && r.minutes <= 30 },
  { id: "breakfast", label: "Breakfast", group: "Meal", test: (r) => r.mealTypes.includes("breakfast") },
  { id: "lunch", label: "Lunch", group: "Meal", test: (r) => r.mealTypes.includes("lunch") },
  { id: "dinner", label: "Dinner", group: "Meal", test: (r) => r.mealTypes.includes("dinner") && !named(DESSERT)(r) && !named(SIDE)(r) },
  { id: "sides", label: "Sides", group: "Course", test: (r) => named(SIDE)(r) },
  { id: "desserts", label: "Desserts & baking", group: "Course", test: (r) => named(DESSERT)(r) },
  { id: "drinks", label: "Drinks", group: "Course", test: (r) => named(DRINK)(r) },
  { id: "chicken", label: "Chicken", group: "Main ingredient", test: (r, t) => !named(DESSERT)(r) && has(["chicken"])(r, t) },
  { id: "beef", label: "Beef", group: "Main ingredient", test: (r, t) => !named(DESSERT)(r) && has(["beef", "steak", "brisket", "ground chuck", "meatball", "meatloaf"])(r, t) },
  { id: "pork", label: "Pork", group: "Main ingredient", test: (r, t) => !named(DESSERT)(r) && has(["pork", "bacon", "sausage", "ham", "carnitas"])(r, t) },
  { id: "seafood", label: "Fish & seafood", group: "Main ingredient", test: mood("seafood") },
  { id: "meatless", label: "Meatless", group: "Main ingredient", test: (r, t) => !named(DESSERT)(r) && !named(DRINK)(r) && mood("vegetarian")(r, t) },
  { id: "soup", label: "Soups & stews", group: "Kind of dish", test: (r) => named(["soup", "stew", "chili", "chowder", "bisque", "gumbo"])(r) },
  { id: "pasta", label: "Pasta", group: "Kind of dish", test: (r) => named(["pasta", "spaghetti", "lasagna", "ziti", "penne", "rigatoni", "alfredo", "mac and cheese", "macaroni", "noodle", "tortellini", "fettuccine"])(r) },
  { id: "casserole", label: "Casseroles & bakes", group: "Kind of dish", test: (r) => named(["casserole", "bake", "baked ziti", "pot pie", "enchilada"])(r) },
  { id: "salad", label: "Salads", group: "Kind of dish", test: (r) => named(["salad"])(r) },
  { id: "sandwich", label: "Sandwiches & wraps", group: "Kind of dish", test: (r) => named(["sandwich", "wrap", "burger", "slider", "sub", "panini", "melt", "quesadilla"])(r) },
  { id: "slowcooker", label: "Slow cooker & Instant Pot", group: "Kind of dish", test: mood("slowcooker") },
  { id: "mexican", label: "Mexican", group: "Cuisine", test: mood("mexican") },
  { id: "italian", label: "Italian", group: "Cuisine", test: mood("italian") },
  { id: "asian", label: "Asian", group: "Cuisine", test: mood("asian") },
  { id: "southern", label: "Southern & Cajun", group: "Cuisine", test: mood("southern") },
  { id: "fix-ingredients", label: "Needs ingredients", group: "Other", test: (r) => r.needsIngredients },
  { id: "fix-name", label: "Needs a name", group: "Other", test: (r) => r.needsName },
];

/** Every category a recipe belongs to. */
export function categoriesOf(r: CategoryRecipe): string[] {
  const text = recipeText(r);
  return CATEGORIES.filter((c) => c.test(r, text)).map((c) => c.id);
}
