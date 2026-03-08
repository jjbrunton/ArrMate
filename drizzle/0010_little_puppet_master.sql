CREATE TABLE `imported_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instance_id` integer NOT NULL,
	`external_id` integer NOT NULL,
	`media_type` text NOT NULL,
	`title` text NOT NULL,
	`tmdb_id` integer,
	`request_status` integer,
	`media_status` integer,
	`status` text NOT NULL,
	`requested_by_display_name` text NOT NULL,
	`requested_by_email` text,
	`requested_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `imported_requests_instance_external_id_idx` ON `imported_requests` (`instance_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `imported_requests_instance_status_requested_at_idx` ON `imported_requests` (`instance_id`,`status`,`requested_at`);--> statement-breakpoint
ALTER TABLE `instances` ADD `request_sync_interval_seconds` integer;--> statement-breakpoint
ALTER TABLE `instances` ADD `last_request_sync_at` text;