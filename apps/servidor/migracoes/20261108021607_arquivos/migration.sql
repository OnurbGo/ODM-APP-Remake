CREATE TABLE `arquivos` (
	`id` text PRIMARY KEY,
	`campanha_id` text NOT NULL,
	`tipo` text NOT NULL,
	`dados` text NOT NULL,
	`criado_em` text NOT NULL,
	CONSTRAINT `fk_arquivos_campanha_id_campanhas_id_fk` FOREIGN KEY (`campanha_id`) REFERENCES `campanhas`(`id`)
);
--> statement-breakpoint
CREATE INDEX `arquivos_campanha` ON `arquivos` (`campanha_id`);