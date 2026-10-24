import { describe, expect, it } from "vitest";
import { extractRecipeFromHtml } from "@/lib/import/jsonld";
import { classifyPinterestUrl, parseBoardRss, readPinPage } from "@/lib/import/pinterest";
import { parseRecipeText } from "@/lib/import/text";
import { parseDuration, parseYield } from "@/lib/import/types";
import { packageCount, parseProductUrl, searchUrl, walmartCartUrl } from "@/lib/stores";

const recipePage = `<!doctype html><html><head>
<meta property="og:image" content="https://example.com/og.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
 {"@type":"WebSite","name":"Example"},
 {"@type":["Recipe"],"name":"Chicken Tortilla Soup &amp; Lime","description":"Cozy.","image":[{"@type":"ImageObject","url":"https://example.com/soup.jpg"}],
  "recipeYield":["6","6 servings"],"prepTime":"PT15M","cookTime":"PT1H","totalTime":"PT1H15M",
  "recipeIngredient":["1 lb boneless skinless chicken breasts","1 (15 oz) can black beans, drained","1/2 cup chopped cilantro","Juice of 1 lime"],
  "recipeInstructions":[{"@type":"HowToSection","name":"Soup","itemListElement":[{"@type":"HowToStep","text":"Simmer everything."},{"@type":"HowToStep","text":"Shred the chicken."}]}],
  "recipeCategory":"Dinner","recipeCuisine":"Mexican","keywords":"soup, easy"}
]}</script></head><body></body></html>`;

describe("extractRecipeFromHtml", () => {
  it("reads schema.org recipes inside @graph", () => {
    const r = extractRecipeFromHtml(recipePage, "https://example.com/soup")!;
    expect(r.title).toBe("Chicken Tortilla Soup & Lime");
    expect(r.imageUrl).toBe("https://example.com/soup.jpg");
    expect(r.servings).toBe(6);
    expect(r.prepMinutes).toBe(15);
    expect(r.totalMinutes).toBe(75);
    expect(r.ingredients).toHaveLength(4);
    expect(r.steps).toEqual(["Soup:", "Simmer everything.", "Shred the chicken."]);
    expect(r.tags).toEqual(["dinner", "mexican", "soup", "easy"]);
  });

  it("returns null without recipe data", () => {
    expect(extractRecipeFromHtml("<html><head><title>Hi</title></head></html>", null)).toBeNull();
  });

  it("splits a single instructions string", () => {
    const html = `<script type="application/ld+json">{"@type":"Recipe","name":"X","recipeIngredient":["1 egg"],"recipeInstructions":"1. Crack the egg. 2. Cook it."}</script>`;
    expect(extractRecipeFromHtml(html, null)!.steps).toEqual(["Crack the egg.", "Cook it."]);
  });
});

