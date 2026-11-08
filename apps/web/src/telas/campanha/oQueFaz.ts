import { MecanicaModificador, type Modificador } from "@odm/conteudo";

/* O que a carta de modificador de mundo muda na conta, em frases curtas (vazio = só texto). */
export function oQueFaz(m: Modificador): string[] {
  const lido = MecanicaModificador.safeParse(m.mecanica);
  if (!m.mecanica || !lido.success) return [];
  const x = lido.data;
  const linhas: string[] = [];
  for (const t of x.testes ?? []) linhas.push(`${t.bonus > 0 ? "+" : ""}${t.bonus} nos testes de ${nomePericia(t.pericia)}`);
  for (const t of x.passivos ?? []) linhas.push(`${t.bonus > 0 ? "+" : ""}${t.bonus} em ${nomePericia(t.pericia)} passiva`);
  if (x.alcance_armas_de_fogo) linhas.push("Alcance efetivo e máximo das armas de fogo pela metade (para baixo, mínimo 1 m)");
  if (x.deslocamento) linhas.push(`Com "Campo aberto": −${x.deslocamento.menos_m} m de deslocamento para quem anda mais de ${x.deslocamento.so_acima_de_m} m`);
  if (x.disparada) linhas.push(`Disparada pede ${nomePericia(x.disparada.teste.pericia)} (DT ${x.disparada.teste.dt}); na falha, Caído`);
  return linhas;
}

const nomePericia = (id: string) => {
  const nome = id.replace(/^pericia\./, "").replace(/-/g, " ");
  const comAcento: Record<string, string> = { percepcao: "Percepção", sobrevivencia: "Sobrevivência" };
  return comAcento[nome] ?? nome.charAt(0).toLocaleUpperCase("pt-BR") + nome.slice(1);
};

