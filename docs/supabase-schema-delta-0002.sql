-- IdeateX schema delta 0002 — persona pools & persona budget
-- Paste into: Supabase Dashboard → SQL Editor → Run
-- (Run AFTER the earlier supabase-schema.sql)

ALTER TABLE "personas" ADD COLUMN "domain" text DEFAULT 'general' NOT NULL;
ALTER TABLE "personas" ADD COLUMN "subdomain" text DEFAULT 'general' NOT NULL;
ALTER TABLE "runs" ADD COLUMN "persona_budget" integer;
CREATE INDEX "personas_pool_idx" ON "personas" USING btree ("domain","subdomain");