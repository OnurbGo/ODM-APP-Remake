CREATE TABLE `combates` (
	`id` text PRIMARY KEY,
	`campanha_id` text NOT NULL,
	`estado` text NOT NULL,
	`criado_em` text NOT NULL,
	`encerrado_em` text,
	CONSTRAINT `fk_combates_campanha_id_campanhas_id_fk` FOREIGN KEY (`campanha_id`) REFERENCES `campanhas`(`id`)
);
--> statement-breakpoint
ALTER TABLE `personagens` ADD `estado` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX `combates_campanha` ON `combates` (`campanha_id`);