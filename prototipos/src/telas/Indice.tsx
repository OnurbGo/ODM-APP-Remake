import css from "./Indice.module.css";

const PARADAS = [
  { rota: "#/combate-celular", nome: "Parada 1 — Aba Combate, celular", pronta: true },
  { rota: "#/combate-desktop", nome: "Parada 2 — Aba Combate, desktop", pronta: true },
  { rota: "#/combate", nome: "Aba Combate — escolhe o layout pela largura", pronta: true },
  { rota: "#/vitrine", nome: "Vitrine — tokens e componentes", pronta: true },
  { rota: "#/combate", nome: "Parada 3 — Teste e rolagem (use o painel P)", pronta: true },
  { rota: "#/escudo", nome: "Parada 4 — Escudo do Mestre", pronta: true },
  { rota: "#/ficha", nome: "Parada 5 — Ficha e loja de prestígio", pronta: true },
  { rota: "#/abertura", nome: "Parada 6 — Abertura", pronta: true },
  { rota: "#/transicoes", nome: "Parada 7 — Transições, carregamento e botões", pronta: true },
  { rota: "#/escudo", nome: "Parada 8 — Iniciativa do mestre (Nova iniciativa)", pronta: true },
  { rota: "#/combate", nome: "Parada 8 — Iniciativa do jogador e vantagem por cartas (painel P)", pronta: true },
];

export function Indice() {
  return (
    <main className={css.indice}>
      <h1 className={css.titulo}>Olho da Morte</h1>
      <p className={css.sub}>Protótipos da fase 1. Dados fictícios.</p>
      <ul className={css.lista}>
        {PARADAS.map((p) => (
          <li key={p.nome}>{p.pronta ? <a href={p.rota}>{p.nome}</a> : <span>{p.nome}</span>}</li>
        ))}
      </ul>
    </main>
  );
}
