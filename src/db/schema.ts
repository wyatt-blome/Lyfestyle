import { boolean, date, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export interface HouseholdSettings {
  people: number;
  /** IANA zone used to decide which week "this week" is */
  timeZone: string;
  store: "walmart" | "sams";
  /** 0 = Sunday */
  weekStartsOn: number;
  /** default meal counts for a new week */
  breakfasts: number;
  lunches: number;
  dinners: number;
}

export const DEFAULT_SETTINGS: HouseholdSettings = {
  people: 4,
  timeZone: "America/Chicago",
  store: "walmart",
  weekStartsOn: 0,
  breakfasts: 0,
  lunches: 0,
  dinners: 5,
};

export const households = pgTable("households", {
  id: id(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  settings: jsonb("settings").$type<HouseholdSettings>().notNull().default(DEFAULT_SETTINGS),
  createdAt: created(),
});

export const users = pgTable("users", {
  id: id(),
  householdId: text("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: created(),
});

export const sessions = pgTable("sessions", {
  /** sha256 of the cookie token */
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const recipes = pgTable(
  "recipes",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    sourceUrl: text("source_url"),
    pinterestUrl: text("pinterest_url"),
    sourceType: text("source_type").$type<"manual" | "link" | "pinterest" | "photo" | "text">().notNull().default("manual"),
    imageUrl: text("image_url"),
    servings: integer("servings"),
    prepMinutes: integer("prep_minutes"),
    cookMinutes: integer("cook_minutes"),
    totalMinutes: integer("total_minutes"),
    /** one line per ingredient as written; parsed when lists are built */
    ingredients: jsonb("ingredients").$type<string[]>().notNull().default([]),
    steps: jsonb("steps").$type<string[]>().notNull().default([]),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    mealTypes: jsonb("meal_types").$type<string[]>().notNull().default(["dinner"]),
    notes: text("notes"),
    /** household rating, 1-5 stars; null = not rated yet */
    rating: integer("rating"),
    isFavorite: boolean("is_favorite").notNull().default(false),
    isStaple: boolean("is_staple").notNull().default(false),
    stapleEveryWeeks: integer("staple_every_weeks"),
    lastPlannedOn: date("last_planned_on", { mode: "string" }),
    timesPlanned: integer("times_planned").notNull().default(0),
    createdBy: text("created_by"),
    createdAt: created(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("recipes_household_idx").on(t.householdId)],
);

export interface WeekRequestJson {
  breakfasts: number;
  lunches: number;
  dinners: number;
  leftoverLunches: number;
  people: number;
  moods: string[];
  note: string;
  includeStaples: boolean;
}

export const mealPlans = pgTable(
  "meal_plans",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    status: text("status").$type<"draft" | "approved">().notNull().default("draft"),
    request: jsonb("request").$type<WeekRequestJson>(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("meal_plans_week_idx").on(t.householdId, t.weekStart)],
);

export const planMeals = pgTable(
  "plan_meals",
  {
    id: id(),
    planId: text("plan_id")
      .notNull()
      .references(() => mealPlans.id, { onDelete: "cascade" }),
    mealType: text("meal_type").$type<"breakfast" | "lunch" | "dinner">().notNull(),
    position: integer("position").notNull().default(0),
    /** 0-6 from the week start; null = any day */
    day: integer("day"),
    recipeId: text("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
    servings: integer("servings"),
    /** a lunch eaten from this dinner's leftovers: the dinner is cooked bigger */
    leftoverOfId: text("leftover_of_id"),
    note: text("note"),
  },
  (t) => [index("plan_meals_plan_idx").on(t.planId)],
);

export interface ItemSource {
  recipeId: string;
  title: string;
  text: string;
}

export const groceryItems = pgTable(
  "grocery_items",
  {
    id: id(),
    planId: text("plan_id")
      .notNull()
      .references(() => mealPlans.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    aisle: text("aisle").notNull(),
    needText: text("need_text").notNull(),
    /** what to buy at each store, worked out when the list was made */
    buyWalmart: text("buy_walmart"),
    buySams: text("buy_sams"),
    leftoverWalmart: jsonb("leftover_walmart").$type<{ text: string; waste: number } | null>(),
    leftoverSams: jsonb("leftover_sams").$type<{ text: string; waste: number } | null>(),
    sources: jsonb("sources").$type<ItemSource[]>().notNull().default([]),
    pantry: boolean("pantry").notNull().default(false),
    /** added by hand, not from a recipe */
    manual: boolean("manual").notNull().default(false),
    /** "have" = already in the kitchen; "need" = still to get */
    status: text("status").$type<"have" | "need">().notNull().default("need"),
    inCart: boolean("in_cart").notNull().default(false),
    updatedBy: text("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("grocery_items_plan_idx").on(t.planId)],
);

/** "Can we have …?" A household member asks for a recipe, or describes an idea. */
export const mealRequests = pgTable(
  "meal_requests",
  {
    id: id(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    recipeId: text("recipe_id").references(() => recipes.id, { onDelete: "cascade" }),
    /** an idea in words when there's no recipe: "something with shrimp" */
    text: text("text"),
    requestedBy: text("requested_by"),
    /** the week asked for; null = whenever */
    weekStart: date("week_start", { mode: "string" }),
    status: text("status").$type<"open" | "planned" | "dismissed">().notNull().default("open"),
    planId: text("plan_id"),
    createdAt: created(),
  },
  (t) => [index("meal_requests_household_idx").on(t.householdId)],
);

/** Things this household always keeps on hand (beyond the built-in pantry basics). */
export const pantryItems = pgTable(
  "pantry_items",
  {
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    /** true = always have it; false = a built-in basic the household does NOT keep */
    onHand: boolean("on_hand").notNull().default(true),
  },
  (t) => [uniqueIndex("pantry_items_idx").on(t.householdId, t.key)],
);

/** The exact store product the household picked for an item, so the next order links straight to it. */
export const storeProducts = pgTable(
  "store_products",
  {
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    store: text("store").$type<"walmart" | "sams">().notNull(),
    key: text("key").notNull(),
    productUrl: text("product_url").notNull(),
    itemId: text("item_id"),
    label: text("label"),
    quantity: real("quantity"),
  },
  (t) => [uniqueIndex("store_products_idx").on(t.householdId, t.store, t.key)],
);

export type Household = typeof households.$inferSelect;
export type User = typeof users.$inferSelect;
export type Recipe = typeof recipes.$inferSelect;
export type MealPlan = typeof mealPlans.$inferSelect;
export type PlanMeal = typeof planMeals.$inferSelect;
export type GroceryItem = typeof groceryItems.$inferSelect;
export type StoreProduct = typeof storeProducts.$inferSelect;
export type MealRequest = typeof mealRequests.$inferSelect;
