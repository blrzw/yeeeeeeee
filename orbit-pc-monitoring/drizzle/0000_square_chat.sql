CREATE TABLE `monitored_devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` varchar(64) NOT NULL,
	`installToken` varchar(128) NOT NULL,
	`hostname` varchar(255) NOT NULL,
	`username` varchar(255),
	`platform` varchar(64) NOT NULL,
	`status` enum('online','offline') NOT NULL DEFAULT 'online',
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
