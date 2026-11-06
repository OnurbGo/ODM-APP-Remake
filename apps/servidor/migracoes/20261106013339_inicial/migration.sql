CREATE TABLE `campanhas` (
	`id` text PRIMARY KEY,
	`nome` text NOT NULL,
	`codigo` text NOT NULL,
	`criada_em` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dispositivos` (
	`id` text PRIMARY KEY,
	`participante_id` text NOT NULL,
	`token_hash` text NOT NULL UNIQUE,
	`criado_em` text NOT NULL,
	CONSTRAINT `fk_dispositivos_participante_id_participantes_id_fk` FOREIGN KEY (`participante_id`) REFERENCES `participantes`(`id`)
);
--> statement-breakpoint
CREATE TABLE `eventos` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`id` text NOT NULL UNIQUE,
	`campanha_id` text NOT NULL,
	`tipo` text NOT NULL,
	`autor_id` text,
	`autor_nome` text,
	`dados` text NOT NULL,
	`criado_em` text NOT NULL,
	CONSTRAINT `fk_eventos_campanha_id_campanhas_id_fk` FOREIGN KEY (`campanha_id`) REFERENCES `campanhas`(`id`)
);
--> statement-breakpoint
CREATE TABLE `participantes` (
	`id` text PRIMARY KEY,
	`campanha_id` text NOT NULL,
	`nome` text NOT NULL,
	`papel` text NOT NULL,
	`criado_em` text NOT NULL,
	`revogado_em` text,
	CONSTRAINT `fk_participantes_campanha_id_campanhas_id_fk` FOREIGN KEY (`campanha_id`) REFERENCES `campanhas`(`id`)
);
--> statement-breakpoint
CREATE INDEX `eventos_campanha` ON `eventos` (`campanha_id`,`seq`);--> statement-breakpoint
CREATE INDEX `participantes_campanha` ON `participantes` (`campanha_id`);