import { describe, expect, it } from "vitest";
import { autoFill, rankForSlot, type CandidateRecipe } from "@/lib/planner";
import { moodScore, inferMealTypes } from "@/lib/moods";

const r = (id: string, title: string, ingredients: string[], extra: Partial<CandidateRecipe> = {}): CandidateRecipe => ({
  id,
  title,
  description: null,
  servings: 4,
  ingredients,
  tags: [],
  totalMinutes: 40,
  mealTypes: ["dinner"],
  isFavorite: false,
  isStaple: false,
  stapleEveryWeeks: null,
  lastPlannedOn: null,
  ...extra,
});

const tacos = r("tacos", "Chicken Tacos", ["1 lb chicken breast", "1/4 cup chopped cilantro", "1/2 cup sour cream", "8 corn tortillas"]);
const salsaChicken = r("salsa", "Cilantro Lime Rice Bowls", ["2 cups rice", "1/2 cup chopped cilantro", "1/2 cup sour cream", "1 lime"]);
const spaghetti = r("spag", "Spaghetti", ["1 lb spaghetti", "1 jar marinara", "1/2 cup grated parmesan"]);
const pancakes = r("pan", "Pancakes", ["2 cups flour", "2 eggs", "1 1/2 cups milk"], { mealTypes: ["breakfast"] });

describe("rankForSlot", () => {
  it("prefers the recipe that uses up leftovers", () => {
    const ranked = rankForSlot({
      others: [{ recipe: tacos, servings: 4 }],
      candidates: [spaghetti, salsaChicken],
      servings: 4,
      mealType: "dinner",
      store: "walmart",
      today: new Date("2026-10-25T12:00:00Z"),
    });
    expect(ranked[0].recipe.id).toBe("salsa");
    expect(ranked[0].usesLeftovers.join(" ")).toMatch(/cilantro/i);
    expect(ranked[0].wasteDelta).toBeLessThan(0);
  });

  it("only offers breakfast recipes for breakfast", () => {
    const ranked = rankForSlot({ others: [], candidates: [tacos, pancakes], servings: 4, mealType: "breakfast", store: "walmart" });
    expect(ranked.map((s) => s.recipe.id)).toEqual(["pan"]);
  });

  it("follows the mood", () => {
    const ranked = rankForSlot({
      others: [],
      candidates: [tacos, spaghetti],
      servings: 4,
      mealType: "dinner",
      store: "walmart",
      request: { moods: ["italian"], note: "" },
    });
    expect(ranked[0].recipe.id).toBe("spag");
  });
});

describe("ratings", () => {
  it("ranks higher-rated recipes first, other things equal", () => {
    const a = r("a", "Plain Pasta", ["1 lb spaghetti"], { rating: 2 });
    const b = r("b", "Other Pasta", ["1 lb spaghetti"], { rating: 5 });
    const ranked = rankForSlot({ others: [], candidates: [a, b], servings: 4, mealType: "dinner", store: "walmart" });
    expect(ranked.map((s) => s.recipe.id)).toEqual(["b", "a"]);
    expect(ranked[0].reasons).toContain("Rated 5★");
  });
});

describe("autoFill", () => {
  it("puts due staples first and fills the rest", () => {
    const staple = r("staple", "Taco Tuesday", ["1 lb ground beef"], { isStaple: true, stapleEveryWeeks: 1, lastPlannedOn: "2026-10-11" });
    const picks = autoFill({
      slots: [0, 1, 2].map((index) => ({ index, mealType: "dinner" as const, recipeId: null, servings: 4, locked: false })),
      recipes: [tacos, spaghetti, salsaChicken, staple],
      store: "walmart",
      today: new Date("2026-10-25T12:00:00Z"),
      random: () => 0,
    });
    expect(picks.get(0)).toBe("staple");
    expect(new Set(picks.values()).size).toBe(3);
  });

  it("passes over avoided recipes for new suggestions, unless nothing else fits", () => {
    const meatloaf = r("loaf", "Meatloaf", ["2 lb ground beef", "1 egg"]);
    const slots = (n: number) => Array.from({ length: n }, (_, index) => ({ index, mealType: "dinner" as const, recipeId: null, servings: 4, locked: false }));
    const fresh = autoFill({ slots: slots(2), recipes: [tacos, spaghetti, salsaChicken, meatloaf], store: "walmart", avoidIds: new Set(["tacos", "spag"]), random: () => 0 });
    expect([...fresh.values()].sort()).toEqual(["loaf", "salsa"]);
    const short = autoFill({ slots: slots(3), recipes: [tacos, spaghetti, salsaChicken, meatloaf], store: "walmart", avoidIds: new Set(["tacos", "spag"]), random: () => 0 });
    expect(new Set(short.values()).size).toBe(3);
  });
});

describe("moods", () => {
  it("scores", () => {
    expect(moodScore({ ...tacos, description: null }, ["mexican"], "")).toBe(1);
    expect(moodScore({ ...spaghetti }, ["mexican"], "")).toBe(0);
    expect(moodScore({ ...tacos }, [], "something with chicken")).toBe(1);
    expect(moodScore({ ...spaghetti }, ["vegetarian"], "")).toBe(1);
  });
  it("infers meal types", () => {
    expect(inferMealTypes({ title: "Blueberry Pancakes", tags: [] })).toEqual(["breakfast"]);
    expect(inferMealTypes({ title: "Turkey Club Sandwich", tags: [] })).toEqual(["lunch"]);
    expect(inferMealTypes({ title: "Beef Stroganoff", tags: [] })).toEqual(["dinner"]);
    expect(inferMealTypes({ title: "Chocolate Chip Cookies", tags: ["dessert"] })).toEqual([]);
  });
});
