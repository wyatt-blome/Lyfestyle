import { describe, expect, it } from "vitest";
import { episodeById, episodes, exerciseById, exercises, sessions, whyCardById, whyCards } from "./index";
import { cardsFor, deepLink, protocolKeys, resolveRefs } from "@/lib/why";
import { PROTOCOLS } from "@/lib/fasting";

describe("seed content", () => {
  it("has unique ids", () => {
    expect(new Set(exercises.map((e) => e.id)).size).toBe(exercises.length);
    expect(new Set(episodes.map((e) => e.id)).size).toBe(episodes.length);
    expect(new Set(whyCards.map((c) => c.id)).size).toBe(whyCards.length);
    expect(exercises.length).toBeGreaterThanOrEqual(43);
    expect(episodes).toHaveLength(19);
    expect(whyCards).toHaveLength(17);
  });

  it("resolves every why-card ref to an episode and chapter", () => {
    for (const card of whyCards) {
      expect(card.refs.length, card.id).toBeGreaterThan(0);
      for (const ref of card.refs) {
        const ep = episodeById.get(ref.episodeId);
        expect(ep, `${card.id} → ${ref.episodeId}`).toBeDefined();
        if (ref.t) {
          expect(
            ep!.chapters.some((c) => c.t === ref.t),
            `${card.id} → ${ref.episodeId}@${ref.t}`,
          ).toBe(true);
        }
      }
    }
  });

  it("gives every protocol and every session a card with a deep link", () => {
    const keys = [
      ...PROTOCOLS.map((p) => protocolKeys(p.id, p.id === "custom" ? 40 : p.targetHours)),
      ...sessions.map((s) => [`session:${s.id}`]),
    ];
    for (const k of keys) {
      const cards = cardsFor(whyCards, k);
      expect(cards.length, k.join()).toBeGreaterThan(0);
      const links = cards.flatMap((c) => resolveRefs(c, episodeById)).filter((r) => r.ref.t && r.href);
      expect(links.length, k.join()).toBeGreaterThan(0);
    }
  });

  it("links sessions to existing cards and exercises", () => {
    for (const s of sessions) {
      for (const id of s.whyCardIds) expect(whyCardById.has(id), `${s.id} → ${id}`).toBe(true);
      for (const b of [...s.blocks, ...s.shortDay.blocks]) {
        for (const it of b.items) expect(exerciseById.has(it.exerciseId), `${s.id} → ${it.exerciseId}`).toBe(true);
      }
      for (const [from, to] of Object.entries(s.swaps)) {
        expect(exerciseById.has(from) && exerciseById.has(to), `${s.id} swap ${from}`).toBe(true);
      }
    }
    for (const e of exercises) for (const s of e.swapIds) expect(exerciseById.has(s), `${e.id} → ${s}`).toBe(true);
  });

  it("builds chapter deep links in seconds", () => {
    const attia = episodeById.get("attia-2025")!;
    expect(deepLink(attia, "1:30:59")).toBe("https://www.youtube.com/watch?v=ZxXruY7llcc&t=5459s");
    expect(deepLink(attia, "40:32")).toBe("https://www.youtube.com/watch?v=ZxXruY7llcc&t=2432s");
  });

  it("keeps the required warnings on OMAD and protein", () => {
    expect(whyCardById.get("why-fast-omad")!.unverified).toBeTruthy();
    expect(whyCardById.get("why-protein")!.disagreement).toBe(true);
  });

  it("gives every exercise cues, faults and a demo or a cues-only state", () => {
    for (const e of exercises) {
      expect(e.cues.length, e.id).toBeGreaterThanOrEqual(3);
      expect(e.faults.length, e.id).toBeGreaterThanOrEqual(2);
      if (e.media.primary === "exercisedb") expect(e.media.gifUrl, e.id).toMatch(/^https:\/\/static\.exercisedb\.dev\//);
      if (e.media.primary === "wger") expect(e.media.imageUrl, e.id).toMatch(/^https:\/\/wger\.de\//);
    }
  });
});
