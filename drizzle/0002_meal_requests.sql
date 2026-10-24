CREATE TABLE "meal_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"recipe_id" text,
	"text" text,
	"requested_by" text,
	"week_start" date,
	"status" text DEFAULT 'open' NOT NULL,
	"plan_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_requests" ADD CONSTRAINT "meal_requests_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_requests" ADD CONSTRAINT "meal_requests_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meal_requests_household_idx" ON "meal_requests" USING btree ("household_id");