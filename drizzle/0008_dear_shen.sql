CREATE TABLE `auth_login_attempts` (
	`ip_address` text PRIMARY KEY NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`first_failed_at` text NOT NULL,
	`last_failed_at` text NOT NULL,
	`blocked_until` text
);
--> statement-breakpoint
CREATE INDEX `auth_login_attempts_blocked_until_idx` ON `auth_login_attempts` (`blocked_until`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_hash_unique` ON `auth_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `auth_sessions_expires_at_idx` ON `auth_sessions` (`expires_at`);