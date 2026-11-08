import { useEffect, useState } from "react";
import { tokenDaSessao } from "./loja";

/* Arte dos livros (rosto ou corpo, em WebP). O pedido leva o token no cabeçalho, como o conteúdo da ficha,
   e a tela recebe um endereço blob: local. Cada imagem é baixada uma vez por sessão. Sem permissão ou sem
   arte para o id, volta null, e quem chama mostra o sinal de sempre. */
export type TipoDeImagem = "rosto" | "corpo" | "arquivo";

const cache = new Map<string, Promise<string | null>>();

function baixar(id: string, tipo: TipoDeImagem): Promise<string | null> {
  const chave = `${tipo}/${id}`;
  const pronta = cache.get(chave);
  if (pronta) return pronta;
  const token = tokenDaSessao();
  const promessa = fetch(`/api/imagem/${tipo}/${encodeURIComponent(id)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then(async (r) => (r.ok ? URL.createObjectURL(await r.blob()) : null))
    .catch(() => null);
  cache.set(chave, promessa);
  /* Falha de rede não fica guardada: a próxima tela tenta de novo. */
  void promessa.then((url) => {
    if (url === null) cache.delete(chave);
  });
  return promessa;
}

export function useImagem(id: string | null | undefined, tipo: TipoDeImagem = "rosto"): string | null {
  const [url, definir] = useState<string | null>(null);
  useEffect(() => {
    if (!id) {
      definir(null);
      return;
    }
    let vivo = true;
    void baixar(id, tipo).then((u) => vivo && definir(u));
    return () => {
      vivo = false;
    };
  }, [id, tipo]);
  return url;
}

/* Imagem de NPC ou do "Mostrar": arte do pacote (corpo) ou arquivo enviado pelo mestre. */
export function useImagemDaRef(ref: { origem: "pacote" | "arquivo"; id: string } | null | undefined): string | null {
  return useImagem(ref?.id, ref?.origem === "arquivo" ? "arquivo" : "corpo");
}

/* Envio do mestre: a imagem é reduzida aqui mesmo (canvas → WebP, lado maior até 1600 px, até ~300 kB),
   sem dependência nativa, e vai para o servidor da mesa. Devolve o id ou a mensagem de erro. */
export async function enviarImagem(arquivo: File, caixa: { largura: number; altura: number } = { largura: 1600, altura: 1600 }): Promise<{ id: string } | { erro: string }> {
  if (!arquivo.type.startsWith("image/")) return { erro: "Escolha um arquivo de imagem." };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(arquivo);
  } catch {
    return { erro: "Não foi possível ler essa imagem." };
  }
  let fator = 1;
  let blob: Blob | null = null;
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const escala = Math.min(1, (caixa.largura * fator) / bitmap.width, (caixa.altura * fator) / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * escala));
    canvas.height = Math.max(1, Math.round(bitmap.height * escala));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/webp", tentativa < 3 ? 0.82 : 0.7));
    if (blob && blob.size <= 300_000) break;
    fator *= 0.75;
  }
  bitmap.close();
  if (!blob || blob.size > 600_000) return { erro: "A imagem ficou grande demais mesmo reduzida." };
  const dados = await new Promise<string>((ok) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(String(leitor.result).replace(/^data:[^,]+,/, ""));
    leitor.readAsDataURL(blob!);
  });
  const token = tokenDaSessao();
  const resposta = await fetch("/api/arquivo", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ tipo: blob.type || "image/webp", dados }),
  }).catch(() => null);
  if (!resposta?.ok) return { erro: "O servidor da mesa não aceitou a imagem." };
  return (await resposta.json()) as { id: string };
}
