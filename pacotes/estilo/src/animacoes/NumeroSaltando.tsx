import css from "./NumeroSaltando.module.css";

type Props = {
  valor: number;
  tipo: "dano" | "cura";
  aoTerminar?: () => void;
};

export function NumeroSaltando({ valor, tipo, aoTerminar }: Props) {
  return (
    <span className={`${css.numero} ${css[tipo]} odm-numero`} onAnimationEnd={aoTerminar} aria-hidden="true">
      {tipo === "dano" ? "−" : "+"}
      {valor}
    </span>
  );
}
