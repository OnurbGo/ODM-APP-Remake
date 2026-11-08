import { Botao, PopUp } from "@odm/estilo";
import type { Mostra, RefImagem } from "@odm/protocolo";
import { useRef, useState } from "react";
import { enviarImagem, useImagemDaRef } from "../../../conexao/imagens";
import { acoes, useLoja } from "../../../conexao/loja";
import css from "./Campanha.module.css";

/* Escolher imagem: arte do pacote já ligada (NPC do livro) ou envio do mestre, reduzido no navegador. */
export function EscolherImagem({ valor, aoMudar, artePadrao }: { valor: RefImagem | null; aoMudar: (v: RefImagem | null) => void; artePadrao?: string | null }) {
  const url = useImagemDaRef(valor);
  const entrada = useRef<HTMLInputElement>(null);
  const [erro, definirErro] = useState<string | null>(null);
  const [enviando, definirEnviando] = useState(false);
  return (
    <div className={css.imagem}>
      {url ? <img src={url} alt="" className={css.previa} /> : <div className={css.semImagem}>Sem imagem</div>}
      <div className={css.barraSalvar}>
        <input
          ref={entrada}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = "";
            if (!arquivo) return;
            definirEnviando(true);
            definirErro(null);
            const r = await enviarImagem(arquivo);
            definirEnviando(false);
            if ("erro" in r) definirErro(r.erro);
            else aoMudar({ origem: "arquivo", id: r.id });
          }}
        />
        <Botao disabled={enviando} onClick={() => entrada.current?.click()}>
          {enviando ? "Enviando…" : "Enviar imagem"}
        </Botao>
        {artePadrao && valor?.id !== artePadrao && (
          <Botao variante="fantasma" onClick={() => aoMudar({ origem: "pacote", id: artePadrao })}>
            Usar a arte do livro
          </Botao>
        )}
        {valor && (
          <Botao variante="fantasma" onClick={() => aoMudar(null)}>
            Tirar
          </Botao>
        )}
      </div>
      {erro && <p className={css.aviso}>{erro}</p>}
    </div>
  );
}

/* "Mostrar para os jogadores" (especificação 7.4): imagem e/ou texto por cima da tela de todos ou de alguns. */
export function Mostrar({ aberto, inicial, aoFechar }: { aberto: boolean; inicial?: Partial<Mostra>; aoFechar: () => void }) {
  const jogadores = useLoja((e) => e.mestre?.jogadores ?? []);
  const atual = useLoja((e) => e.mostrando);
  const [m, definir] = useState<Mostra>({ titulo: "", texto: "", imagem: null, para: [], ...inicial });
  if (!aberto) return null;
  const alternar = (id: string) => definir((x) => ({ ...x, para: x.para.includes(id) ? x.para.filter((p) => p !== id) : [...x.para, id] }));
  return (
    <PopUp aberto titulo="Mostrar para os jogadores" subtitulo="Abre por cima da tela deles; fechar vale para todos." variante="central" aoFechar={aoFechar}>
      <div className={css.concluir}>
        <label className={css.campo}>
          <span className="odm-rotulo">Título</span>
          <input type="text" maxLength={160} value={m.titulo} onChange={(e) => definir((x) => ({ ...x, titulo: e.target.value }))} />
        </label>
        <label className={css.campo}>
          <span className="odm-rotulo">Texto</span>
          <textarea rows={4} maxLength={20_000} value={m.texto} onChange={(e) => definir((x) => ({ ...x, texto: e.target.value }))} />
        </label>
        <EscolherImagem valor={m.imagem} aoMudar={(imagem) => definir((x) => ({ ...x, imagem }))} />
        <fieldset className={css.campo}>
          <legend className="odm-rotulo">Para quem</legend>
          <span className={css.nota}>Sem ninguém marcado, vai para todos.</span>
          {jogadores
            .filter((j) => !j.revogado)
            .map((j) => (
              <label key={j.id} className={css.marcar}>
                <input type="checkbox" checked={m.para.includes(j.id)} onChange={() => alternar(j.id)} /> {j.nome}
              </label>
            ))}
        </fieldset>
        <Botao
          variante="primario"
          grande
          largo
          disabled={!m.titulo.trim() && !m.texto.trim() && !m.imagem}
          onClick={() => {
            acoes.mostrar(m);
            aoFechar();
          }}
        >
          Mostrar
        </Botao>
        {atual && (
          <Botao variante="fantasma" largo onClick={acoes.fecharMostra}>
            Fechar o que está aberto ({atual.titulo || "sem título"})
          </Botao>
        )}
      </div>
    </PopUp>
  );
}
