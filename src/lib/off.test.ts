import { describe, expect, it } from "vitest";
import { cleanQuery, isValidBarcode, normalizeOff, normalizeUsda, presetFromOff, presetFromUsda } from "./off";

describe("input validation", () => {
  it("accepts 6–14 digit barcodes only", () => {
    expect(isValidBarcode("737628064502")).toBe(true);
    expect(isValidBarcode("12345")).toBe(false);
    expect(isValidBarcode("123456789012345")).toBe(false);
    expect(isValidBarcode("12345a")).toBe(false);
  });

  it("trims queries and checks 2–80 chars", () => {
    expect(cleanQuery("  greek   yogurt ")).toBe("greek yogurt");
    expect(cleanQuery("a")).toBeNull();
    expect(cleanQuery("x".repeat(81))).toBeNull();
    expect(cleanQuery(null)).toBeNull();
  });
});

describe("Open Food Facts", () => {
  it("normalizes a product with per-serving values", () => {
    const p = normalizeOff({
      status: 1,
      product: {
        product_name: "Thai peanut noodle kit",
        brands: "Simply Asia, Thai Kitchen",
        serving_size: "52 g",
        serving_quantity: 52,
        nutriments: { "energy-kcal_100g": 385, proteins_100g: 9.62, "energy-kcal_serving": 200, proteins_serving: 5 },
      },
    });
    expect(p).toEqual({
      name: "Thai peanut noodle kit",
      brand: "Simply Asia",
      kcal100g: 385,
      protein100g: 9.6,
      kcalPerServing: 200,
      proteinPerServing: 5,
      servingSize: "52 g",
      servingQuantity: 52,
    });
    expect(presetFromOff(p!, "737628064502")).toMatchObject({
      name: "Thai peanut noodle kit (Simply Asia)",
      qty: 1,
      unit: "serving (52 g)",
      kcal: 200,
      proteinG: 5,
      source: "off",
      barcode: "737628064502",
    });
  });

  it("derives per-serving from per-100 g and kJ", () => {
    const p = normalizeOff({
      status: 1,
      product: { product_name: "Oats", serving_quantity: "40", nutriments: { energy_100g: 1569, proteins_100g: "13" } },
    });
    expect(p?.kcal100g).toBe(375);
    expect(p?.kcalPerServing).toBe(150);
    expect(p?.proteinPerServing).toBe(5.2);
  });

  it("falls back to 100 g when there is no serving", () => {
    const p = normalizeOff({ status: 1, product: { nutriments: { "energy-kcal_100g": 50 } } });
    expect(p?.name).toBe("Unnamed product");
    expect(presetFromOff(p!, "123456")).toMatchObject({ qty: 100, unit: "g", kcal: 50 });
  });

  it("returns null when not found", () => {
    expect(normalizeOff({ status: 0, status_verbose: "product not found" })).toBeNull();
    expect(normalizeOff(null)).toBeNull();
  });
});

describe("USDA FoodData Central", () => {
  const fixture = {
    totalHits: 3,
    foods: [
      {
        fdcId: 171287,
        description: "Egg, whole, raw, fresh",
        dataType: "SR Legacy",
        foodNutrients: [
          { nutrientId: 1003, nutrientNumber: "203", unitName: "G", value: 12.6 },
          { nutrientId: 1008, nutrientNumber: "208", unitName: "KCAL", value: 143 },
        ],
      },
      {
        fdcId: 2346384,
        description: "Greek yogurt plain",
        dataType: "Branded",
        brandOwner: "Fage",
        servingSize: 170,
        servingSizeUnit: "GRM",
        foodNutrients: [
          { nutrientId: 1008, unitName: "KJ", value: 400 },
          { nutrientId: 1008, unitName: "KCAL", value: 59 },
          { nutrientId: 1003, unitName: "G", value: 10.3 },
        ],
      },
      { fdcId: 1, description: "", foodNutrients: [] },
      {
        fdcId: 2,
        description: "Kale, raw",
        dataType: "Foundation",
        foodNutrients: [{ nutrientId: 2047, nutrientNumber: "957", unitName: "KCAL", value: 43 }],
      },
    ],
  };

  it("normalizes foods and nutrient ids", () => {
    const foods = normalizeUsda(fixture);
    expect(foods).toHaveLength(3);
    expect(foods[0]).toEqual({ fdcId: 171287, name: "Egg, whole, raw, fresh", kcal100g: 143, protein100g: 12.6 });
    expect(foods[1]).toMatchObject({ brand: "Fage", kcal100g: 59, servingSize: 170, servingUnit: "grm" });
    expect(foods[2].kcal100g).toBe(43);
    expect(normalizeUsda({ error: "bad" })).toEqual([]);
  });

  it("scales to the serving for presets", () => {
    const [egg, yogurt] = normalizeUsda(fixture);
    expect(presetFromUsda(egg)).toMatchObject({ qty: 100, unit: "g", kcal: 143, proteinG: 12.6, source: "usda" });
    expect(presetFromUsda(yogurt)).toMatchObject({ name: "Greek yogurt plain (Fage)", qty: 170, unit: "g", kcal: 100, proteinG: 17.5 });
  });
});
