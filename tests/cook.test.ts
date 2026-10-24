import { describe, expect, it } from "vitest";
import { categoriesOf, type CategoryRecipe } from "@/lib/categories";
import { scaleLine } from "@/lib/ingredients/scale";
import { stepTimers } from "@/lib/time";

describe("scaleLine", () => {
  it.each([
    ["1 1/2 cups milk", 2, "3 cups milk"],
    ["2 eggs", 1.5, "3 eggs"],
    ["1 (14.5 oz) can diced tomatoes, drained", 2, "2 cans (14.5 oz) diced tomatoes, drained"],
    ["2-3 tablespoons lime juice", 2, "4–6 tbsp lime juice"],
    ["Salt and pepper to taste", 2, "Salt and pepper to taste"],
    ["For the sauce:", 2, "For the sauce:"],
    ["1 cup flour", 1, "1 cup flour"],
  ])("%s ×%s", (line, f, out) => expect(scaleLine(line, f)).toBe(out));
});

describe("stepTimers", () => {
  it("finds the times in a step", () => {
    expect(stepTimers("Simmer 20-25 minutes, then rest 5 minutes.")).toEqual([
      { label: "20-25 minutes", seconds: 1500 },
      { label: "5 minutes", seconds: 300 },
    ]);
    expect(stepTimers("Roast for 1 1/2 hours.")).toEqual([{ label: "1 1/2 hours", seconds: 5400 }]);
    expect(stepTimers("Grill 4 minutes per side.")).toEqual([{ label: "4 minutes", seconds: 240 }]);
    expect(stepTimers("Preheat the oven to 350.")).toEqual([]);
  });
});

const base: CategoryRecipe = {
  title: "",
  description: null,
  tags: [],
  ingredients: [],
  totalMinutes: 40,
  minutes: 40,
  mealTypes: ["dinner"],
  lastPlannedOn: null,
  isFavorite: false,
  isStaple: false,
  rating: null,
  needsIngredients: false,
  needsName: false,
};

describe("categoriesOf", () => {
  it("sorts recipes into categories", () => {
    const enchiladas = categoriesOf({ ...base, title: "Chicken Enchiladas", ingredients: ["2 cups shredded chicken", "8 flour tortillas", "1 can enchilada sauce"] });
    expect(enchiladas).toEqual(expect.arrayContaining(["dinner", "chicken", "mexican", "casserole"]));
    const cake = categoriesOf({ ...base, title: "Pineapple Upside Down Cake", mealTypes: [], ingredients: ["1 cup butter", "1 cup chicken broth"] });
    expect(cake).toContain("desserts");
    expect(cake).not.toContain("chicken");
    const soup = categoriesOf({ ...base, title: "Potato Soup", ingredients: ["4 potatoes", "1 cup milk"], minutes: 25, rating: 5 });
    expect(soup).toEqual(expect.arrayContaining(["soup", "meatless", "quick", "top"]));
  });
});
