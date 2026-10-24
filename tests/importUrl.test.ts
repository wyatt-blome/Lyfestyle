import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: async (host: string) => (host === "evil.test" ? [{ address: "10.0.0.5" }] : [{ address: "93.184.216.34" }]),
}));

const pages: Record<string, { status?: number; body: string; location?: string }> = {
  "https://pin.it/abc": { status: 302, body: "", location: "https://www.pinterest.com/pin/123456789012/sent/?invite_code=x" },
  "https://www.pinterest.com/pin/123456789012/": {
    body: `<meta property="og:title" content="Easy Taco Soup | Pinterest"><script id="__PWS_DATA__" type="application/json">${JSON.stringify({
      a: { pins: { "123456789012": { id: "123456789012", link: "https://recipes.test/taco-soup", title: "Easy Taco Soup" } } },
    })}</script>`,
  },
  "https://recipes.test/taco-soup": {
    body: `<script type="application/ld+json">{"@type":"Recipe","name":"Taco Soup","recipeIngredient":["1 lb ground beef","1 packet taco seasoning"],"recipeInstructions":["Brown beef.","Simmer."],"recipeYield":"6"}</script>`,
  },
  "https://www.pinterest.com/pin/555555555555/": {
    body: `<meta property="og:title" content="Cookies | Pinterest"><meta property="og:image" content="https://i.pinimg.com/x.jpg">`,
  },
  "https://pin.it/board1": { status: 302, body: "", location: "https://www.pinterest.com/jane/dinner/?invite_code=abc&sender=1" },
  "https://pin.it/blocked": { status: 302, body: "", location: "https://www.pinterest.com/sam/sweets/?invite_code=z" },
  "https://www.pinterest.com/sam/sweets/?invite_code=z": {
    body: `<script id="__PWS_DATA__" type="application/json">${JSON.stringify({
      board: { id: "999999999", type: "board", name: "Sweets" },
      feed: [
        { id: "700000000001", type: "pin", grid_title: "Brownies" },
        { id: "700000000002", type: "pin", title: "", description: "Lemon bars" },
        { id: "700000000001", type: "pin", grid_title: "Brownies" },
      ],
    })}</script>`,
  },
  "https://pin.it/profile": { status: 302, body: "", location: "https://www.pinterest.com/jane/" },
  "https://www.pinterest.com/jane/dinner.rss": {
    body: `<rss><channel><item><title>A</title><link>https://www.pinterest.com/pin/1/</link></item></channel></rss>`,
  },
};

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  vi.stubGlobal("fetch", async (input: URL | string) => {
    const url = input.toString();
    const page = pages[url];
    if (!page) return new Response("missing", { status: 404 });
    return new Response(page.body, { status: page.status ?? 200, headers: page.location ? { location: page.location } : {} });
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("importFromUrl", () => {
  it("follows a pin.it link through the pin to the recipe site", async () => {
    const { importFromUrl } = await import("@/lib/import/importUrl");
    const res = await importFromUrl("https://pin.it/abc");
    expect(res.status).toBe("complete");
    expect(res.recipe.title).toBe("Taco Soup");
    expect(res.recipe.sourceUrl).toBe("https://recipes.test/taco-soup");
    expect(res.pinterestUrl).toBe("https://www.pinterest.com/pin/123456789012/");
    expect(res.recipe.servings).toBe(6);
  });

  it("returns a partial recipe for an image-only pin when photo reading is off", async () => {
    const { importFromUrl } = await import("@/lib/import/importUrl");
    const res = await importFromUrl("https://www.pinterest.com/pin/555555555555/");
    expect(res.status).toBe("partial");
    expect(res.recipe.title).toBe("Cookies");
    expect(res.recipe.imageUrl).toBe("https://i.pinimg.com/x.jpg");
  });

  it("refuses private addresses", async () => {
    const { importFromUrl } = await import("@/lib/import/importUrl");
    await expect(importFromUrl("http://evil.test/")).rejects.toThrow(/public web/);
    await expect(importFromUrl("http://127.0.0.1:3000/")).rejects.toThrow(/public web/);
  });

  it("lists a board's pins", async () => {
    const { listBoardPins } = await import("@/lib/import/importUrl");
    expect(await listBoardPins("https://www.pinterest.com/jane/dinner/")).toEqual({ board: true, pins: [{ url: "https://www.pinterest.com/pin/1/", title: "A" }] });
  });

  it("follows the pin.it link the Pinterest app shares for a board", async () => {
    const { listBoardPins } = await import("@/lib/import/importUrl");
    expect(await listBoardPins("https://pin.it/board1")).toEqual({ board: true, pins: [{ url: "https://www.pinterest.com/pin/1/", title: "A" }] });
  });

  it("reads pins from the board page when the board has no feed", async () => {
    const { listBoardPins } = await import("@/lib/import/importUrl");
    expect(await listBoardPins("https://pin.it/blocked")).toEqual({
      board: true,
      pins: [
        { url: "https://www.pinterest.com/pin/700000000001/", title: "Brownies" },
        { url: "https://www.pinterest.com/pin/700000000002/", title: "Lemon bars" },
      ],
    });
  });

  it("says when a pin.it link is a single pin or a profile", async () => {
    const { listBoardPins } = await import("@/lib/import/importUrl");
    expect(await listBoardPins("https://pin.it/abc")).toEqual({ board: false, pins: [] });
    await expect(listBoardPins("https://pin.it/profile")).rejects.toThrow(/profile/);
  });

  it("points a board link pasted as one recipe to the board importer", async () => {
    const { importFromUrl, BoardLinkError } = await import("@/lib/import/importUrl");
    const err = await importFromUrl("https://pin.it/board1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BoardLinkError);
    expect((err as InstanceType<typeof BoardLinkError>).boardUrl).toBe("https://www.pinterest.com/jane/dinner/?invite_code=abc&sender=1");
  });
});
