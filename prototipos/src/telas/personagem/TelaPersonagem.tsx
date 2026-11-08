import { BarraPV, Botao, Etiqueta, PopUp, Seletor } from "@odm/estilo";
import { useMemo, useState, useSyncExternalStore } from "react";
import { CATEGORIAS, ITENS_PROTO, PERSONAGEM, SILHUETAS, type Categoria, type ItemProto } from "../../dados/personagem";
import { FiguraProvisoria, GlifoCategoria } from "./Glifos";
import css from "./TelaPersonagem.module.css";

/* Protótipo da tela do personagem (fase 6, etapa 5): retrato de corpo inteiro no centro, o equipamento dos
   dois lados (agrupamento visual, sem limite de slots: decisão de 07/11/2026) e o inventário embaixo.
   Dados fictícios; nada aqui é o motor de regras. */

const LARGO = "(min-width: 900px)";
const assinar = (f: () => void) => {
  const m = matchMedia(LARGO);
  m.addEventListener("change", f);
  return () => m.removeEventListener("change", f);
};
const useLargo = () => useSyncExternalStore(assinar, () => matchMedia(LARGO).matches);

type Retrato = { tipo: "silhueta"; id: string } | { tipo: "foto"; url: string; kb: number };
type Ordem = "categoria" | "nome" | "peso";
type Visao = "grade" | "lista";

const GRUPOS_ESQUERDA: { titulo: string; categorias: Categoria[] }[] = [
  { titulo: "Corpo a corpo", categorias: ["corpo_a_corpo"] },
  { titulo: "Proteção", categorias: ["armadura", "escudo"] },
];
const GRUPOS_DIREITA: { titulo: string; categorias: Categoria[] }[] = [
  { titulo: "À distância", categorias: ["distancia"] },
  { titulo: "Outros", categorias: ["ferramenta", "geral", "consumivel", "municao"] },
];

const kg = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
const sinal = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);
const nomeDaCategoria = (c: Categoria) => CATEGORIAS.find((x) => x.id === c)?.nome ?? c;
const RARIDADE: Record<ItemProto["raridade"], string> = { comum: "Comum", incomum: "Incomum", raro: "Raro", extraordinario: "Extraordinário", unico: "Único" };

/* Foto do jogador: reduzida no próprio aparelho (até 600 × 1400) e guardada em WebP. */
async function reduzirFoto(arquivo: File): Promise<{ url: string; kb: number }> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, 600 / bitmap.width, 1400 / bitmap.height);
  const tela = document.createElement("canvas");
  tela.width = Math.round(bitmap.width * escala);
  tela.height = Math.round(bitmap.height * escala);
  tela.getContext("2d")!.drawImage(bitmap, 0, 0, tela.width, tela.height);
  const blob = await new Promise<Blob>((ok) => tela.toBlob((b) => ok(b!), "image/webp", 0.8));
  return { url: URL.createObjectURL(blob), kb: Math.round(blob.size / 1024) };
}

function ImagemDoRetrato({ retrato }: { retrato: Retrato }) {
  return retrato.tipo === "foto" ? <img src={retrato.url} alt="Retrato do personagem" className={css.foto} /> : <FiguraProvisoria silhueta={retrato.id} />;
}

function Slot({ item, compacto, aoAbrir }: { item: ItemProto; compacto: boolean; aoAbrir: (id: string) => void }) {
  return (
    <button type="button" className={`${css.slot} ${css[`r_${item.raridade}`]}`} onClick={() => aoAbrir(item.id)} title={compacto ? item.nome : undefined} aria-label={item.nome}>
      <GlifoCategoria categoria={item.categoria} className={css.slotGlifo} />
      {!compacto && <span className={css.slotNome}>{item.nome}</span>}
    </button>
  );
}

function GrupoDeSlots({ titulo, itens, compacto, aoAbrir }: { titulo: string; itens: ItemProto[]; compacto: boolean; aoAbrir: (id: string) => void }) {
  return (
    <section className={css.grupo} aria-label={titulo}>
      {!compacto && <h3 className={`${css.grupoTitulo} odm-rotulo`}>{titulo}</h3>}
      {itens.length ? (
        itens.map((i) => <Slot key={i.id} item={i} compacto={compacto} aoAbrir={aoAbrir} />)
      ) : (
        <span className={css.slotVazio} title={`${titulo}: nada equipado`}>
          {compacto ? "—" : "Nada equipado"}
        </span>
      )}
    </section>
  );
}

