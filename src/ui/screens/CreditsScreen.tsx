import { episodes } from "@/seed";
import { Card, Page } from "../kit";

const SOURCES = [
  {
    name: "ExerciseDB by AscendAPI",
    url: "https://exercisedb.dev",
    note: "Exercise demo GIFs, personal/non-commercial use.",
  },
  {
    name: "wger.de",
    url: "https://wger.de",
    note: "Exercise images, CC BY-SA 4.0.",
  },
  {
    name: "Open Food Facts",
    url: "https://world.openfoodfacts.org",
    note: "Barcode food data, ODbL (Phase 3).",
  },
  {
    name: "USDA FoodData Central",
    url: "https://fdc.nal.usda.gov",
    note: "Food search (Phase 3).",
  },
  {
    name: "The Diary Of A CEO",
    url: "https://www.youtube.com/@TheDiaryOfACEO",
    note: "Episode summaries come from official show notes and chapter titles; no transcripts are stored.",
  },
  {
    name: "NTNU CERG",
    url: "https://www.ntnu.edu/cerg/advice",
    note: "Norwegian 4×4 protocol, timings and heart-rate targets.",
  },
];

export function CreditsScreen() {
  return (
    <Page title="Credits" back="/settings">
      {SOURCES.map((s) => (
        <Card key={s.name}>
          <a href={s.url} target="_blank" rel="noreferrer" className="text-lg font-semibold text-info underline">
            {s.name}
          </a>
          <p className="text-base text-muted">{s.note}</p>
        </Card>
      ))}
      <Card title="Linked Diary of a CEO episodes">
        <ul className="flex flex-col gap-2 text-base">
          {[...episodes]
            .sort((a, b) => a.guest.localeCompare(b.guest) || a.date.localeCompare(b.date))
            .map((e) => (
              <li key={e.id}>
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noreferrer" className="text-info underline">
                    {e.guest} ({e.date})
                  </a>
                ) : (
                  <span>
                    {e.guest} ({e.date}) · podcast feed
                  </span>
                )}
                <span className="text-muted"> · {e.title}</span>
              </li>
            ))}
        </ul>
      </Card>
    </Page>
  );
}
