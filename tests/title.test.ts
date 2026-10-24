import { describe, expect, it } from "vitest";
import { buildGroups, defaultBreaks, readPageText, type PagePart } from "@/lib/import/pages";
import { cleanTitleText, looksLikeBadTitle, pickTitle, suggestTitle } from "@/lib/import/title";

const read = (text: string) => {
  const parts: PagePart[] = readPageText(text).map((p) => ({ ...p, page: 0 }));
  return buildGroups(parts, defaultBreaks(parts))[0].recipe;
};

describe("finding the dish name", () => {
  it("skips symbols the reader picked up", () => {
    expect(read(`_— Sheet Pan Omelet\nPrep Time 10 minutes\nIngredients\n12 large eggs\n1 cup milk\nInstructions\nBake 20 minutes.`).title).toBe("Sheet Pan Omelet");
  });

  it("skips time and yield lines above the name", () => {
    const r = read(`Prep Time: 5 minutes\nYield: 6 servings\nONE-PAN TACO RICE DINNER\nIngredients\n1 pound ground beef\n1 cup salsa\nInstructions\n1. Brown the beef.`);
    expect(r.title).toBe("One-Pan Taco Rice Dinner");
  });

  it("skips brand banners and joins a 'with a …' subtitle", () => {
    const r = read(`HELLO FRESH\nFAST & FRESH\nSTUFFED-MEATBALL RIGATONI BAKE\nwith a Parmesan & Panko Crust\nPREP: 10 MIN COOK: 35 MIN\nIngredients\n10 oz ground beef\n6 oz rigatoni\nInstructions\nBake 15 minutes.`);
    expect(r.title).toBe("Stuffed-Meatball Rigatoni Bake with a Parmesan & Panko Crust");
  });

  it("uses the description when there is no name line", () => {
    const r = read(`: Yield: 6 servings\nEgg Salad is a delicious, versatile recipe perfect for sandwiches.\nIngredients\n8 large eggs\n1/2 cup mayonnaise\nInstructions\nChop the eggs and mix.`);
    expect(r.title).toBe("Egg Salad");
  });

  it("does not make a name out of reader noise", () => {
    const r = read(`$Hich Qoder L o\nShells\n3 cups milk\nSalt\nPaprika\nPepper`);
    expect(r.title).toBe("Untitled recipe");
  });
});

describe("unreadable pages", () => {
  it("scores reader noise low and real text high", async () => {
    const { textQuality } = await import("@/lib/import/pages");
    expect(textQuality("$Hich Qoder L o Shclls 3 cwp mix Sa1t pXrka Qepr ~~ ,.. vv")).toBeLessThan(0.6);
    expect(textQuality("Grandma's Pot Roast\nIngredients\n3 lb chuck roast\n2 tablespoons vegetable oil\nDirections\nBrown the roast on all sides.")).toBeGreaterThan(0.8);
  });

  it("keeps unreadable pages apart and unnamed", async () => {
    const { unreadablePart } = await import("@/lib/import/pages");
    const parts: PagePart[] = [
      { ...unreadablePart(), page: 0 },
      { ...unreadablePart(), page: 1 },
    ];
    const groups = buildGroups(parts, defaultBreaks(parts));
    expect(groups).toHaveLength(2);
    expect(groups[0].unreadable).toBe(true);
    expect(groups[0].recipe.title).toBe("");
  });
});

describe("helpers", () => {
  it("cleans", () => {
    expect(cleanTitleText("++*Grandma's Chili**")).toBe("Grandma's Chili");
    expect(cleanTitleText("£ FRESH with a Parmesan & Panko Crust")).toBe("FRESH with a Parmesan & Panko Crust");
  });

  it("spots bad names", () => {
    for (const bad of ["_— Sheet Pan Omelet", ": Yield: 6 servings", "& HELLO FAST &", "Hello Fast &", "++*Prep Time:** 5 minutes", "$Hich Qoder L o", "Untitled recipe"]) {
      expect(looksLikeBadTitle(bad), bad).toBe(true);
    }
    for (const good of ["Sheet Pan Omelet", "Grandma's Pot Roast", "Egg Salad", "Stuffed-Meatball Rigatoni Bake with a Parmesan & Panko Crust", "Sweet Tea"]) {
      expect(looksLikeBadTitle(good), good).toBe(false);
    }
  });

  it("suggests names", () => {
    expect(suggestTitle({ title: "_— Sheet Pan Omelet", description: null, ingredients: [] })).toBe("Sheet Pan Omelet");
    expect(suggestTitle({ title: ": Yield: 6 servings", description: "Egg Salad is a delicious recipe.", ingredients: [] })).toBe("Egg Salad");
    expect(suggestTitle({ title: "$Hich Qoder L o", description: null, ingredients: [] })).toBeNull();
    expect(pickTitle(["Ingredients", "1 cup milk"])).toBeNull();
  });
});
