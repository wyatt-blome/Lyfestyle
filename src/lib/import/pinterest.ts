import { extractRecipeFromHtml, ldJsonBlocks, metaContent, pageSummary } from "./jsonld";
import { cleanText, decodeEntities, type ImportedRecipe } from "./types";

export type PinterestLink =
  | { kind: "pin"; url: string; pinId: string | null }
  | { kind: "short"; url: string }
  | { kind: "board"; url: string; user: string; board: string; section: string | null }
  | { kind: "profile"; url: string; user: string };

const RESERVED = new Set(["pin", "search", "ideas", "today", "settings", "business", "_", "explore", "categories", "topics", "videos"]);

export function classifyPinterestUrl(input: string): PinterestLink | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host === "pin.it" || host.endsWith(".pin.it")) return { kind: "short", url: u.toString() };
  if (!/(^|\.)pinterest\.[a-z.]+$/.test(host)) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0] === "pin" && parts[1]) {
    const id = parts[1].match(/(\d{6,})$/);
    return { kind: "pin", url: `https://www.pinterest.com/pin/${parts[1]}/`, pinId: id ? id[1] : null };
  }
  if (parts.length >= 2 && !RESERVED.has(parts[0])) {
    return {
      kind: "board",
      url: u.toString(),
      user: parts[0],
      board: parts[1],
      section: parts[2] ?? null,
    };
  }
  if (parts.length === 1 && !RESERVED.has(parts[0])) return { kind: "profile", url: u.toString(), user: parts[0] };
  return null;
}

function slug(part: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(part));
  } catch {
    return encodeURIComponent(part);
  }
}

export function boardRssUrl(user: string, board: string): string {
  return `https://www.pinterest.com/${slug(user)}/${slug(board)}.rss`;
}

/** The board's own page, without the share-tracking query ("?invite_code=…"). */
export function boardPageUrl(user: string, board: string, section: string | null): string {
  return `https://www.pinterest.com/${slug(user)}/${slug(board)}/${section ? `${slug(section)}/` : ""}`;
}

/** Pin links from a board's RSS feed (Pinterest only lists the most recent pins there). */
export function parseBoardRss(xml: string): { url: string; title: string }[] {
  const out: { url: string; title: string }[] = [];
  const re = /<item\b[\s\S]*?<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const block = m[0];
    const link = block.match(/<link>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/link>/i);
    const title = block.match(/<title>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/title>/i);
    if (link) out.push({ url: decodeEntities(link[1].trim()), title: title ? cleanText(title[1]) : "" });
  }
  return out;
}

/** Pins listed in a board page's inline data, for when the board's feed isn't available. */
export function parseBoardPage(html: string): { url: string; title: string }[] {
  const seen = new Map<string, string>();
  for (const data of embeddedJson(html)) {
    walk(data, (o) => {
      const id = String(o.id ?? "");
      if (o.type === "pin" && /^\d{6,}$/.test(id) && !seen.has(id)) {
        const title = [o.title, o.grid_title, o.description].find((t) => typeof t === "string" && t.trim());
        seen.set(id, typeof title === "string" ? cleanText(title) : "");
      }
      return false;
    });
  }
  if (!seen.size) {
    for (const m of html.matchAll(/href="\/pin\/(\d{6,})\/?"/g)) if (!seen.has(m[1])) seen.set(m[1], "");
  }
  return [...seen].map(([id, title]) => ({ url: `https://www.pinterest.com/pin/${id}/`, title }));
}

function isExternal(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return !/(^|\.)(pinterest\.[a-z.]+|pinimg\.com|pin\.it)$/.test(host);
  } catch {
    return false;
  }
}

function walk(node: unknown, visit: (o: Record<string, unknown>) => boolean, depth = 0): boolean {
  if (depth > 40 || !node || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some((n) => walk(n, visit, depth + 1));
  const o = node as Record<string, unknown>;
  if (visit(o)) return true;
  return Object.values(o).some((v) => walk(v, visit, depth + 1));
}

function embeddedJson(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script\b[^>]*(?:id\s*=\s*["'](?:__PWS_DATA__|__PWS_INITIAL_PROPS__|__NEXT_DATA__|initial-state)["']|type\s*=\s*["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      /* not JSON */
    }
  }
  return out;
}

export interface PinInfo {
  /** the recipe site the pin points to */
  link: string | null;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  /** recipe data Pinterest embedded on the pin page itself (rich pins) */
  recipe: ImportedRecipe | null;
}

/** Read what we need from a pin page: its outbound link, title, image and any recipe data. */
export function readPinPage(html: string, pinId: string | null, pinUrl: string): PinInfo {
  let link: string | null = null;
  let title: string | null = null;
  let description: string | null = null;
  let imageUrl: string | null = null;

  for (const data of embeddedJson(html)) {
    walk(data, (o) => {
      const id = o.id ?? o.entityId;
      const matches = pinId ? String(id) === pinId : typeof o.link === "string";
      if (!matches) return false;
      if (typeof o.link === "string" && isExternal(o.link)) link = o.link;
      else if (typeof o.tracked_link === "string" && isExternal(o.tracked_link)) link = o.tracked_link;
      if (typeof o.title === "string" && o.title) title = cleanText(o.title);
      else if (typeof o.grid_title === "string") title = cleanText(o.grid_title);
      if (typeof o.description === "string") description = cleanText(o.description);
      const images = o.images as Record<string, { url?: string }> | undefined;
      if (images && typeof images === "object") imageUrl = images.orig?.url ?? images["736x"]?.url ?? images["474x"]?.url ?? imageUrl;
      return Boolean(link);
    });
    if (link) break;
  }

  if (!link) {
    const seeAlso = metaContent(html, ["og:see_also", "pinterestapp:source"]);
    if (seeAlso && isExternal(seeAlso)) link = seeAlso;
  }
  if (!link) {
    // Last resort: the first outbound "link" value in the page's inline data.
    const re = /"(?:link|tracked_link)"\s*:\s*"(https?:[^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const candidate = JSON.parse(`"${m[1]}"`) as string;
      if (isExternal(candidate)) {
        link = candidate;
        break;
      }
    }
  }

  const summary = pageSummary(html);
  let recipe = extractRecipeFromHtml(html, link ?? pinUrl);
  if (recipe && !recipe.ingredients.length) recipe = null;
  if (!recipe) {
    for (const block of ldJsonBlocks(html)) {
      walk(block, (o) => {
        if (!imageUrl && typeof o.image === "string") imageUrl = o.image;
        return false;
      });
    }
  }
  return {
    link,
    title: title ?? summary.title?.replace(/\s*\|\s*Pinterest$/i, "") ?? null,
    description: description ?? summary.description,
    imageUrl: imageUrl ?? summary.imageUrl,
    recipe,
  };
}
