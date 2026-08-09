ALTER TABLE "personas" ADD COLUMN "domain" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "subdomain" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "persona_budget" integer;--> statement-breakpoint
CREATE INDEX "personas_pool_idx" ON "personas" USING btree ("domain","subdomain");