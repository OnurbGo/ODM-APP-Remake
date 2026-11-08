import { Botao, CampoTexto } from "@odm/estilo";
import type { ContextoFicha } from "@odm/regras";
import { useState } from "react";
import css from "./Personagens.module.css";
import { paraBusca } from "../busca";

/* Busca no catálogo de itens do pacote: dar item, montar kit, recompensa de missão. */
export function BuscaCatalogo({ ctx, rotulo, aoEscolher }: { ctx: ContextoFicha; rotulo: string; aoEscolher: (id: string, nome: string) => void }) {
  const [busca, definirBusca] = useState("");
  const termo = paraBusca(busca);
  const achados = termo ? [...ctx.itens.values()].filter((i) => paraBusca(i.nome).includes(termo)).slice(0, 8) : [];
  return (
    <div>
      <CampoTexto rotulo={rotulo} value={busca} onChange={(e) => definirBusca(e.target.value)} />
      <ul className={css.achados}>
        {achados.map((i) => (
          <li key={i.id}>
            <Botao
              largo
              variante="fantasma"
              onClick={() => {
                aoEscolher(i.id, i.nome);
                definirBusca("");
              }}
            >
              {i.nome}
            </Botao>
          </li>
        ))}
      </ul>
    </div>
  );
}

