CREATE TABLE `monitored_devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` varchar(64) NOT NULL,
	`installToken` varchar(128) NOT NULL,
	`hostname` varchar(255) NOT NULL,
	`username` varchar(255),
	`platform` varchar(64) NOT NULL,
	`status` enum('online','offline') NOT NULL DEFAULT 'online',
	`isRevoked` int NOT NULL DEFAULT 0,
	`revokedAt` timestamp,
	`revokedBy` varchar(255),
	`cpuPercent` int NOT NULL DEFAULT 0,
	`memoryPercent` int NOT NULL DEFAULT 0,
	`diskPercent` int NOT NULL DEFAULT 0,
	`lastHeartbeat` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monitored_devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `monitored_devices_agentId_unique` UNIQUE(`agentId`)
);
--> statement-breakpoint
CREATE TABLE `session_audits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(64) NOT NULL,
	`agentId` varchar(64) NOT NULL,
	`hostname` varchar(255) NOT NULL,
	`operatorId` varchar(64) NOT NULL,
	`operatorName` varchar(255) NOT NULL,
	`state` enum('requested','approved','denied','ended') NOT NULL DEFAULT 'requested',
	`requestedAt` timestamp NOT NULL DEFAULT (now()),
	`approvedAt` timestamp,
	`endedAt` timestamp,
	`durationSeconds` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `session_audits_id` PRIMARY KEY(`id`),
	CONSTRAINT `session_audits_sessionId_unique` UNIQUE(`sessionId`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
