"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// 24 px line icons (stroke follows the text colour). Text glyphs rendered unevenly across phones.
const ICONS: Record<string, React.ReactNode> = {
  home: <path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5" />,
  fast: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 5V3M9.5 3h5M12 13V8.5M12 13l3 2" />
    </>
  ),
  log: (
    <>
      <path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5" />
      <path d="M17 21V3c-2 1-3 3.5-3 6.5V13h3" />
    </>
  ),
  train: (
    <>
      <path d="M8.5 9a3.5 3.5 0 0 1 7 0" />
      <path d="M7 10h10l1.5 5.5A5 5 0 0 1 13.7 21h-3.4a5 5 0 0 1-4.8-5.5Z" />
    </>
  ),
  more: <path d="M4 7h16M4 12h16M4 17h16" />,
};

const TABS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/fast", label: "Fast", icon: "fast" },
  { href: "/log", label: "Log", icon: "log" },
  { href: "/train", label: "Train", icon: "train" },
  { href: "/more", label: "More", icon: "more" },
];

export function TabBar() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
  const moreActive = ["/more", "/why", "/settings", "/progress"].some((p) => path.startsWith(p));
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {TABS.map((t) => {
          const on = t.href === "/more" ? moreActive : active(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-sm ${on ? "text-accent" : "text-muted"}`}
              >
                <svg aria-hidden viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {ICONS[t.icon]}
                </svg>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
