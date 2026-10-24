import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { tidyTitle } from "../ingredients/names";
import type { RecipePart } from "./pages";
import { emptyRecipe, type ImportedRecipe } from "./types";

// Reads recipes out of photos (recipe cards, cookbook pages, screenshots) and out of
// image-only Pinterest pins. Needs ANTHROPIC_API_KEY; everything else in the app works without it.

const RecipeSchema = z.object({
  found: z.boolean().describe("false when the image does not contain a recipe"),
  title: z.string(),
  description: z.string().nullable(),
  servings: z.number().int().nullable(),
  prepMinutes: z.number().int().nullable(),
  cookMinutes: z.number().int().nullable(),
  ingredients: z.array(z.string()).describe("one ingredient per entry, exactly as written, including amounts"),
  steps: z.array(z.string()).describe("one step per entry"),
  tags: z.array(z.string()).describe("a few short lowercase tags: meal type, cuisine, main protein, cooking method"),
});

const PROMPT = `Transcribe the recipe in this image.
- Copy ingredient lines exactly as written, one per entry, keeping amounts and units ("1 1/2 cups flour"). If the card groups ingredients ("For the sauce"), add the group name as its own entry ending in a colon.
- Write each instruction step as its own entry. Fix obvious handwriting slips but do not invent steps or amounts.
- If something is unreadable, leave it out rather than guessing.
- Set found to false if there is no recipe in the image.`;

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export class AiError extends Error {}

type ImageInput = { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" } | { url: string };

export async function extractRecipeFromImage(image: ImageInput, hint?: string): Promise<ImportedRecipe> {
  if (!aiAvailable()) throw new AiError("Photo import needs an Anthropic API key. Add ANTHROPIC_API_KEY to the app's settings.");
  const client = new Anthropic();
  const source =
    "url" in image
      ? ({ type: "url", url: image.url } as const)
      : ({ type: "base64", media_type: image.mediaType, data: image.base64 } as const);
  let response;
  try {
    response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(RecipeSchema) },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source },
            { type: "text", text: hint ? `${PROMPT}\n\nContext: ${hint}` : PROMPT },
          ],
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Too many photo imports at once. Try again in a minute.");
    if (e instanceof Anthropic.BadRequestError) throw new AiError("That image couldn't be read. Try a clearer photo (JPEG or PNG).");
    if (e instanceof Anthropic.APIError) throw new AiError("The photo reader is unavailable right now. Try again shortly.");
    throw e;
  }
  if (response.stop_reason === "refusal") throw new AiError("The photo couldn't be processed.");
  const out = response.parsed_output;
  if (!out || !out.found || !out.ingredients.length) throw new AiError("No recipe found in that image.");
  return emptyRecipe({
    title: tidyTitle(out.title) || "Untitled recipe",
    description: out.description,
    servings: out.servings,
    prepMinutes: out.prepMinutes,
    cookMinutes: out.cookMinutes,
    totalMinutes: out.prepMinutes || out.cookMinutes ? (out.prepMinutes ?? 0) + (out.cookMinutes ?? 0) : null,
    ingredients: out.ingredients,
    steps: out.steps,
    tags: out.tags.map((t) => t.toLowerCase()).slice(0, 8),
  });
}

const PageSchema = z.object({
  parts: z
    .array(
      z.object({
        title: z.string().nullable().describe("the recipe name if this part starts a recipe on this page, else null"),
        continuesFromPrevious: z.boolean().describe("true if this part picks up a recipe begun on an earlier page (no title, starts mid-list or mid-step, or says continued)"),
        continuesOnNext: z.boolean().describe("true if the recipe runs off this page (cut off mid-step, ingredients with no method yet, or says continued/over)"),
        description: z.string().nullable(),
        servings: z.number().int().nullable(),
        prepMinutes: z.number().int().nullable(),
        cookMinutes: z.number().int().nullable(),
        ingredients: z.array(z.string()),
        steps: z.array(z.string()),
        tags: z.array(z.string()),
      }),
    )
    .describe("one entry per recipe or recipe fragment on the page, top to bottom; empty if the page has no recipe"),
});

const PAGE_PROMPT = `This photo is one page of a family's recipe collection: a recipe card, a cookbook page, or a printout. A recipe may continue across several pages, and one page may hold more than one recipe.
For each recipe or recipe fragment on the page, top to bottom:
- Copy ingredient lines exactly as written, one per entry, with amounts and units. Add a group name ("For the sauce") as its own entry ending in a colon.
- Write each instruction step as its own entry. Fix obvious handwriting slips but do not invent steps or amounts; leave out anything unreadable.
- Give the title only if the recipe starts on this page.
- Say whether the fragment continues from an earlier page or runs on to the next one.`;

/** Read one photographed page into recipe parts, for grouping multi-page recipes. */
export async function extractPageFromImage(image: ImageInput): Promise<RecipePart[]> {
  if (!aiAvailable()) throw new AiError("Photo reading with Claude isn't switched on.");
  const client = new Anthropic();
  const source =
    "url" in image
      ? ({ type: "url", url: image.url } as const)
      : ({ type: "base64", media_type: image.mediaType, data: image.base64 } as const);
  let response;
  try {
    response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(PageSchema) },
      messages: [{ role: "user", content: [{ type: "image", source }, { type: "text", text: PAGE_PROMPT }] }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Too many photos at once. Try again in a minute.");
    if (e instanceof Anthropic.BadRequestError) throw new AiError("That image couldn't be read. Try a clearer photo.");
    if (e instanceof Anthropic.APIError) throw new AiError("The photo reader is unavailable right now. Try again shortly.");
    throw e;
  }
  if (response.stop_reason === "refusal") throw new AiError("The photo couldn't be processed.");
  return (response.parsed_output?.parts ?? []).map((p) => ({ ...p, tags: p.tags.map((t) => t.toLowerCase()).slice(0, 8) }));
}
