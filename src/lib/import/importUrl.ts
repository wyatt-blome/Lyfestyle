import "server-only";
import { tidyTitle } from "../ingredients/names";
import { aiAvailable, extractRecipeFromImage } from "./ai";
import { FetchError, safeFetch } from "./fetch";
import { extractRecipeFromHtml, pageSummary } from "./jsonld";
import { boardPageUrl, boardRssUrl, classifyPinterestUrl, parseBoardPage, parseBoardRss, readPinPage } from "./pinterest";
import { emptyRecipe, type ImportedRecipe } from "./types";

/** The link was a whole board; `boardUrl` is where it leads. */
export class BoardLinkError extends FetchError {
  constructor(readonly boardUrl: string) {
    super("That's a whole board, not one recipe. Use “Many at once” to bring in its pins.");
  }
}

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

  if (pin?.kind === "board") throw new BoardLinkError(target);
  if (pin?.kind === "profile") throw new FetchError(PROFILE_MESSAGE);

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

const PROFILE_MESSAGE = "That link is a whole profile. Open one board in Pinterest, tap Share, then Copy link.";

/**
 * Pin links on a public board, newest first. Takes a board link or the pin.it link the Pinterest
 * app shares; `board` is false when the link turns out to be something else (a pin or a website).
 * Pinterest's feed only lists a board's recent pins.
 */
export async function listBoardPins(input: string): Promise<{ board: boolean; pins: { url: string; title: string }[] }> {
  let link = classifyPinterestUrl(input);
  let page: Awaited<ReturnType<typeof safeFetch>> | null = null;
  if (link?.kind === "short") {
    page = await safeFetch(input);
    link = classifyPinterestUrl(page.url);
  }
  if (link?.kind === "profile") throw new FetchError(PROFILE_MESSAGE);
  if (link?.kind !== "board") return { board: false, pins: [] };

  // Sections have no feed of their own; their page lists the pins.
  if (!link.section) {
    const feed = await safeFetch(boardRssUrl(link.user, link.board), { accept: "application/rss+xml,application/xml,text/xml" }).catch(() => null);
    const pins = feed && feed.status < 400 ? parseBoardRss(feed.text) : [];
    if (pins.length) return { board: true, pins };
  }
  if (!page || page.status >= 400) page = await safeFetch(boardPageUrl(link.user, link.board, link.section));
  if (page.status >= 400) throw new FetchError("Pinterest didn't return that board. Make sure it's public (secret boards can't be read).");
  const pins = parseBoardPage(page.text);
  if (!pins.length) throw new FetchError("Pinterest didn't list any pins for that board. Make sure it's public, or paste pin links instead.");
  return { board: true, pins };
}
