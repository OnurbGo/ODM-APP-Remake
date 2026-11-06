/* npm run icones: gera o .ico do Windows e os favicons a partir dos SVGs de pacotes/estilo/src/icone.
   Roda dentro do Electron para rasterizar com o Chromium, sem dependência nativa.
   O resultado fica versionado: só é preciso rodar de novo quando o desenho mudar. */
import { app, BrowserWindow } from "electron";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const pastaIcone = join(raiz, "pacotes", "estilo", "src", "icone");
/* 20 e 40 são os tamanhos da janela com a tela em 125%. */
const TAMANHOS = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const LIMITE_DESENHO_PEQUENO = 24;
const RAIO_CANTOS = 12;

/* Tira a figura do mestre da grade do Android: em tela de computador ela ocupa o quadrado todo. */
function desenhoGrande() {
  const mestre = readFileSync(join(pastaIcone, "icone-mestre.svg"), "utf8");
  const figura = mestre.match(/<g id="figura"[\s\S]*<\/g>\s*(?=<\/svg>)/)?.[0];
  if (!figura) throw new Error('icone-mestre.svg sem o grupo "figura"');
  const zona = { inicio: 21, lado: 66 };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${zona.inicio} ${zona.inicio} ${zona.lado} ${zona.lado}">
    <rect x="${zona.inicio}" y="${zona.inicio}" width="${zona.lado}" height="${zona.lado}" rx="${RAIO_CANTOS}" fill="#0f0c09"/>${figura}</svg>`;
}

/* Cada imagem vai como PNG dentro do .ico. O Windows aceita isso desde o Vista. */
function montarIco(imagens) {
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(1, 2);
  cabecalho.writeUInt16LE(imagens.length, 4);
  const entradas = [];
  let posicao = 6 + 16 * imagens.length;
  for (const { tamanho, png } of imagens) {
    const entrada = Buffer.alloc(16);
    /* No formato, 0 significa 256. */
    entrada.writeUInt8(tamanho % 256, 0);
    entrada.writeUInt8(tamanho % 256, 1);
    entrada.writeUInt16LE(1, 4);
    entrada.writeUInt16LE(32, 6);
    entrada.writeUInt32LE(png.length, 8);
    entrada.writeUInt32LE(posicao, 12);
    entradas.push(entrada);
    posicao += png.length;
  }
  return Buffer.concat([cabecalho, ...entradas, ...imagens.map((i) => i.png)]);
}

async function rasterizar(janela, svg, tamanho) {
  const dados = await janela.webContents.executeJavaScript(`(async () => {
    const imagem = new Image();
    imagem.src = "data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}";
    await imagem.decode();
    const tela = document.createElement("canvas");
    tela.width = tela.height = ${tamanho};
    tela.getContext("2d").drawImage(imagem, 0, 0, ${tamanho}, ${tamanho});
    return tela.toDataURL("image/png");
  })()`);
  return Buffer.from(dados.split(",")[1], "base64");
}

function escrever(destino, conteudo) {
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, conteudo);
  console.log(`${String(conteudo.length).padStart(7)} bytes  ${destino.slice(raiz.length + 1)}`);
}

async function gerar() {
  const pequeno = readFileSync(join(pastaIcone, "icone-16.svg"), "utf8");
  const grande = desenhoGrande();
  const janela = new BrowserWindow({ show: false });
  await janela.loadURL("about:blank");

  const imagens = [];
  for (const tamanho of TAMANHOS) {
    imagens.push({ tamanho, png: await rasterizar(janela, tamanho <= LIMITE_DESENHO_PEQUENO ? pequeno : grande, tamanho) });
  }

  escrever(join(raiz, "apps", "desktop", "build", "icon.ico"), montarIco(imagens));
  escrever(join(raiz, "apps", "web", "public", "favicon.ico"), montarIco(imagens.filter((i) => i.tamanho <= 48)));
  copyFileSync(join(pastaIcone, "icone-16.svg"), join(raiz, "apps", "web", "public", "favicon.svg"));

  const pasta = process.env.ODM_ICONES_PNG;
  if (pasta) for (const { tamanho, png } of imagens) escrever(join(pasta, `icone-${tamanho}.png`), png);
}

/* Sem await no topo: num módulo ES, o Electron espera o arquivo terminar antes de ficar pronto, e os dois travariam. */
app
  .whenReady()
  .then(gerar)
  .then(
    () => app.exit(0),
    (erro) => {
      console.error(erro);
      app.exit(1);
    },
  );
