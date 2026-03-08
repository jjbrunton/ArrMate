ALTER TABLE `instances` ADD `quality_check_max_items` integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `instances` ADD `last_quality_check_at` text;