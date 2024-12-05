CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text(36) NOT NULL,
	`name` text,
	`email` text,
	`token` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`context` text,
	`environment` text,
	`google_access_token` text,
	`google_refresh_token` text,
	`google_token_expiry` integer,
	`spotify_access_token` text,
	`spotify_refresh_token` text,
	`spotify_token_expiry` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_uuid_unique` ON `users` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_token_unique` ON `users` (`token`);--> statement-breakpoint
CREATE TABLE `tools` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`instruction` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tools_uuid_unique` ON `tools` (`uuid`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`user_id` text,
	`name` text,
	`status` text DEFAULT 'active',
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`uuid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_uuid_unique` ON `conversations` (`uuid`);--> statement-breakpoint
CREATE TABLE `memories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text(36) NOT NULL,
	`name` text NOT NULL,
	`category_uuid` text NOT NULL,
	`document_uuid` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`category_uuid`) REFERENCES `categories`(`uuid`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_uuid`) REFERENCES `documents`(`uuid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memories_uuid_unique` ON `memories` (`uuid`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`conversation_uuid` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`description` text,
	`scheduled_for` text,
	`completed_at` text,
	`result` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`conversation_uuid`) REFERENCES `conversations`(`uuid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_uuid_unique` ON `tasks` (`uuid`);--> statement-breakpoint
CREATE TABLE `actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`task_uuid` text NOT NULL,
	`tool_uuid` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`payload` text,
	`result` text,
	`sequence` integer,
	`status` text DEFAULT 'pending',
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`task_uuid`) REFERENCES `tasks`(`uuid`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tool_uuid`) REFERENCES `tools`(`uuid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `actions_uuid_unique` ON `actions` (`uuid`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`conversation_uuid` text,
	`role` text NOT NULL,
	`content_type` text NOT NULL,
	`content` text,
	`multipart` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`conversation_uuid`) REFERENCES `conversations`(`uuid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_uuid_unique` ON `messages` (`uuid`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`source_uuid` text NOT NULL,
	`conversation_uuid` text,
	`text` text NOT NULL,
	`metadata` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`conversation_uuid`) REFERENCES `conversations`(`uuid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_uuid_unique` ON `documents` (`uuid`);--> statement-breakpoint
CREATE TABLE `message_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_uuid` text NOT NULL,
	`document_uuid` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`message_uuid`) REFERENCES `messages`(`uuid`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_uuid`) REFERENCES `documents`(`uuid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `action_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`action_uuid` text NOT NULL,
	`document_uuid` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`action_uuid`) REFERENCES `actions`(`uuid`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_uuid`) REFERENCES `documents`(`uuid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `conversation_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_uuid` text NOT NULL,
	`document_uuid` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`conversation_uuid`) REFERENCES `conversations`(`uuid`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_uuid`) REFERENCES `documents`(`uuid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text(36) NOT NULL,
	`name` text NOT NULL,
	`subcategory` text,
	`description` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_uuid_unique` ON `categories` (`uuid`);--> statement-breakpoint
CREATE TABLE `conversation_memories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_uuid` text NOT NULL,
	`memory_uuid` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`conversation_uuid`) REFERENCES `conversations`(`uuid`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`memory_uuid`) REFERENCES `memories`(`uuid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `task_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_uuid` text NOT NULL,
	`document_uuid` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`task_uuid`) REFERENCES `tasks`(`uuid`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_uuid`) REFERENCES `documents`(`uuid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uuid` text NOT NULL,
	`task_uuid` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`schedule` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_run` text,
	`next_run` text,
	`result` text,
	`metadata` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`task_uuid`) REFERENCES `tasks`(`uuid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_uuid_unique` ON `jobs` (`uuid`);