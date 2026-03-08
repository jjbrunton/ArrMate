CREATE TABLE `quality_search_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instance_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`source` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `quality_search_items` (`instance_id`, `item_id`, `source`, `created_at`)
SELECT
	`audit_log`.`instance_id`,
	CAST(`json_each`.`value` AS integer),
	`audit_log`.`source`,
	`audit_log`.`created_at`
FROM `audit_log`,
	json_each(json_extract(`audit_log`.`details`, '$.itemIds'))
WHERE `audit_log`.`action` = 'quality_search_sent'
  AND `audit_log`.`instance_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `quality_search_items_instance_item_created_at_idx` ON `quality_search_items` (`instance_id`,`item_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `cached_episodes` ADD `below_cutoff` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `cached_episodes` ADD `wanted_quality_name` text;--> statement-breakpoint
ALTER TABLE `cached_episodes` ADD `quality_last_search_at` text;--> statement-breakpoint
CREATE INDEX `cached_episodes_instance_below_cutoff_idx` ON `cached_episodes` (`instance_id`,`below_cutoff`);--> statement-breakpoint
CREATE INDEX `cached_episodes_instance_series_external_id_idx` ON `cached_episodes` (`instance_id`,`series_external_id`);--> statement-breakpoint
CREATE INDEX `cached_episodes_instance_monitored_has_file_air_date_idx` ON `cached_episodes` (`instance_id`,`monitored`,`has_file`,`air_date_utc`);--> statement-breakpoint
CREATE INDEX `cached_episodes_instance_external_id_idx` ON `cached_episodes` (`instance_id`,`external_id`);--> statement-breakpoint
ALTER TABLE `cached_movies` ADD `below_cutoff` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `cached_movies` ADD `wanted_quality_name` text;--> statement-breakpoint
ALTER TABLE `cached_movies` ADD `quality_last_search_at` text;--> statement-breakpoint
CREATE INDEX `cached_movies_instance_below_cutoff_idx` ON `cached_movies` (`instance_id`,`below_cutoff`);--> statement-breakpoint
CREATE INDEX `cached_movies_instance_monitored_has_file_idx` ON `cached_movies` (`instance_id`,`monitored`,`has_file`);--> statement-breakpoint
CREATE INDEX `cached_movies_instance_external_id_idx` ON `cached_movies` (`instance_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `audit_log_instance_action_created_at_idx` ON `audit_log` (`instance_id`,`action`,`created_at`);--> statement-breakpoint
CREATE INDEX `cached_series_instance_external_id_idx` ON `cached_series` (`instance_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `cached_series_instance_monitored_idx` ON `cached_series` (`instance_id`,`monitored`);
