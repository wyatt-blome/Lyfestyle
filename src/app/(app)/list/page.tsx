import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui";
import { formatWeek, isIsoDate, weekStartFor } from "@/lib/dates";
import { sortLines } from "@/lib/ingredients/grocery";
import type { Aisle } from "@/lib/ingredients/catalog";
import { walmartLookupAvailable } from "@/lib/walmart";
import { requireViewer } from "@/server/auth";
import { currentWeekStart, getPlan } from "@/server/data";
import { ListView } from "./ListView";

export default async function ListPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const viewer = await requireViewer();
  const { settings } = viewer.household;
  const { week } = await searchParams;
  const weekStart = isIsoDate(week) ? weekStartFor(week, settings.weekStartsOn) : currentWeekStart(settings);
  const found = await getPlan(viewer.household.id, weekStart);

  if (!found?.plan.approvedAt) {
    return (
      <>
        <PageHeader title="Grocery list" subtitle={formatWeek(weekStart)} />
        <EmptyState icon="cart" title="No list yet for this week">
          <p className="max-w-sm text-sm text-muted">Plan the week and approve it. The list is built from the meals you pick.</p>
          <Link href={`/week?start=${weekStart}`} className="mt-2 inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 font-medium text-brand-ink">
            <Icon name="calendar" /> Plan this week
          </Link>
        </EmptyState>
      </>
    );
  }

  const db = await getDb();
  const [items, products] = await Promise.all([
    db.select().from(schema.groceryItems).where(eq(schema.groceryItems.planId, found.plan.id)),
    db.select().from(schema.storeProducts).where(and(eq(schema.storeProducts.householdId, viewer.household.id))),
  ]);
  const sorted = sortLines(items.map((i) => ({ ...i, aisle: i.aisle as Aisle })));

  return (
    <>
      <PageHeader title="Grocery list" subtitle={formatWeek(weekStart)} />
      {found.plan.status === "draft" ? (
        <Link href={`/week?start=${weekStart}`} className="mb-4 block rounded-2xl border border-warn/30 bg-warn-soft p-3 text-sm">
          The plan changed after this list was made. <strong>Approve the plan again</strong> to update it.
        </Link>
      ) : null}
      <ListView
        planId={found.plan.id}
        store={settings.store}
        items={sorted.map((i) => ({
          id: i.id,
          key: i.key,
          name: i.name,
          aisle: i.aisle,
          needText: i.needText,
          buyWalmart: i.buyWalmart,
          buySams: i.buySams,
          leftoverWalmart: i.leftoverWalmart,
          leftoverSams: i.leftoverSams,
          sources: i.sources,
          pantry: i.pantry,
          manual: i.manual,
          status: i.status,
          inCart: i.inCart,
          updatedBy: i.updatedBy,
        }))}
        products={products.map((p) => ({ store: p.store, key: p.key, productUrl: p.productUrl, itemId: p.itemId }))}
        walmartLookup={walmartLookupAvailable()}
      />
    </>
  );
}
