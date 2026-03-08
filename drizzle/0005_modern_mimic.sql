CREATE TABLE `cached_episodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instance_id` integer NOT NULL,
	`series_cache_id` integer NOT NULL,
	`external_id` integer NOT NULL,
	`series_external_id` integer NOT NULL,
	`season_number` integer NOT NULL,
	`episode_number` integer NOT NULL,
	`title` text,
	`air_date_utc` text,
	`monitored` integer DEFAULT true NOT NULL,
	`has_file` integer DEFAULT false NOT NULL,
	`episode_file_quality` text,
	`episode_file_size` integer,
	`synced_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`series_cache_id`) REFERENCES `cached_series`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cached_movies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instance_id` integer NOT NULL,
	`external_id` integer NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`tmdb_id` integer,
	`imdb_id` text,
	`status` text,
	`monitored` integer DEFAULT true NOT NULL,
	`has_file` integer DEFAULT false NOT NULL,
	`quality_profile_id` integer,
	`size_on_disk` integer,
	`root_folder_path` text,
	`path` text,
	`movie_file_quality` text,
	`synced_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cached_series` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instance_id` integer NOT NULL,
	`external_id` integer NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`tvdb_id` integer,
	`imdb_id` text,
	`status` text,
	`series_type` text,
	`monitored` integer DEFAULT true NOT NULL,
	`quality_profile_id` integer,
	`season_count` integer,
	`path` text,
	`root_folder_path` text,
	`total_episode_count` integer,
	`episode_file_count` integer,
	`episode_count` integer,
	`size_on_disk` integer,
	`percent_of_episodes` integer,
	`synced_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `instances` ADD `media_sync_interval_seconds` integer DEFAULT 3600 NOT NULL;--> statement-breakpoint
ALTER TABLE `instances` ADD `last_media_sync_at` text;