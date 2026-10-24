import { describe, expect, it } from "vitest";
import { buildGroups, defaultBreaks, fixOcrLine, readPageText, type PagePart, type RecipePart } from "@/lib/import/pages";
import { parseRecipeText } from "@/lib/import/text";

const flat = (pages: RecipePart[][]): PagePart[] => pages.flatMap((parts, page) => parts.map((p) => ({ ...p, page })));

const page1 = `Grandma's Pot Roast
Serves 6
Ingredients
3 lb chuck roast
2 tablespoons vegetable oil
1 onion, quartered
4 carrots, cut into
chunks
Directions
1. Heat the oil in a Dutch oven and brown the roast
on all sides.
2. Add the onion and carrots and pour in`;

const page2 = `the beef broth. Cover and roast at 300 for
3 hours.
3. Rest 10 minutes before slicing.
42`;

const page3 = `Quick Coleslaw
Ingredients
1 bag coleslaw mix
1/2 cup mayonnaise
Directions
Toss everything together and chill.

Sweet Tea
Ingredients
8 tea bags
1 cup sugar
Directions
Steep the tea, stir in sugar, and chill.`;

describe("readPageText", () => {
  it("reads a first page that runs onto the next", () => {
    const [part] = readPageText(page1);
    expect(part.title).toBe("Grandma's Pot Roast");
    expect(part.servings).toBe(6);
    expect(part.ingredients).toEqual(["3 lb chuck roast", "2 tablespoons vegetable oil", "1 onion, quartered", "4 carrots, cut into chunks"]);
    expect(part.steps).toEqual(["Heat the oil in a Dutch oven and brown the roast on all sides.", "Add the onion and carrots and pour in"]);
    expect(part.continuesOnNext).toBe(true);
    expect(part.continuesFromPrevious).toBe(false);
  });

  it("reads a continuation page", () => {
    const [part] = readPageText(page2);
    expect(part.title).toBeNull();
    expect(part.continuesFromPrevious).toBe(true);
    expect(part.steps[0]).toMatch(/^the beef broth/);
  });

  it("splits two recipes on one page", () => {
    const parts = readPageText(page3);
    expect(parts.map((p) => p.title)).toEqual(["Quick Coleslaw", "Sweet Tea"]);
    expect(parts[1].ingredients).toEqual(["8 tea bags", "1 cup sugar"]);
  });
});

describe("fixOcrLine", () => {
  it.each([
    ["« 3 1b chuck roast", "3 lb chuck roast"],
    ["e 4 carrots, peeled", "4 carrots, peeled"],
    ["• 2 Ibs ground beef", "2 lb ground beef"],
    ["8 0z cream cheese", "8 oz cream cheese"],
    ["Toss everything together.", "Toss everything together."],
    ["eggs", "eggs"],
  ])("%s", (raw, fixed) => expect(fixOcrLine(raw)).toBe(fixed));
});

describe("grouping pages", () => {
  it("joins continued pages and keeps separate recipes apart", () => {
    const parts = flat([readPageText(page1), readPageText(page2), readPageText(page3)]);
    const breaks = defaultBreaks(parts);
    const groups = buildGroups(parts, breaks);
    expect(groups.map((g) => g.recipe.title)).toEqual(["Grandma's Pot Roast", "Quick Coleslaw", "Sweet Tea"]);
    expect(groups[0].pages).toEqual([0, 1]);
    expect(groups[0].recipe.steps).toEqual([
      "Heat the oil in a Dutch oven and brown the roast on all sides.",
      "Add the onion and carrots and pour in the beef broth. Cover and roast at 300 for 3 hours.",
      "Rest 10 minutes before slicing.",
    ]);
    expect(groups[1].pages).toEqual([2]);
    expect(groups[2].pages).toEqual([2]);
  });

  it("lets the household split and join", () => {
    const parts = flat([readPageText(page1), readPageText(page2)]);
    const split = buildGroups(parts, [true, true]);
    expect(split).toHaveLength(2);
    expect(split[1].recipe.title).toBe("Untitled recipe");
    expect(buildGroups(parts, [true, false])).toHaveLength(1);
  });

  it("joins a page of ingredients that runs onto the next page", () => {
    const a = readPageText(`Big Batch Chili\nIngredients\n2 lb ground beef\n1 onion`);
    const b = readPageText(`2 cans kidney beans\n1 can crushed tomatoes\nDirections\nBrown the beef. Add the rest and simmer.`);
    const groups = buildGroups(flat([a, b]), defaultBreaks(flat([a, b])));
    expect(groups).toHaveLength(1);
    expect(groups[0].recipe.ingredients).toHaveLength(4);
  });

  it("keeps two separate cards apart", () => {
    const a = readPageText(`Banana Bread\nIngredients\n3 bananas\n2 cups flour\nDirections\nMix and bake 1 hour.`);
    const b = readPageText(`Lemon Bars\nIngredients\n1 cup butter\n4 eggs\nDirections\nBake the crust, add the filling, bake again.`);
    expect(buildGroups(flat([a, b]), defaultBreaks(flat([a, b]))).map((g) => g.recipe.title)).toEqual(["Banana Bread", "Lemon Bars"]);
  });
});

describe("long runs of pages", () => {
  it("keeps screenshots without a found name as separate recipes", () => {
    const shot = (n: number) => readPageText(`Prep Time 10 minutes\nServes 4\n1 cup rice\n2 cups water ${n}\nCook the rice ${n}.`);
    const parts = flat(Array.from({ length: 8 }, (_, i) => shot(i)));
    expect(buildGroups(parts, defaultBreaks(parts))).toHaveLength(8);
  });

  it("never makes a recipe longer than four pages", () => {
    const first = readPageText(`Big Feast\nIngredients\n1 turkey\nDirections\n1. Start the turkey and`);
    const more = Array.from({ length: 6 }, () => readPageText(`keep going with the next part and`));
    const parts = flat([first, ...more]);
    const groups = buildGroups(parts, defaultBreaks(parts));
    expect(groups[0].pages).toHaveLength(4);
    expect(groups.length).toBeGreaterThan(1);
  });
});

describe("parseRecipeText wrapped lines", () => {
  it("joins steps wrapped by the page", () => {
    const r = parseRecipeText(`Soup\nIngredients\n1 onion\nDirections\n1. Cook the onion until soft and\ngolden.\n2. Serve.`);
    expect(r.steps).toEqual(["Cook the onion until soft and golden.", "Serve."]);
  });
});
