import { describe, expect, it } from "vitest";
import { buildGroceryList, choosePackages } from "@/lib/ingredients/grocery";

const recipe = (id: string, servings: number | null, ingredients: string[]) => ({ id, title: id, servings, ingredients });

describe("buildGroceryList", () => {
  it("combines the same ingredient across recipes and units", () => {
    const lines = buildGroceryList(
      [
        { recipe: recipe("tacos", 4, ["1 lb ground beef", "1/2 cup sour cream", "1 packet taco seasoning", "1/4 cup chopped cilantro"]),
          servings: 4 },
        { recipe: recipe("chili", 4, ["1 lb ground beef", "1 cup sour cream", "2 (15 oz) cans black beans", "1 onion, diced"]), servings: 4 },
      ],
      "walmart",
    );
    const beef = lines.find((l) => l.key === "ground-beef")!;
    expect(beef.needText).toBe("2 lb");
    expect(beef.sources).toHaveLength(2);
    const sour = lines.find((l) => l.key === "sour-cream")!;
    expect(sour.needText).toBe("1½ cups");
    expect(sour.buyText).toBe("16 oz tub");
    const beans = lines.find((l) => l.key === "black-bean")!;
    expect(beans.buyText).toBe("2 × 15 oz can");
    const cilantro = lines.find((l) => l.key === "cilantro")!;
    expect(cilantro.buyText).toBe("1 bunch");
    expect(cilantro.leftover?.waste).toBeGreaterThan(0.7);
  });

  it("scales by servings", () => {
    const lines = buildGroceryList([{ recipe: recipe("r", 4, ["2 cups milk"]), servings: 8 }], "walmart");
    expect(lines[0].needText).toBe("4 cups");
    expect(lines[0].buyText).toBe("1 quart");
  });

  it("uses bigger Sam's Club packs and counts sealed units as keeping", () => {
    const lines = buildGroceryList([{ recipe: recipe("r", 4, ["1 can diced tomatoes"]), servings: 4 }], "sams");
    expect(lines[0].buyText).toBe("8-pack 14.5 oz cans");
    expect(lines[0].leftover?.waste).toBeLessThan(0.05);
    expect(lines[0].leftover?.text).toBe("7 unopened");
    const sauce = buildGroceryList([{ recipe: recipe("r", 4, ["2 cups marinara sauce"]), servings: 4 }], "sams")[0];
    expect(sauce.leftover?.text).toMatch(/^\d.* cups? plus 2 unopened$/);
  });

  it("marks pantry staples", () => {
    const lines = buildGroceryList([{ recipe: recipe("r", 4, ["1 tsp salt", "2 tbsp olive oil", "1 tsp smoked paprika"]), servings: 4 }], "walmart");
    expect(lines.every((l) => l.pantry)).toBe(true);
  });

  it("reads one as singular", () => {
    const lines = buildGroceryList([{ recipe: recipe("r", 4, ["1 cup heavy cream", "1 tomato"]), servings: 4 }], "walmart");
    expect(lines.find((l) => l.key === "heavy-cream")!.needText).toBe("1 cup");
  });

  it("keeps unknown items", () => {
    const lines = buildGroceryList([{ recipe: recipe("r", 2, ["2 tbsp gochujang", "1 tbsp gochujang"]), servings: 2 }], "walmart");
    expect(lines).toHaveLength(1);
    expect(lines[0].needText).toBe("3 tbsp");
  });
});

describe("choosePackages", () => {
  it("prefers less leftover, then fewer packages", () => {
    const pkgs = [{ size: 227, label: "8 oz" }, { size: 454, label: "16 oz" }];
    expect(choosePackages(400, pkgs)!.picks).toEqual([{ pkg: pkgs[1], count: 1 }]);
    expect(choosePackages(200, pkgs)!.picks).toEqual([{ pkg: pkgs[0], count: 1 }]);
    expect(choosePackages(600, pkgs)!.total).toBe(681);
  });
});