describe("pinterest", () => {
  it("classifies links", () => {
    expect(classifyPinterestUrl("https://www.pinterest.com/pin/123456789012/")).toMatchObject({ kind: "pin", pinId: "123456789012" });
    expect(classifyPinterestUrl("https://pinterest.ca/pin/easy-soup--98765432101/")).toMatchObject({ kind: "pin", pinId: "98765432101" });
    expect(classifyPinterestUrl("https://pin.it/3xYz")).toMatchObject({ kind: "short" });
    expect(classifyPinterestUrl("https://www.pinterest.com/jane/dinner-ideas/")).toMatchObject({ kind: "board", user: "jane", board: "dinner-ideas" });
    expect(classifyPinterestUrl("https://www.allrecipes.com/recipe/1")).toBeNull();
  });

  it("finds the outbound link in pin page data", () => {
    const html = `<html><head><meta property="og:title" content="Best Soup | Pinterest"><meta property="og:image" content="https://i.pinimg.com/736x/a.jpg"></head><body>
<script id="__PWS_DATA__" type="application/json">${JSON.stringify({
      props: { initialReduxState: { pins: { "123456789012": { id: "123456789012", link: "https://example.com/soup", title: "Best Soup", images: { orig: { url: "https://i.pinimg.com/originals/a.jpg" } } }, "999": { id: "999", link: "https://other.com/x" } } } },
    })}</script></body></html>`;
    const info = readPinPage(html, "123456789012", "https://www.pinterest.com/pin/123456789012/");
    expect(info.link).toBe("https://example.com/soup");
    expect(info.title).toBe("Best Soup");
    expect(info.imageUrl).toBe("https://i.pinimg.com/originals/a.jpg");
    expect(info.recipe).toBeNull();
  });

  it("falls back to inline link values and og tags", () => {
    const html = `<meta property="og:title" content="Tacos | Pinterest"><script>window.x={"link":"https:\\/\\/www.pinterest.com\\/x","link":"https:\\/\\/tacos.example\\/r"}</script>`;
    const info = readPinPage(html, "1", "https://www.pinterest.com/pin/1/");
    expect(info.link).toBe("https://tacos.example/r");
    expect(info.title).toBe("Tacos");
  });

  it("reads board RSS", () => {
    const xml = `<rss><channel><item><title>Soup</title><link>https://www.pinterest.com/pin/111/</link></item><item><title><![CDATA[Tacos &amp; more]]></title><link>https://www.pinterest.com/pin/222/</link></item></channel></rss>`;
    expect(parseBoardRss(xml)).toEqual([
      { url: "https://www.pinterest.com/pin/111/", title: "Soup" },
      { url: "https://www.pinterest.com/pin/222/", title: "Tacos & more" },
    ]);
  });
});

describe("parseRecipeText", () => {
  it("uses headings", () => {
    const r = parseRecipeText(`Grandma's Chili\nServes 6\nPrep: 15 minutes\n\nIngredients\n2 lb ground beef\n1 onion, diced\n\nDirections\n1. Brown the beef.\n2. Add everything else.`);
    expect(r.title).toBe("Grandma's Chili");
    expect(r.servings).toBe(6);
    expect(r.prepMinutes).toBe(15);
    expect(r.ingredients).toEqual(["2 lb ground beef", "1 onion, diced"]);
    expect(r.steps).toEqual(["Brown the beef.", "Add everything else."]);
  });

  it("guesses without headings", () => {
    const r = parseRecipeText(`Pancakes\n1 1/2 cups flour\n2 eggs\n1 cup milk\nWhisk it all together. Cook on a griddle until golden.`);
    expect(r.ingredients).toHaveLength(3);
    expect(r.steps).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("parses durations and yields", () => {
    expect(parseDuration("PT1H30M")).toBe(90);
    expect(parseDuration("P0DT0H20M")).toBe(20);
    expect(parseDuration("1 hour 10 minutes")).toBe(70);
    expect(parseYield("Serves 4-6")).toBe(4);
    expect(parseYield(8)).toBe(8);
  });

  it("builds store links", () => {
    expect(searchUrl("walmart", "sour cream 16 oz")).toBe("https://www.walmart.com/search?q=sour%20cream%2016%20oz");
    expect(searchUrl("sams", "eggs")).toBe("https://www.samsclub.com/s/eggs");
    expect(parseProductUrl("walmart", "https://www.walmart.com/ip/Great-Value-Sour-Cream-16-oz/10450114?athbdg=1")).toEqual({
      url: "https://www.walmart.com/ip/Great-Value-Sour-Cream-16-oz/10450114",
      itemId: "10450114",
    });
    expect(parseProductUrl("walmart", "https://www.target.com/p/x")).toBeNull();
    expect(parseProductUrl("sams", "https://www.samsclub.com/p/members-mark-eggs/prod20595288")?.itemId).toBe("prod20595288");
    expect(walmartCartUrl([{ itemId: "10450114", quantity: 2 }])).toBe("https://affil.walmart.com/cart/addToCart?items=10450114%7C2");
    expect(packageCount("2 × 15 oz can + 8 oz can")).toBe(3);
    expect(packageCount("3 limes")).toBe(3);
    expect(packageCount("3 lb bag (about 6)")).toBe(1);
    expect(packageCount("2 dozen")).toBe(1);
    expect(packageCount("1 bunch")).toBe(1);
  });
});
