PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_source_items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text DEFAULT 'GOOGLE' NOT NULL,
	`external_id` text,
	`content_type` text NOT NULL,
	`title` text NOT NULL,
	`normalized_text` text NOT NULL,
	`content_hash` text NOT NULL,
	`trust_state` text NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_source_items`("id", "workspace_id", "provider", "external_id", "content_type", "title", "normalized_text", "content_hash", "trust_state", "created_at", "deleted_at") SELECT "id", "workspace_id", "provider", "external_id", "content_type", "title", "normalized_text", "content_hash", "trust_state", "created_at", "deleted_at" FROM `source_items`;--> statement-breakpoint
DROP TABLE `source_items`;--> statement-breakpoint
ALTER TABLE `__new_source_items` RENAME TO `source_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_source_items_workspace_created` ON `source_items` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_source_items_workspace_provider_external` ON `source_items` (`workspace_id`,`provider`,`external_id`);--> statement-breakpoint
CREATE TABLE `__new_connector_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text DEFAULT 'GOOGLE' NOT NULL,
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
INSERT INTO `__new_connector_accounts`("id", "owner_id", "workspace_id", "provider", "email", "access_token_cipher", "refresh_token_cipher", "expires_at", "scopes", "status", "last_synced_at", "created_at", "updated_at") SELECT "id", "owner_id", "workspace_id", "provider", "email", "access_token_cipher", "refresh_token_cipher", "expires_at", "scopes", "status", "last_synced_at", "created_at", "updated_at" FROM `connector_accounts`;--> statement-breakpoint
DROP TABLE `connector_accounts`;--> statement-breakpoint
ALTER TABLE `__new_connector_accounts` RENAME TO `connector_accounts`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_connector_owner_workspace_provider` ON `connector_accounts` (`owner_id`,`workspace_id`,`provider`);--> statement-breakpoint
ALTER TABLE `connector_executions` ADD `provider` text DEFAULT 'GOOGLE' NOT NULL;--> statement-breakpoint
ALTER TABLE `oauth_states` ADD `provider` text DEFAULT 'GOOGLE' NOT NULL;--> statement-breakpoint
PRAGMA optimize;