function DetalheDoItem({ item, aoEquipar, aoUsar }: { item: ItemProto; aoEquipar: () => void; aoUsar: () => void }) {
  const [atributo, definirAtributo] = useState<"maior" | "brutalidade" | "agilidade">("maior");
  const [modo, definirModo] = useState(item.ataque?.modos?.[0] ?? "");
  const equipavel = ["corpo_a_corpo", "distancia", "armadura", "escudo", "ferramenta"].includes(item.categoria);
  return (
    <div className={css.detalhe}>
      <div className={`${css.detalheIcone} ${css[`r_${item.raridade}`]}`}>
        <GlifoCategoria categoria={item.categoria} />
      </div>
      <h3 className={css.detalheNome}>{item.nome}</h3>
      <p className={css.detalheLinha}>
        <span className={css[`t_${item.raridade}`]}>{RARIDADE[item.raridade]}</span> · {nomeDaCategoria(item.categoria)}
        {item.equipado && (
          <>
            {" "}
            · <Etiqueta tom="destaque">Equipado</Etiqueta>
          </>
        )}
      </p>
      {item.ataque && (
        <dl className={css.numeros}>
          <div>
            <dt className="odm-rotulo">Acerto</dt>
            <dd className="odm-numero">{sinal(item.ataque.acerto)}</dd>
          </div>
          <div>
            <dt className="odm-rotulo">Dano</dt>
            <dd className="odm-numero">{item.ataque.dano}</dd>
          </div>
          <div>
            <dt className="odm-rotulo">Alcance</dt>
            <dd>{item.ataque.alcance}</dd>
          </div>
        </dl>
      )}
      {item.defesa !== undefined && (
        <dl className={css.numeros}>
          <div>
            <dt className="odm-rotulo">Defesa</dt>
            <dd className="odm-numero">{sinal(item.defesa)}</dd>
          </div>
        </dl>
      )}
      <p className={css.detalheTexto}>{item.texto}</p>
      <p className={css.detalheLinha}>
        {item.quantidade > 1 ? `${item.quantidade} × ${kg(item.pesoKg)} = ${kg(item.quantidade * item.pesoKg)}` : kg(item.pesoKg)}
      </p>
      {item.ataque?.finesse && (
        <Seletor
          rotulo="Atributo (Finesse)"
          opcoes={[
            { id: "maior", rotulo: "O maior" },
            { id: "brutalidade", rotulo: "Brutalidade" },
            { id: "agilidade", rotulo: "Agilidade" },
          ]}
          valor={atributo}
          aoMudar={definirAtributo}
        />
      )}
      {item.ataque?.modos && <Seletor rotulo="Modo de disparo" opcoes={item.ataque.modos.map((m) => ({ id: m, rotulo: m }))} valor={modo} aoMudar={definirModo} />}
      <div className={css.detalheAcoes}>
        {equipavel && (
          <Botao variante={item.equipado ? "secundario" : "primario"} onClick={aoEquipar}>
            {item.equipado ? "Guardar" : "Equipar"}
          </Botao>
        )}
        {item.usavel && <Botao onClick={aoUsar}>Usar</Botao>}
      </div>
    </div>
  );
}

