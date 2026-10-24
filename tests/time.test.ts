import { describe, expect, it } from "vitest";
import { formatMinutes, prepEstimate, recipeTime, stepMinutes } from "@/lib/time";

describe("stepMinutes", () => {
  it("adds up the waiting and cooking in the steps", () => {
    expect(stepMinutes(["Brown the beef, about 8 minutes.", "Simmer 20-25 minutes.", "Bake for 1 1/2 hours."])).toBe(8 + 25 + 90);
    expect(stepMinutes(["Cook an hour.", "Rest half an hour."])).toBe(90);
    expect(stepMinutes(["Grill 4 minutes per side."])).toBe(0);
    expect(stepMinutes(["Marinate overnight."])).toBe(480);
    expect(stepMinutes(["Preheat the oven to 350 degrees."])).toBe(0);
  });
});

describe("recipeTime", () => {
  it("uses the recipe's own times", () => {
    expect(recipeTime({ prepMinutes: 15, cookMinutes: 30, totalMinutes: null, ingredients: [], steps: [] })).toEqual({ prep: 15, cook: 30, total: 45, estimated: false });
    expect(recipeTime({ prepMinutes: null, cookMinutes: null, totalMinutes: 75, ingredients: [], steps: [] })?.total).toBe(75);
  });

  it("estimates when there are none", () => {
    const t = recipeTime({
      prepMinutes: null,
      cookMinutes: null,
      totalMinutes: null,
      ingredients: ["1 onion, diced", "2 cloves garlic, minced", "1 lb ground beef", "1 can tomatoes"],
      steps: ["Brown the beef 10 minutes.", "Simmer 30 minutes."],
    })!;
    expect(t.estimated).toBe(true);
    expect(t.prep).toBe(15);
    expect(t.cook).toBe(40);
    expect(t.total).toBe(55);
    expect(prepEstimate([])).toBe(5);
  });

  it("returns null for an empty recipe", () => {
    expect(recipeTime({ prepMinutes: null, cookMinutes: null, totalMinutes: null, ingredients: [], steps: [] })).toBeNull();
  });

  it("formats", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(75)).toBe("1 hr 15 min");
    expect(formatMinutes(120, true)).toBe("about 2 hr");
  });
});
