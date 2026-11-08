import type { OpcoesCampanha } from "@odm/protocolo";
import css from "./Personagens.module.css";

/* As mesmas opções na campanha nova e na campanha aberta. */
export function CamposOpcoes({ opcoes, aoMudar }: { opcoes: OpcoesCampanha; aoMudar: (opcoes: OpcoesCampanha) => void }) {
  const alternar = (chave: "cartasDoDestino" | "estresse" | "habilidadesDeCriatura") => aoMudar({ ...opcoes, [chave]: !opcoes[chave] });
  return (
    <div className={css.gerenciar}>
      <label className={css.marca}>
        <input type="checkbox" checked={opcoes.cartasDoDestino} onChange={() => alternar("cartasDoDestino")} />
        Cartas do Destino
      </label>
      <label className={css.marca}>
        <input type="checkbox" checked={opcoes.estresse} onChange={() => alternar("estresse")} />
        Estresse
      </label>
      <label className={css.campo}>
        <span className="odm-rotulo">Modelo de vantagem</span>
        <select value={opcoes.modeloVantagem} onChange={(e) => aoMudar({ ...opcoes, modeloVantagem: e.target.value as OpcoesCampanha["modeloVantagem"] })}>
          <option value="dados_extras">Dados Extras</option>
          <option value="cartas">Cartas</option>
        </select>
      </label>
      <label className={css.campo}>
        <span className="odm-rotulo">Empate final da iniciativa</span>
        <select value={opcoes.empateIniciativa} onChange={(e) => aoMudar({ ...opcoes, empateIniciativa: e.target.value as OpcoesCampanha["empateIniciativa"] })}>
          <option value="naipe">Naipe</option>
          <option value="nova_compra">Nova compra</option>
        </select>
      </label>
      <label className={css.marca}>
        <input type="checkbox" checked={!opcoes.habilidadesDeCriatura} onChange={() => alternar("habilidadesDeCriatura")} />
        Desligar habilidades automáticas de criaturas
      </label>
      <p className={css.nota}>Desligadas, a Recarga, a Pressão de Massa e a Ameaça de Massa não acontecem sozinhas: você aplica à mão. Só você vê esta opção.</p>
      <p className={css.nota}>Polivalência entra com o pacote A Ordem no Caos.</p>
    </div>
  );
}