function EscolhaDeRetrato({ atual, aoEscolher, aoFechar, largo }: { atual: Retrato; aoEscolher: (r: Retrato) => void; aoFechar: () => void; largo: boolean }) {
  const [rascunho, definirRascunho] = useState<Retrato>(atual);
  const [erro, definirErro] = useState<string | null>(null);
  return (
    <PopUp aberto titulo="Retrato" subtitulo="Uma foto sua ou uma silhueta" variante={largo ? "central" : "folha"} aoFechar={aoFechar}>
      <div className={css.escolha}>
        <div className={css.escolhaPrevia}>
          <ImagemDoRetrato retrato={rascunho} />
        </div>
        <div className={css.escolhaOpcoes}>
          <label className={css.enviar}>
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const arquivo = e.target.files?.[0];
                if (!arquivo) return;
                try {
                  definirErro(null);
                  definirRascunho({ tipo: "foto", ...(await reduzirFoto(arquivo)) });
                } catch {
                  definirErro("Não deu para abrir essa imagem. Tente uma foto JPG ou PNG.");
                }
              }}
            />
            Enviar uma foto
          </label>
          {rascunho.tipo === "foto" && <p className={css.nota}>Reduzida no aparelho: {rascunho.kb} kB.</p>}
          {erro && <p className={css.erro}>{erro}</p>}
          <p className={`${css.nota} odm-rotulo`}>Ou uma silhueta</p>
          <div className={css.silhuetas}>
            {SILHUETAS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`${css.silhueta} ${rascunho.tipo === "silhueta" && rascunho.id === s.id ? css.escolhida : ""}`}
                aria-pressed={rascunho.tipo === "silhueta" && rascunho.id === s.id}
                onClick={() => definirRascunho({ tipo: "silhueta", id: s.id })}
              >
                <FiguraProvisoria silhueta={s.id} />
                <span>{s.nome}</span>
              </button>
            ))}
          </div>
          <Botao variante="primario" grande largo onClick={() => aoEscolher(rascunho)}>
            Usar este retrato
          </Botao>
          <p className={css.nota}>Protótipo: as silhuetas aqui são desenhos provisórios. No app, são as artes dos livros pintadas de preto.</p>
        </div>
      </div>
    </PopUp>
  );
}

