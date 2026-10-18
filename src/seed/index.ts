// Typed access to the content that ships with the app.
import type { Episode, Exercise, WhyCard } from "@/lib/types";
import exercisesJson from "./exercises.json";
import episodesJson from "./episodes.json";
import whyCardsJson from "./whyCards.json";

export { sessions, defaultRotation } from "./sessions";

export const exercises = exercisesJson as Exercise[];
export const episodes = episodesJson as Episode[];
export const whyCards = whyCardsJson as WhyCard[];

export const exerciseById = new Map(exercises.map((e) => [e.id, e]));
export const episodeById = new Map(episodes.map((e) => [e.id, e]));
export const whyCardById = new Map(whyCards.map((c) => [c.id, c]));

export const SOURCE_LABEL = "Summarized from official show notes/chapter titles";
export const DOAC_RSS = "https://rss2.flightcast.com/xmsftuzjjykcmqwolaqn6mdn";
