import { Carregando } from "@odm/estilo";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import css from "./PainelMestre.module.css";

/* As cores vêm dos tokens, mas o tema sempre mantém escuro sobre claro: o leitor do celular exige. */
export function QrEndereco({ url }: { url: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [imagem, definirImagem] = useState<string | null>(null);
  const [falhou, definirFalhou] = useState(false);

  useEffect(() => {
    if (!caixa.current) return;
    const estilo = getComputedStyle(caixa.current);
    let ativo = true;
    QRCode.toDataURL(url, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: estilo.getPropertyValue("--qr-escuro").trim(), light: estilo.getPropertyValue("--qr-claro").trim() },
    })
      .then((dados) => {
        if (ativo) definirImagem(dados);
      })
      .catch(() => {
        if (ativo) definirFalhou(true);
      });
    return () => {
      ativo = false;
    };
  }, [url]);

  return (
    <div ref={caixa} className={css.qr}>
      {imagem ? (
        <img src={imagem} width={280} height={280} alt={`QR code para ${url}`} />
      ) : falhou ? (
        <p className={css.nota}>Não foi possível gerar o QR code. Use o endereço acima.</p>
      ) : (
        <Carregando rotulo="Gerando o QR code" />
      )}
      <p className={css.nota}>Aponte a câmera do celular. O código da mesa já vai preenchido.</p>
    </div>
  );
}
