CREATE TABLE `kits` (
	`id` text PRIMARY KEY,
	`campanha_id` text NOT NULL,
	`nome` text NOT NULL,
	`itens` text NOT NULL,
	CONSTRAINT `fk_kits_campanha_id_campanhas_id_fk` FOREIGN KEY (`campanha_id`) REFERENCES `campanhas`(`id`)
);
--> statement-breakpoint
CREATE TABLE `personagens` (
	`id` text PRIMARY KEY,
	`campanha_id` text NOT NULL,
	`participante_id` text,
	`situacao` text NOT NULL,
	`ficha` text NOT NULL,
	`criado_em` text NOT NULL,
	`alterado_em` text NOT NULL,
	CONSTRAINT `fk_personagens_campanha_id_campanhas_id_fk` FOREIGN KEY (`campanha_id`) REFERENCES `campanhas`(`id`),
	CONSTRAINT `fk_personagens_participante_id_participantes_id_fk` FOREIGN KEY (`participante_id`) REFERENCES `participantes`(`id`)
);
--> statement-breakpoint
ALTER TABLE `campanhas` ADD `opcoes` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `campanhas` ADD `pacotes` text DEFAULT '["base"]' NOT NULL;--> statement-breakpoint
CREATE INDEX `kits_campanha` ON `kits` (`campanha_id`);--> statement-breakpoint
CREATE INDEX `personagens_campanha` ON `personagens` (`campanha_id`);