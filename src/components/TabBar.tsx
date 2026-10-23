"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";
import { cx } from "./ui";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/week", label: "This week", icon: "calendar" },
  { href: "/recipes", label: "Recipes", icon: "book" },
  { href: "/list", label: "List", icon: "cart" },
  { href: "/household", label: "Household", icon: "users" },
];

export function TabBar() {
  const path = usePathname();
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur" aria-label="Main">
      <ul className="mx-auto grid max-w-3xl grid-cols-4">
        {TABS.map((t) => {
          const active = path === t.href || path.startsWith(t.href + "/");
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cx("flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium", active ? "text-brand" : "text-muted")}
              >
                <Icon name={t.icon} className="size-6" />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
