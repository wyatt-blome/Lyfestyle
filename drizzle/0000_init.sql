CREATE TABLE "grocery_items" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"aisle" text NOT NULL,
	"need_text" text NOT NULL,
	"buy_walmart" text,
	"buy_sams" text,
	"leftover_walmart" jsonb,
	"leftover_sams" jsonb,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pantry" boolean DEFAULT false NOT NULL,
	"manual" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'need' NOT NULL,
	"in_cart" boolean DEFAULT false NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"invite_code" text NOT NULL,
	"settings" jsonb DEFAULT '{"people":4,"timeZone":"America/Chicago","store":"walmart","weekStartsOn":0,"breakfasts":0,"lunches":0,"dinners":5}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "households_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "meal_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"week_start" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"request" jsonb,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pantry_items" (
	"household_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"on_hand" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_meals" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"meal_type" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"day" integer,
	"recipe_id" text,
	"servings" integer,
	"leftover_of_id" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"source_url" text,
	"pinterest_url" text,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"image_url" text,
	"servings" integer,
	"prep_minutes" integer,
	"cook_minutes" integer,
	"total_minutes" integer,
	"ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meal_types" jsonb DEFAULT '["dinner"]'::jsonb NOT NULL,
	"notes" text,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"is_staple" boolean DEFAULT false NOT NULL,
	"staple_every_weeks" integer,
	"last_planned_on" date,
	"times_planned" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_products" (
	"household_id" text NOT NULL,
	"store" text NOT NULL,
	"key" text NOT NULL,
	"product_url" text NOT NULL,
	"item_id" text,
	"label" text,
	"quantity" real
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "grocery_items" ADD CONSTRAINT "grocery_items_plan_id_meal_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_meals" ADD CONSTRAINT "plan_meals_plan_id_meal_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_meals" ADD CONSTRAINT "plan_meals_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grocery_items_plan_idx" ON "grocery_items" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_plans_week_idx" ON "meal_plans" USING btree ("household_id","week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "pantry_items_idx" ON "pantry_items" USING btree ("household_id","key");--> statement-breakpoint
CREATE INDEX "plan_meals_plan_idx" ON "plan_meals" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "recipes_household_idx" ON "recipes" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "store_products_idx" ON "store_products" USING btree ("household_id","store","key");