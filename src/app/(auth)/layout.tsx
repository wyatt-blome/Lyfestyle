import { redirect } from "next/navigation";
import { getViewer } from "@/server/auth";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getViewer()) redirect("/week");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-2xl bg-brand text-brand-ink">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
            <path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19c3-4 6-7 10-9" />
          </svg>
        </div>
        <div>
          <p className="font-display text-2xl font-semibold">Meal Planner</p>
          <p className="text-sm text-muted">Plan the week. Shop once. Waste less.</p>
        </div>
      </div>
      {children}
    </main>
  );
}
