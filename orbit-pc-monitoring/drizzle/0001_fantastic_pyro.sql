CREATE TABLE `enrollment_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(128) NOT NULL,
	`agentId` varchar(64) NOT NULL,
	`label` varchar(255),
	`createdBy` varchar(255) NOT NULL,
	`usedAt` timestamp,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `enrollment_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `enrollment_tokens_token_unique` UNIQUE(`token`),
	CONSTRAINT `enrollment_tokens_agentId_unique` UNIQUE(`agentId`)
);
--> statement-breakpoint
ALTER TABLE `monitored_devices` ADD `osVersion` varchar(255);--> statement-breakpoint
ALTER TABLE `monitored_devices` ADD `hardwareModel` varchar(255);--> statement-breakpoint
ALTER TABLE `monitored_devices` ADD `serialNumber` varchar(255);--> statement-breakpoint
ALTER TABLE `monitored_devices` ADD `ipAddress` varchar(64);--> statement-breakpoint
ALTER TABLE `monitored_devices` ADD `uptimeSeconds` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitored_devices` ADD `agentVersion` varchar(64);--> statement-breakpoint
ALTER TABLE `monitored_devices` ADD `browserInventory` text;