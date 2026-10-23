import { describe, expect, it } from "vitest";
import { parseIngredientLine, isSectionHeader } from "@/lib/ingredients/parse";
import { identify } from "@/lib/ingredients/normalize";

const p = parseIngredientLine;

describe("parseIngredientLine", () => {
  it.each([
    ["2 cups all-purpose flour", 2, "cup", "all-purpose flour", null],
    ["1 1/2 tsp salt", 1.5, "tsp", "salt", null],
    ["1½ cups milk", 1.5, "cup", "milk", null],
    ["½ cup sour cream", 0.5, "cup", "sour cream", null],
    ["2 Tbsp. olive oil", 2, "tbsp", "olive oil", null],
    ["1 T butter", 1, "tbsp", "butter", null],
    ["1 t vanilla", 1, "tsp", "vanilla", null],
    ["3 cloves garlic, minced", 3, "clove", "garlic", "minced"],
    ["1 large onion, diced", 1, null, "large onion", "diced"],
    ["2 lbs boneless skinless chicken breasts", 2, "lb", "boneless skinless chicken breasts", null],
    ["1 cup of shredded cheddar cheese", 1, "cup", "shredded cheddar cheese", null],
    ["2-3 tablespoons lime juice", 2, "tbsp", "lime juice", null],
    ["a pinch of nutmeg", 1, "pinch", "nutmeg", null],
    ["- 4 eggs", 4, null, "eggs", null],
    ["12 oz. penne pasta", 12, "oz", "penne pasta", null],
  ])("%s", (line, qty, unit, name, note) => {
    const r = p(line);
    expect(r.quantity).toBeCloseTo(qty as number);
    expect(r.unit).toBe(unit);
    expect(r.name).toBe(name);
    if (note) expect(r.note).toBe(note);
  });

  it("reads can sizes", () => {
    const r = p("1 (14.5 oz) can diced tomatoes, drained");
    expect(r.quantity).toBe(1);
    expect(r.unit).toBe("can");
    expect(r.size).toEqual({ amount: 14.5, unit: "oz" });
    expect(r.name).toBe("diced tomatoes");
    const r2 = p("2 15-ounce cans black beans");
    expect(r2.size).toEqual({ amount: 15, unit: "oz" });
    expect(r2.unit).toBe("can");
    const r3 = p("1 package (8 oz) cream cheese, softened");
    expect(r3.unit).toBe("package");
    expect(r3.size).toEqual({ amount: 8, unit: "oz" });
    expect(r3.name).toBe("cream cheese");
  });

  it("handles no quantity and notes", () => {
    const r = p("Salt and pepper to taste");
    expect(r.quantity).toBeNull();
    expect(r.name).toBe("Salt and pepper");
    const r2 = p("Fresh cilantro, for garnish (optional)");
    expect(r2.optional).toBe(true);
    expect(r2.name).toBe("Fresh cilantro");
  });

  it("reads juice of a lemon", () => {
    const r = p("Juice of 1 lemon");
    expect(r.quantity).toBe(1);
    expect(identify(r.name).key).toBe("lemon");
    expect(p("juice of half a lime").quantity).toBe(0.5);
  });

  it("finds section headers", () => {
    expect(isSectionHeader("For the sauce:")).toBe("sauce");
    expect(isSectionHeader("Topping:")).toBe("Topping");
    expect(isSectionHeader("2 cups flour")).toBeNull();
  });
});

describe("identify", () => {
  it.each([
    ["boneless skinless chicken breasts", "chicken-breast"],
    ["shredded cheddar cheese", "cheddar"],
    ["large eggs", "egg"],
    ["fresh cilantro", "cilantro"],
    ["green onions, sliced", "green-onion"],
    ["garlic powder", "garlic-powder"],
    ["cloves garlic", "garlic"],
    ["red pepper flakes", "red-pepper-flakes"],
    ["red bell pepper", "bell-pepper-red"],
    ["freshly ground black pepper", "black-pepper"],
    ["low-sodium chicken broth", "chicken-broth"],
    ["extra-virgin olive oil", "olive-oil"],
    ["penne pasta", "short-pasta"],
    ["jalapeño", "jalapeno"],
    ["Roma tomatoes", "tomato"],
    ["hamburger buns", "burger-bun"],
    ["sour cream", "sour-cream"],
    ["heavy whipping cream", "heavy-cream"],
    ["egg noodles", "egg-noodle"],
    ["sun-dried tomatoes", "sun-dried-tomato"],
    ["sliced turkey", "deli-turkey"],
    ["kalamata olives", "olives"],
  ])("%s → %s", (name, key) => {
    expect(identify(name).key).toBe(key);
  });

  it("keeps unknown items readable", () => {
    const id = identify("fresh tarragon leaves");
    expect(id.key).toBe("x:tarragon leaf");
    expect(id.aisle).toBe("Produce");
  });
});
