import { Botao, PopUp } from "@odm/estilo";
import type { RedeMestre } from "@odm/protocolo";
import { useState } from "react";
import { BotaoCopiar } from "./BotaoCopiar";
import css from "./PainelMestre.module.css";
import { QrEndereco } from "./QrEndereco";
import type { Firewall } from "./usarFirewall";

const ESTADO_FIREWALL: Record<EstadoFirewall, string> = {
  liberado: "O Windows está deixando os jogadores entrarem. Este item está certo.",
  bloqueado: "O Windows está barrando a entrada. Use o botão Liberar acesso, logo acima.",
  sem_liberacao: "Falta liberar o app no Windows. Use o botão Liberar acesso, logo acima.",
  desconhecido: "Não deu para conferir agora. Se o botão Liberar acesso aparecer aqui em cima, use-o.",
};

/* Sem o app, quem recebe os jogadores é o node.exe: não há botão, só o comando de desenvolvimento. */
function TextoFirewallDev({ estado }: { estado: EstadoFirewall | null }) {
  const situacao = estado === "liberado" ? "liberado" : estado === "desconhecido" || !estado ? "sem resposta" : "bloqueado";
  return (
    <>
      Você está no <code>npm run dev</code>: a verificação de firewall e o botão Liberar acesso só existem no app. Aqui quem recebe os jogadores é o <code>node.exe</code>, que está{" "}
      <strong>{situacao}</strong>
      {situacao === "liberado" ? "." : <>. Para liberar, rode <code>npm run firewall:liberar</code> e reinicie.</>}
    </>
  );
}

function LinhaTeste({ url }: { url: string }) {
  const [qr, definirQr] = useState(false);
  return (
    <li className={css.linhaTeste}>
      <code className={`${css.url} odm-numero`}>{url}</code>
      <div className={css.enderecoAcoes}>
        <BotaoCopiar texto={url} rotulo={`Copiar ${url}`} />
        <Botao variante="fantasma" aria-label={`QR code de ${url}`} onClick={() => definirQr(true)}>
          QR code
        </Botao>
      </div>
      <PopUp aberto={qr} titulo="Teste de conexão" subtitulo={url} variante="central" aoFechar={() => definirQr(false)}>
        <QrEndereco url={url} />
      </PopUp>
    </li>
  );
}

/* Linguagem de quem não entende de rede: dizer o que conferir e o que fazer, sem mandar mexer no Windows. */
export function AjudaConexao({ rede, firewall }: { rede: RedeMestre; firewall: Firewall }) {
  return (
    <details className={css.ajuda}>
      <summary className={css.ajudaTitulo}>Ninguém conseguiu entrar?</summary>
      <ol className={css.ajudaLista}>
        <li>
          <strong>Mesma rede.</strong> O celular e este computador precisam estar no mesmo Wi-Fi. Confira se o celular não caiu para os dados móveis. Com Hamachi ou Radmin, os dois precisam estar na
          mesma rede virtual.
        </li>
        <li>
          <strong>Rede de convidados.</strong> Wi-Fi de visitantes, de escritório ou de hotel, e roteadores com isolamento de clientes, não deixam os aparelhos se enxergarem, e nenhum app resolve. Use
          outra rede, Hamachi, Radmin ou o roteador do celular.
        </li>
        <li>
          <strong>Rede Pública no Windows.</strong> O Windows trata rede nova como Pública e fica mais rígido com ela. Você não precisa mudar isso: a liberação do app vale também para redes públicas.
        </li>
        <li>
          <strong>Firewall.</strong> {firewall.noApp ? (firewall.estado ? ESTADO_FIREWALL[firewall.estado] : "Conferindo…") : <TextoFirewallDev estado={rede.firewallDev} />}
        </li>
        <li>
          <strong>Endereço certo.</strong> Prefira o QR code acima. Se digitar à mão, confira os números e a porta, e use o endereço da rede em que o jogador está.
        </li>
      </ol>
      {rede.enderecos.length > 0 && (
        <div className={css.ajudaTeste}>
          <p>
            <strong>Teste rápido.</strong> Abra este endereço no celular do jogador:
          </p>
          <ul>
            {rede.enderecos.map((e) => (
              <LinhaTeste key={e.ip} url={`http://${e.ip}:${rede.porta}/teste`} />
            ))}
          </ul>
          <p className={css.nota}>Se abrir, a rede está boa e o problema é no app: recarregue a página do jogador. Se ficar carregando ou der erro, o problema é de rede: confira os itens acima.</p>
        </div>
      )}
    </details>
  );
}
