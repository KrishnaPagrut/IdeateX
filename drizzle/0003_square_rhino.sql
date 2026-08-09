ALTER TABLE "runs" ADD COLUMN "product_name" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "target_audience" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "objective" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "audience" jsonb;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "strategies" jsonb;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "race" jsonb;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "advisor_report" jsonb;