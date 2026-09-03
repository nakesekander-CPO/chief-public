CREATE TABLE `connector_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text NOT NULL,
	`email` text NOT NULL,
	`access_token_cipher` text NOT NULL,
	`refresh_token_cipher` text,
	`expires_at` integer NOT NULL,
	`scopes` text NOT NULL,
	`status` text NOT NULL,
	`last_synced_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_connector_owner_workspace_provider` ON `connector_accounts` (`owner_id`,`workspace_id`,`provider`);--> statement-breakpoint
CREATE TABLE `connector_executions` (
	`idempotency_key` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`action_type` text NOT NULL,
	`provider_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_connector_executions_owner_workspace` ON `connector_executions` (`owner_id`,`workspace_id`);--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_oauth_states_owner_expires` ON `oauth_states` (`owner_id`,`expires_at`);