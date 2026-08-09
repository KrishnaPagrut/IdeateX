CREATE TABLE "custom_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text DEFAULT 'custom' NOT NULL,
	"subdomain" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"seed_hints" text NOT NULL,
	"prompt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "custom_pools_key_idx" ON "custom_pools" USING btree ("domain","subdomain");