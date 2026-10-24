import { count, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/PageHeader";
import { aiAvailable } from "@/lib/import/ai";
import { CATALOG } from "@/lib/ingredients/catalog";
import { requireViewer } from "@/server/auth";
import { DeleteAllRecipes } from "./DeleteAllRecipes";
import { HouseholdSettingsForm } from "./HouseholdSettingsForm";

export default async function HouseholdPage() {
  const viewer = await requireViewer();
  const db = await getDb();
  const [members, pantry] = await Promise.all([
    db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.householdId, viewer.household.id)),
    db.select().from(schema.pantryItems).where(eq(schema.pantryItems.householdId, viewer.household.id)),
  ]);
  const [{ n: recipeCount }] = await db.select({ n: count() }).from(schema.recipes).where(eq(schema.recipes.householdId, viewer.household.id));
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const basics = CATALOG.filter((c) => c.pantry).map((c) => ({ key: c.key, name: c.name }));
  return (
    <>
      <PageHeader title="Household" subtitle={viewer.household.name} />
      <HouseholdSettingsForm
        name={viewer.household.name}
        settings={viewer.household.settings}
        inviteCode={viewer.household.inviteCode}
        inviteLink={`${origin}/signup?code=${viewer.household.inviteCode}`}
        members={members}
        me={viewer.user.id}
        pantry={pantry.map((p) => ({ key: p.key, name: p.name, onHand: p.onHand }))}
        basics={basics}
        aiEnabled={aiAvailable()}
      />
      <div className="mt-5">
        <DeleteAllRecipes count={recipeCount} />
      </div>
    </>
  );
}
