ALTER TABLE `campanhas` ADD `ultima_sessao_em` text;--> statement-breakpoint
ALTER TABLE `campanhas` ADD `aberta` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `campanhas` SET `ultima_sessao_em` = COALESCE((SELECT MAX(`criado_em`) FROM `eventos` WHERE `eventos`.`campanha_id` = `campanhas`.`id`), `criada_em`);
