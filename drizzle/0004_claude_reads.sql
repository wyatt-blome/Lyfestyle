CREATE TABLE "photo_reads" (
	"household_id" text NOT NULL,
	"hash" text NOT NULL,
	"parts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "read_with" text;--> statement-breakpoint
ALTER TABLE "photo_reads" ADD CONSTRAINT "photo_reads_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "photo_reads_idx" ON "photo_reads" USING btree ("household_id","hash");