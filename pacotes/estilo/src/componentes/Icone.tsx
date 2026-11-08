const CAMINHOS = {
  combate: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2.5v6M12 15.5v6M2.5 12h6M15.5 12h6" />
    </>
  ),
  personagem: (
    <>
      <path d="M2.5 15.5c3 1.8 16 1.8 19 0-1.5-.4-3.2-1-3.8-2.2L16.500 7c-.4-1.500-2-1.600-3-.8-.9.7-2.100.7-3 0-1-.8-2.600-.7-3 .8L6.300 13.300c-.6 1.200-2.300 1.800-3.800 2.200Z" />
      <path d="M6.5 12.5c3.5 1 7.5 1 11 0" />
    </>
  ),
  habilidades: <path d="m12 3 2.7 5.8 6.3.8-4.600 4.300 1.200 6.200L12 17l-5.600 3.100 1.200-6.200L3 9.600l6.300-.8L12 3Z" />,
  inventario: (
    <>
      <path d="M8 8V6.500A2.500 2.500 0 0 1 10.500 4h3A2.500 2.500 0 0 1 16 6.500V8" />
      <path d="M4.5 8h15l1 11.500h-17L4.5 8Z" />
      <path d="M4.300 12c5 2 10.400 2 15.400 0M12 13.500V16" />
    </>
  ),
  notas: (
    <>
      <path d="M20 3.500C13.500 4 8.500 8.500 7 15.500" />
      <path d="M20 3.500c.3 6-3.800 10.500-11 11.700" />
      <path d="M5.500 20.500 7 15.500" />
    </>
  ),
  campanha: (
    <>
      <path d="M3 6.500 8.500 4l7 2.500L21 4v13.500L15.500 20l-7-2.500L3 20V6.500Z" />
      <path d="M8.500 4v13.500M15.500 6.500V20" />
    </>
  ),
  registro: (
    <>
      <path d="M7 3.500h12V19a2 2 0 0 1-2 2H6" />
      <path d="M6 21a2 2 0 0 1-2-2v-3h11v3a2 2 0 0 0 2 2" />
      <path d="M10.500 8h5M10.500 12h5" />
    </>
  ),
  desfazer: (
    <>
      <path d="M8 4.500 3.500 9 8 13.500" />
      <path d="M3.500 9H14a6 6 0 0 1 0 12h-3" />
    </>
  ),
  fechar: <path d="M5 5l14 14M19 5 5 19" />,
  copiar: (
    <>
      <rect x="8.500" y="8.500" width="12" height="12" rx="1.500" />
      <path d="M15.500 8.500V5A1.500 1.500 0 0 0 14 3.500H5A1.500 1.500 0 0 0 3.500 5v9A1.500 1.500 0 0 0 5 15.500h3.500" />
    </>
  ),
  alerta: (
    <>
      <path d="M12 3.500 22 20.500H2L12 3.500Z" />
      <path d="M12 10v5M12 17.500v.5" />
    </>
  ),
  seta: <path d="m9 5 7 7-7 7" />,
} as const;

export type NomeIcone = keyof typeof CAMINHOS;

export function Icone({ nome, tamanho = 24 }: { nome: NomeIcone; tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {CAMINHOS[nome]}
    </svg>
  );
}
