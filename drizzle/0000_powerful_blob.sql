CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instance_id` integer,
	`issue_id` integer,
	`action` text NOT NULL,
	`source` text NOT NULL,
	`details` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`issue_id`) REFERENCES `detected_issues`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `detected_issues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instance_id` integer NOT NULL,
	`queue_item_id` integer,
	`external_queue_id` integer,
	`type` text NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`detected_at` text DEFAULT (datetime('now')) NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`queue_item_id`) REFERENCES `queue_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `instances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`base_url` text NOT NULL,
	`api_key` text NOT NULL,
	`poll_interval_seconds` integer DEFAULT 300 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_health_check` text,
	`last_health_status` text DEFAULT 'unknown',
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `queue_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instance_id` integer NOT NULL,
	`external_id` integer NOT NULL,
	`title` text NOT NULL,
	`status` text,
	`tracked_download_state` text,
	`tracked_download_status` text,
	`status_messages` text,
	`protocol` text,
	`download_client` text,
	`size_bytes` integer,
	`size_left_bytes` integer,
	`timeleft` text,
	`estimated_completion_time` text,
	`first_seen_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_seen_at` text DEFAULT (datetime('now')) NOT NULL,
	`is_gone` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `suggested_fixes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`issue_id` integer NOT NULL,
	`action` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`priority` integer DEFAULT 0 NOT NULL,
	`automatable` integer DEFAULT false NOT NULL,
	`params` text,
	`executed_at` text,
	`execution_result` text,
	FOREIGN KEY (`issue_id`) REFERENCES `detected_issues`(`id`) ON UPDATE no action ON DELETE cascade
);
