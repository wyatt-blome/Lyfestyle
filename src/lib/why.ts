// Resolves "Why we do this" cards by `appliesTo` key and builds chapter deep links.
import type { Episode, ProtocolId, WhyCard, WhyRef } from "./types";
import { chapterSeconds } from "./time";

/** Keys a fasting protocol shows cards for. Custom fasts borrow the nearest protocol's card. */
export function protocolKeys(protocol: ProtocolId, targetHours: number): string[] {
  if (protocol !== "custom") return [`fasting:${protocol}`];
  const keys = ["fasting:custom"];
  if (targetHours >= 36) keys.push("fasting:custom>36h");
  else if (targetHours >= 24) keys.push("fasting:24h");
  else if (targetHours >= 23) keys.push("fasting:OMAD");
  else if (targetHours >= 17) keys.push("fasting:18:6");
  else keys.push("fasting:16:8");
  return keys;
}

export function cardsFor(cards: WhyCard[], keys: string | string[]): WhyCard[] {
  const want = new Set(Array.isArray(keys) ? keys : [keys]);
  return cards.filter((c) => c.appliesTo.some((k) => want.has(k)));
}

export interface ResolvedRef {
  ref: WhyRef;
  episode: Episode;
  chapterTitle?: string;
  /** Deep link at the chapter time, or the episode link; null for feed-only episodes. */
  href: string | null;
}

export function deepLink(episode: Episode, t?: string): string | null {
  if (!episode.url) return null;
  if (!t) return episode.url;
  const sep = episode.url.includes("?") ? "&" : "?";
  return `${episode.url}${sep}t=${chapterSeconds(t)}s`;
}

export function resolveRefs(card: WhyCard, episodes: Map<string, Episode>): ResolvedRef[] {
  const out: ResolvedRef[] = [];
  for (const ref of card.refs) {
    const episode = episodes.get(ref.episodeId);
    if (!episode) continue;
    const chapter = ref.t ? episode.chapters.find((c) => c.t === ref.t) : undefined;
    out.push({ ref, episode, chapterTitle: chapter?.title, href: deepLink(episode, ref.t) });
  }
  return out;
}
