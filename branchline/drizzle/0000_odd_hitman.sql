CREATE TABLE `generation_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`generation_id` text NOT NULL,
	`job_id` text,
	`kind` text DEFAULT 'image' NOT NULL,
	`r2_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`width` integer,
	`height` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`generation_id`) REFERENCES `generations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `generation_jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `generation_assets_generation_idx` ON `generation_assets` (`generation_id`);--> statement-breakpoint
CREATE INDEX `generation_assets_job_idx` ON `generation_assets` (`job_id`);--> statement-breakpoint
CREATE TABLE `generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`generation_id` text NOT NULL,
	`output_index` integer NOT NULL,
	`status` text NOT NULL,
	`provider_request_id` text,
	`polling_url` text,
	`cost_credits` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`generation_id`) REFERENCES `generations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `generation_jobs_generation_idx` ON `generation_jobs` (`generation_id`);--> statement-breakpoint
CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`created_by` text NOT NULL,
	`status` text NOT NULL,
	`origin` text DEFAULT 'live' NOT NULL,
	`model_id` text NOT NULL,
	`prompt` text NOT NULL,
	`parameters_json` text NOT NULL,
	`output_count` integer NOT NULL,
	`cost_credits` text,
	`latency_ms` integer,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `generations_workspace_created_idx` ON `generations` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'owner' NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workspace_members_user_idx` ON `workspace_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
