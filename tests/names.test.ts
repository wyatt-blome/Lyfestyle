import { describe, expect, it } from "vitest";
import { buildGroceryList } from "@/lib/ingredients/grocery";
import { sentenceCase, tidyTitle } from "@/lib/ingredients/names";
import { identify } from "@/lib/ingredients/normalize";

describe("sentenceCase", () => {
  it.each([
    ["FISH SAUCE", "Fish sauce"],
    ["Fish Sauce", "Fish sauce"],
    ["paper towels", "Paper towels"],
    ["italian dressing", "Italian dressing"],
    ["dijon MUSTARD", "Dijon mustard"],
    ["bbq rub", "BBQ rub"],
  ])("%s → %s", (a, b) => expect(sentenceCase(a)).toBe(b));
});

describe("tidyTitle", () => {
  it.each([
    ["EASY CHICKEN ENCHILADAS", "Easy Chicken Enchiladas"],
    ["grandma's chili", "Grandma's Chili"],
    ["Best Taco Soup Recipe", "Best Taco Soup"],
    ["Taco Soup | Allrecipes", "Taco Soup"],
    ["Chicken Pot Pie - Sally's Baking Recipes", "Chicken Pot Pie"],
    ["Mac and Cheese - Southern Style", "Mac and Cheese - Southern Style"],
    ["Pad Thai", "Pad Thai"],
  ])("%s → %s", (a, b) => expect(tidyTitle(a)).toBe(b));
});

describe("grocery names", () => {
  it("names unknown items the way the recipe wrote them", () => {
    expect(identify("fresh tarragon leaves, chopped").name).toBe("Tarragon leaves");
    expect(identify("GOCHUJANG").name).toBe("Gochujang");
  });

  it("writes several single items as a count", () => {
    const lines = buildGroceryList([{ recipe: { id: "r", title: "r", servings: 4, ingredients: ["2 limes", "1 cup chopped cilantro"] }, servings: 4 }], "walmart");
    expect(lines.find((l) => l.key === "lime")!.buyText).toBe("2 limes");
    expect(lines.find((l) => l.key === "cilantro")!.buyText).toBe("1 bunch");
  });

  it("uses one standard name for the same item and counts in its own word", () => {
    const lines = buildGroceryList(
      [{ recipe: { id: "r", title: "r", servings: 4, ingredients: ["1 large onion, diced", "2 yellow onions", "1 lemon", "3 eggs"] }, servings: 4 }],
      "walmart",
    );
    expect(lines.map((l) => [l.name, l.needText])).toEqual([
      ["Lemons", "1 lemon"],
      ["Yellow onions", "3 onions"],
      ["Eggs", "3 eggs"],
    ]);
  });
});