export function TelaPersonagem() {
  const largo = useLargo();
  const [itens, definirItens] = useState(ITENS_PROTO);
  const [selecionado, definirSelecionado] = useState<string | null>(largo ? "3" : null);
  const [filtro, definirFiltro] = useState<Categoria | "tudo">("tudo");
  const [busca, definirBusca] = useState("");
  const [ordem, definirOrdem] = useState<Ordem>("categoria");
  const [visao, definirVisao] = useState<Visao>("grade");
  const [retrato, definirRetrato] = useState<Retrato>({ tipo: "silhueta", id: "silhueta.pistoleiro" });
  const [escolhendo, definirEscolhendo] = useState(false);
  const [aviso, definirAviso] = useState<string | null>(null);

  const equipados = itens.filter((i) => i.equipado);
  const doGrupo = (cats: Categoria[]) => equipados.filter((i) => cats.includes(i.categoria));
  const carga = itens.reduce((s, i) => s + i.pesoKg * i.quantidade, 0);
  const contagem = (c: Categoria | "tudo") => (c === "tudo" ? itens.length : itens.filter((i) => i.categoria === c).length);
  const visiveis = useMemo(() => {
    const ordemCat = CATEGORIAS.map((c) => c.id);
    return itens
      .filter((i) => (filtro === "tudo" || i.categoria === filtro) && i.nome.toLowerCase().includes(busca.trim().toLowerCase()))
      .sort((a, b) =>
        ordem === "nome"
          ? a.nome.localeCompare(b.nome)
          : ordem === "peso"
            ? b.pesoKg * b.quantidade - a.pesoKg * a.quantidade
            : Number(b.equipado) - Number(a.equipado) || ordemCat.indexOf(a.categoria) - ordemCat.indexOf(b.categoria) || a.nome.localeCompare(b.nome),
      );
  }, [itens, filtro, busca, ordem]);
  const item = itens.find((i) => i.id === selecionado) ?? null;
  const armas = equipados.filter((i) => i.ataque);
  const equipar = (id: string) => definirItens((l) => l.map((i) => (i.id === id ? { ...i, equipado: !i.equipado, novo: false } : i)));
  const usar = (id: string) => {
    const nome = itens.find((i) => i.id === id)?.nome;
    definirItens((l) => l.flatMap((i) => (i.id !== id ? [i] : i.quantidade > 1 ? [{ ...i, quantidade: i.quantidade - 1 }] : [])));
    definirAviso(`Usou ${nome}. No app, o efeito entra pelo servidor, com desfazer.`);
  };
  const abrir = (id: string) => {
    definirSelecionado(id);
    definirItens((l) => l.map((i) => (i.id === id ? { ...i, novo: false } : i)));
  };
  const sobrecarregado = carga > PERSONAGEM.cargaSobrecarregado;
  const imobilizado = carga > PERSONAGEM.cargaImobilizado;

  const detalhe = item && <DetalheDoItem key={item.id} item={item} aoEquipar={() => equipar(item.id)} aoUsar={() => usar(item.id)} />;

  return (
    <main className={`${css.pagina} odm-grao`}>
      <header className={css.cabecalho}>
        <div>
          <h1 className={css.nome}>{PERSONAGEM.nome}</h1>
          <p className={css.classe}>
            {PERSONAGEM.classe} · nível {PERSONAGEM.nivel}
          </p>
        </div>
        <div className={css.vida}>
          <span className={`${css.pvTexto} odm-numero`}>
            {PERSONAGEM.pv} / {PERSONAGEM.pvMaximo} PV
          </span>
          <BarraPV atual={PERSONAGEM.pv} maximo={PERSONAGEM.pvMaximo} />
        </div>
      </header>

      <section className={css.palco} aria-label="Retrato e equipamento">
        <div className={css.lado}>
          {GRUPOS_ESQUERDA.map((g) => (
            <GrupoDeSlots key={g.titulo} titulo={g.titulo} itens={doGrupo(g.categorias)} compacto={!largo} aoAbrir={abrir} />
          ))}
        </div>
        <div className={css.retrato}>
          <button type="button" className={css.retratoBotao} onClick={() => definirEscolhendo(true)} aria-label="Trocar o retrato">
            <ImagemDoRetrato retrato={retrato} />
          </button>
          <Botao variante="fantasma" onClick={() => definirEscolhendo(true)}>
            Trocar retrato
          </Botao>
        </div>
        <div className={css.lado}>
          {GRUPOS_DIREITA.map((g) => (
            <GrupoDeSlots key={g.titulo} titulo={g.titulo} itens={doGrupo(g.categorias)} compacto={!largo} aoAbrir={abrir} />
          ))}
        </div>
      </section>

      <section className={css.resumo} aria-label="Resumo de combate">
        <div className={css.defesa}>
          <span className="odm-rotulo">Defesa</span>
          <span className={`${css.defesaValor} odm-numero`}>{PERSONAGEM.defesa}</span>
        </div>
        <ul className={css.ataques}>
          {armas.map((a) => (
            <li key={a.id}>
              <button type="button" className={css.ataque} onClick={() => abrir(a.id)}>
                <GlifoCategoria categoria={a.categoria} className={css.ataqueGlifo} />
                <span className={css.ataqueNome}>{a.nome}</span>
                <span className="odm-numero">{sinal(a.ataque!.acerto)}</span>
                <span className={`${css.ataqueDano} odm-numero`}>{a.ataque!.dano}</span>
              </button>
            </li>
          ))}
          {!armas.length && <li className={css.nota}>Nenhuma arma equipada.</li>}
        </ul>
        <div className={css.defesa}>
          <span className="odm-rotulo">Deslocamento</span>
          <span className={`${css.defesaValor} odm-numero`}>{PERSONAGEM.deslocamento} m</span>
        </div>
      </section>

      <section className={css.inventario} aria-label="Inventário">
        <div className={css.ferramentas}>
          <h2 className={css.titulo}>Inventário</h2>
          <input className={css.busca} type="search" placeholder="Buscar item" aria-label="Buscar item" value={busca} onChange={(e) => definirBusca(e.target.value)} />
          <label className={css.ordem}>
            <span className="odm-oculto">Ordenar por</span>
            <select value={ordem} onChange={(e) => definirOrdem(e.target.value as Ordem)}>
              <option value="categoria">Equipados primeiro</option>
              <option value="nome">Nome</option>
              <option value="peso">Mais pesados</option>
            </select>
          </label>
          <div className={css.visao} role="group" aria-label="Visão do inventário">
            {(["grade", "lista"] as const).map((v) => (
              <button key={v} type="button" className={`${css.filtro} ${visao === v ? css.filtroAtivo : ""}`} aria-pressed={visao === v} onClick={() => definirVisao(v)}>
                {v === "grade" ? "Grade" : "Lista"}
              </button>
            ))}
          </div>
        </div>
        <div className={css.filtros} role="group" aria-label="Categorias">
          {CATEGORIAS.filter((c) => contagem(c.id) > 0).map((c) => (
            <button key={c.id} type="button" className={`${css.filtro} ${filtro === c.id ? css.filtroAtivo : ""}`} aria-pressed={filtro === c.id} onClick={() => definirFiltro(c.id)}>
              {c.nome} <span className={css.filtroConta}>{contagem(c.id)}</span>
            </button>
          ))}
        </div>

        <div className={css.corpoInventario}>
          {visao === "grade" ? (
            <ul className={css.grade}>
              {visiveis.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    className={`${css.celula} ${css[`r_${i.raridade}`]} ${selecionado === i.id ? css.celulaAtiva : ""}`}
                    onClick={() => abrir(i.id)}
                    aria-label={`${i.nome}${i.quantidade > 1 ? `, ${i.quantidade}` : ""}${i.equipado ? ", equipado" : ""}`}
                    title={i.nome}
                  >
                    <GlifoCategoria categoria={i.categoria} className={css.celulaGlifo} />
                    {i.quantidade > 1 && <span className={`${css.quantidade} odm-numero`}>{i.quantidade}</span>}
                    {i.equipado && <span className={css.marcaEquipado} aria-hidden="true" />}
                    {i.novo && <span className={css.marcaNovo}>novo</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className={css.lista}>
              {visiveis.map((i) => (
                <li key={i.id}>
                  <button type="button" className={`${css.linha} ${selecionado === i.id ? css.celulaAtiva : ""}`} onClick={() => abrir(i.id)}>
                    <GlifoCategoria categoria={i.categoria} className={`${css.linhaGlifo} ${css[`t_${i.raridade}`]}`} />
                    <span className={css.linhaNome}>
                      {i.nome}
                      {i.novo && <span className={css.marcaNovoTexto}> novo</span>}
                    </span>
                    {i.equipado && <Etiqueta tom="destaque">Equipado</Etiqueta>}
                    <span className={`${css.linhaQtd} odm-numero`}>{i.quantidade > 1 ? `×${i.quantidade}` : ""}</span>
                    <span className={`${css.linhaPeso} odm-numero`}>{kg(i.pesoKg * i.quantidade)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!visiveis.length && <p className={css.nota}>Nada com esse nome.</p>}
          {largo && <aside className={css.painel}>{detalhe ?? <p className={css.nota}>Toque num item para ver o que ele faz.</p>}</aside>}
        </div>

        <footer className={css.rodape}>
          <div className={css.carga}>
            <span className="odm-rotulo">Carga</span>
            <div className={css.trilhoCarga} role="meter" aria-valuemin={0} aria-valuemax={PERSONAGEM.cargaImobilizado} aria-valuenow={carga} aria-label="Carga">
              <div className={`${css.cheioCarga} ${imobilizado ? css.cargaRuim : sobrecarregado ? css.cargaAlerta : ""}`} style={{ width: `${Math.min(100, (carga / PERSONAGEM.cargaImobilizado) * 100)}%` }} />
              <span className={css.marcaCarga} style={{ left: `${(PERSONAGEM.cargaSobrecarregado / PERSONAGEM.cargaImobilizado) * 100}%` }} title="Sobrecarregado" />
            </div>
            <span className={`${css.cargaTexto} odm-numero`}>
              {imobilizado ? "Imobilizado · " : sobrecarregado ? "Sobrecarregado · " : ""}
              {kg(carga)} · Sobrecarregado acima de {PERSONAGEM.cargaSobrecarregado} kg, Imobilizado acima de {PERSONAGEM.cargaImobilizado} kg
            </span>
          </div>
          <div className={css.dinheiro}>
            <span className="odm-rotulo">Dinheiro</span>
            <span className="odm-numero">R$ {PERSONAGEM.dinheiro.toLocaleString("pt-BR")}</span>
          </div>
        </footer>
        {aviso && (
          <p className={css.aviso} role="status">
            {aviso}
          </p>
        )}
      </section>

      {!largo && item && (
        <PopUp aberto titulo={item.nome} variante="folha" aoFechar={() => definirSelecionado(null)}>
          {detalhe}
        </PopUp>
      )}
      {escolhendo && (
        <EscolhaDeRetrato
          atual={retrato}
          largo={largo}
          aoFechar={() => definirEscolhendo(false)}
          aoEscolher={(r) => {
            definirRetrato(r);
            definirEscolhendo(false);
          }}
        />
      )}
    </main>
  );
}
