CREATE TABLE "imported_photos" (
	"household_id" text NOT NULL,
	"hash" text NOT NULL,
	"recipe_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "imported_photos" ADD CONSTRAINT "imported_photos_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_photos" ADD CONSTRAINT "imported_photos_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "imported_photos_idx" ON "imported_photos" USING btree ("household_id","hash");