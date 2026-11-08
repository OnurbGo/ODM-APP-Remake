CREATE TABLE `cadastros` (
	`id` text PRIMARY KEY,
	`campanha_id` text NOT NULL,
	`tipo` text NOT NULL,
	`dados` text NOT NULL,
	`atualizado_em` text NOT NULL,
	CONSTRAINT `fk_cadastros_campanha_id_campanhas_id_fk` FOREIGN KEY (`campanha_id`) REFERENCES `campanhas`(`id`)
);
--> statement-breakpoint
CREATE INDEX `cadastros_campanha` ON `cadastros` (`campanha_id`);