import Link from "next/link";
import { Page } from "../kit";

const LINKS = [
  { href: "/fast/history", label: "Fast history", sub: "Heatmap, streaks, averages" },
  { href: "/why", label: "Why we do this", sub: "Every card, with expert references" },
  { href: "/why/episodes", label: "Episodes", sub: "Diary of a CEO episodes and your notes" },
  { href: "/settings", label: "Settings", sub: "Age, protocol, gear, reminders, backup" },
  { href: "/settings/credits", label: "Credits", sub: "Demo and content sources" },
];

export function MoreScreen() {
  return (
    <Page title="More">
      <ul className="flex flex-col gap-3">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="btn flex min-h-16 flex-col justify-center rounded-3xl bg-surface px-4 py-3">
              <span className="text-lg font-semibold">{l.label}</span>
              <span className="text-base text-muted">{l.sub}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
