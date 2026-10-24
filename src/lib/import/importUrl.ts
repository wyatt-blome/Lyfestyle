import "server-only";
import { tidyTitle } from "../ingredients/names";
import { aiAvailable, extractRecipeFromImage } from "./ai";
import { FetchError, safeFetch } from "./fetch";
import { extractRecipeFromHtml, pageSummary } from "./jsonld";
import { boardRssUrl, classifyPinterestUrl, parseBoardRss, readPinPage } from "./pinterest";
import { emptyRecipe, type ImportedRecipe } from "./types";

export interface ImportResult {
  recipe: ImportedRecipe;
  /** "complete" has ingredients; "partial" needs the user to fill them in */
  status: "complete" | "partial";
  pinterestUrl: string | null;
  message: string | null;
}

async function fromRecipePage(url: string): Promise<{ recipe: ImportedRecipe | null; summary: ReturnType<typeof pageSummary> | null; finalUrl: string }> {
  const page = await safeFetch(url);
  if (page.status >= 400) {
    return { recipe: null, summary: null, finalUrl: page.url };
  }
  return { recipe: extractRecipeFromHtml(page.text, page.url), summary: pageSummary(page.text), finalUrl: page.url };
}

/** Import one recipe from a recipe website, a Pinterest pin, or a pin.it short link. */
export async function importFromUrl(input: string): Promise<ImportResult> {
  let target = input.trim();
  let pin = classifyPinterestUrl(target);

  if (pin?.kind === "short") {
    const page = await safeFetch(target);
    target = page.url;
    pin = classifyPinterestUrl(target);
    if (!pin || pin.kind !== "pin") {
      // pin.it can also point straight at a recipe site.
      if (!pin) {
        const recipe = extractRecipeFromHtml(page.text, page.url);
        if (recipe) return { recipe, status: "complete", pinterestUrl: input.trim(), message: null };
      }
    }
  }

  if (pin?.kind === "board" || pin?.kind === "profile") {
    throw new FetchError("That's a board link. Use “Import a whole board” to bring in its pins.");
  }

  if (pin?.kind === "pin") {
    const page = await safeFetch(pin.url);
    if (page.status >= 400) throw new FetchError("Pinterest didn't return that pin. Check the link, or make sure the pin is public.");
    const info = readPinPage(page.text, pin.pinId, pin.url);
    if (info.recipe) return { recipe: { ...info.recipe, sourceUrl: info.link ?? info.recipe.sourceUrl }, status: "complete", pinterestUrl: pin.url, message: null };

    if (info.link) {
      try {
        const site = await fromRecipePage(info.link);
        if (site.recipe) {
          if (!site.recipe.imageUrl) site.recipe.imageUrl = info.imageUrl;
          return { recipe: site.recipe, status: "complete", pinterestUrl: pin.url, message: null };
        }
      } catch {
        /* fall through to the pin image */
      }
    }

    // Image-only pin: many pins carry the recipe in the picture.
    if (info.imageUrl && aiAvailable()) {
      try {
        const recipe = await extractRecipeFromImage({ url: info.imageUrl }, info.title ?? undefined);
        return {
          recipe: { ...recipe, imageUrl: info.imageUrl, sourceUrl: info.link },
          status: "complete",
          pinterestUrl: pin.url,
          message: "Read from the pin's image. Check the amounts.",
        };
      } catch {
        /* fall through to a partial recipe */
      }
    }

    return {
      recipe: emptyRecipe({
        title: info.title ? tidyTitle(info.title) : "Pinned recipe",
        description: info.description,
        imageUrl: info.imageUrl,
        sourceUrl: info.link,
      }),
      status: "partial",
      pinterestUrl: pin.url,
      message: info.link
        ? "The pin's website didn't share its ingredients. Add them below, or open the site and paste the recipe."
        : "This pin doesn't link to a recipe page. Add the ingredients below.",
    };
  }

  const site = await fromRecipePage(target);
  if (site.recipe) return { recipe: site.recipe, status: "complete", pinterestUrl: null, message: null };
  return {
    recipe: emptyRecipe({
      title: site.summary?.title ? tidyTitle(site.summary.title) : "New recipe",
      description: site.summary?.description ?? null,
      imageUrl: site.summary?.imageUrl ?? null,
      sourceUrl: site.finalUrl,
    }),
    status: "partial",
    pinterestUrl: null,
    message: "That page didn't include recipe data. Add the ingredients below, or paste the recipe text.",
  };
}

/** Pin links on a public board, newest first. Pinterest's feed only lists recent pins. */
export async function listBoardPins(input: string): Promise<{ url: string; title: string }[]> {
  const link = classifyPinterestUrl(input);
  if (!link || link.kind !== "board") throw new FetchError("Paste a board link like pinterest.com/yourname/dinner-ideas.");
  const feed = await safeFetch(boardRssUrl(link.user, link.board), { accept: "application/rss+xml,application/xml,text/xml" });
  if (feed.status >= 400) throw new FetchError("Pinterest didn't return that board. Make sure it's public (secret boards can't be read).");
  const pins = parseBoardRss(feed.text);
  if (!pins.length) throw new FetchError("No pins found on that board.");
  return pins;
}
