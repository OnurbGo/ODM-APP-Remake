import { CAMINHO_WS } from "@odm/protocolo";

/* Especificação, 3.2: separa "problema de rede" de "problema do app". É texto puro, sem a interface,
   sem conteúdo do jogo e sem nada da campanha. Se esta página abre, a rede chegou até o mestre. */

const ESPERA_MS = 6000;

export const PAGINA_TESTE = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Teste de conexão</title>
<style>
body { margin: 0; padding: 24px 16px; font: 18px/1.5 Georgia, serif; color: #f1e7d3; background: #14100c; }
main { max-width: 480px; margin: 0 auto; }
h1 { font-size: 24px; margin: 0 0 16px; color: #d8a33f; }
#ao-vivo { padding: 12px; border: 1px solid #6b5a3e; }
a { color: #d8a33f; }
</style>
</head>
<body>
<main>
<h1>Este aparelho alcançou a mesa</h1>
<p>A rede está funcionando: este aparelho conversa com o computador do mestre.</p>
<p id="ao-vivo">Testando a conexão ao vivo…</p>
<noscript><p>Sem JavaScript, o app não abre neste navegador.</p></noscript>
<p><a href="/">Entrar na mesa</a></p>
</main>
<script src="/teste.js"></script>
</body>
</html>
`;

export const SCRIPT_TESTE = `(function () {
  var campo = document.getElementById("ao-vivo");
  var fim = false;
  function dizer(texto) {
    if (fim) return;
    fim = true;
    campo.textContent = texto;
  }
  var falha = "A conexão ao vivo não passou. A rede chega até o mestre, mas algo no caminho barra o app: tente outro navegador ou desligue a VPN deste aparelho.";
  try {
    var protocolo = location.protocol === "https:" ? "wss://" : "ws://";
    var ws = new WebSocket(protocolo + location.host + ${JSON.stringify(CAMINHO_WS)});
    ws.onopen = function () {
      dizer("Conexão ao vivo funcionando. Se o app ainda não abre, recarregue a página ou peça ajuda ao mestre.");
      ws.close();
    };
    ws.onerror = function () { dizer(falha); };
    setTimeout(function () { dizer(falha); }, ${ESPERA_MS});
  } catch (e) {
    dizer(falha);
  }
})();
`;
