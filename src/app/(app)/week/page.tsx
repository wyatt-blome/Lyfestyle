import Link from "next/link";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/PageHeader";
import { addDays, formatWeek, isIsoDate, weekStartFor } from "@/lib/dates";
import { buildGroceryList } from "@/lib/ingredients/grocery";
import { recipeImageSrc } from "@/lib/images";
import { inferMealTypes } from "@/lib/moods";
import { recipeTime } from "@/lib/time";
import { riskyLeftovers } from "@/lib/planner";
import { requireViewer } from "@/server/auth";
import { RequestMealButton, RequestsCard, type OpenRequest } from "@/components/RequestMeal";
import { currentWeekStart, getPlan, householdRecipes, openRequests, pantryOverrides, plannedRecipes } from "@/server/data";
import { PlanWizard } from "./PlanWizard";
import { WeekPlan, type MealView, type RecipeLite } from "./WeekPlan";

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ start?: string; replan?: string }> }) {
  const viewer = await requireViewer();
  const { settings } = viewer.household;
  const params = await searchParams;
  const thisWeek = currentWeekStart(settings);
  const weekStart = isIsoDate(params.start) ? weekStartFor(params.start, settings.weekStartsOn) : thisWeek;

  const [found, recipes] = await Promise.all([getPlan(viewer.household.id, weekStart), householdRecipes(viewer.household.id)]);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const lite: RecipeLite[] = recipes.map((r) => ({
    id: r.id,
    title: r.title,
    imageUrl: recipeImageSrc(r),
    mealTypes: r.mealTypes.length ? r.mealTypes : inferMealTypes(r),
    totalMinutes: recipeTime(r)?.total ?? null,
    timeEstimated: recipeTime(r)?.estimated ?? false,
    rating: r.rating,
    isFavorite: r.isFavorite,
    isStaple: r.isStaple,
  }));

  const label = weekStart === thisWeek ? "This week" : weekStart === addDays(thisWeek, 7) ? "Next week" : weekStart < thisWeek ? "Past week" : "Upcoming week";
  const nav = (
    <div className="flex items-center gap-1">
      <Link href={`/week?start=${addDays(weekStart, -7)}`} aria-label="Previous week" className="grid size-10 place-items-center rounded-full border border-line bg-surface">
        <Icon name="chevronLeft" />
      </Link>
      <Link href={`/week?start=${addDays(weekStart, 7)}`} aria-label="Next week" className="grid size-10 place-items-center rounded-full border border-line bg-surface">
        <Icon name="chevronRight" />
      </Link>
    </div>
  );

  const header = <PageHeader title={label} subtitle={formatWeek(weekStart)} action={nav} />;

  // Meal requests from the household, shown above the plan.
  const pending = await openRequests(viewer.household.id, weekStart);
  const requests: OpenRequest[] = pending.map((r) => ({
    id: r.id,
    recipeId: r.recipeId,
    title: r.recipeId ? (byId.get(r.recipeId)?.title ?? "A recipe") : (r.text ?? ""),
    isIdea: !r.recipeId,
    requestedBy: r.requestedBy,
    forWeek: r.weekStart === weekStart,
  }));
  const requestBar = (planning: boolean) => (
    <div className="mb-5 flex flex-col gap-3">
      <RequestsCard requests={requests} weekStart={weekStart} canPlan={!planning} />
      {planning && requests.length ? <p className="-mt-1 text-xs text-muted">Requests are included automatically when you plan the week.</p> : null}
      <RequestMealButton
        recipes={lite.map((r) => ({ id: r.id, title: r.title, imageUrl: r.imageUrl }))}
        thisWeek={weekStart}
        nextWeek={addDays(weekStart, 7)}
        className="self-start"
      />
    </div>
  );

  if (!found || params.replan === "1" || (!found.meals.length && found.plan.status === "draft" && !found.plan.request)) {
    const prev = found?.plan.request;
    return (
      <>
        {header}
        {requestBar(true)}
        <PlanWizard
          weekStart={weekStart}
          recipeCount={recipes.length}
          replanning={Boolean(found?.meals.length)}
          defaults={{
            breakfasts: prev?.breakfasts ?? settings.breakfasts,
            lunches: prev?.lunches ?? settings.lunches,
            dinners: prev?.dinners ?? settings.dinners,
            leftoverLunches: prev?.leftoverLunches ?? 0,
            people: prev?.people ?? settings.people,
            moods: prev?.moods ?? [],
            note: prev?.note ?? "",
            includeStaples: prev?.includeStaples ?? true,
          }}
        />
      </>
    );
  }

  const { plan, meals } = found;
  const people = plan.request?.people ?? settings.people;
  const mealViews: MealView[] = meals.map((m) => {
    const r = m.recipeId ? byId.get(m.recipeId) : undefined;
    const leftoversOf = m.leftoverOfId ? meals.find((x) => x.id === m.leftoverOfId) : undefined;
    const leftoverRecipe = leftoversOf?.recipeId ? byId.get(leftoversOf.recipeId) : undefined;
    return {
      id: m.id,
      mealType: m.mealType,
      day: m.day,
      servings: m.servings ?? people,
      extraServings: meals.filter((x) => x.leftoverOfId === m.id).reduce((n, x) => n + (x.servings ?? people), 0),
      recipe: r ? lite.find((l) => l.id === r.id)! : null,
      leftoversOf: leftoversOf ? { id: leftoversOf.id, day: leftoversOf.day, title: leftoverRecipe?.title ?? "dinner" } : null,
    };
  });

  const { keys } = await pantryOverrides(viewer.household.id);
  const lines = buildGroceryList(plannedRecipes(meals, byId, people), settings.store, keys);
  const leftovers = riskyLeftovers(lines)
    .slice(0, 5)
    .map((l) => ({ name: l.name, text: l.leftover!.text }));

  return (
    <>
      {header}
      {requestBar(false)}
      <WeekPlan
        planId={plan.id}
        weekStart={weekStart}
        status={plan.status}
        approvedBy={plan.approvedBy}
        hasList={Boolean(plan.approvedAt)}
        meals={mealViews}
        recipes={lite}
        leftovers={leftovers}
        store={settings.store}
        request={plan.request}
      />
    </>
  );
}
