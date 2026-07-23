CREATE TABLE `user_states` (
	`user_id` text PRIMARY KEY NOT NULL,
	`context` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `deleted_at` text;