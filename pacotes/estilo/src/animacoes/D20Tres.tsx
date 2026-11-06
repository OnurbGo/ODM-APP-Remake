import { useEffect, useRef } from "react";
import {
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";

type Props = {
  valores: number[];
  escolhido: number;
  duracaoMs: number;
  pulado: boolean;
  aoFalhar: () => void;
};

const COLUNAS = 5;
const LINHAS = 4;
const CELULA_L = 256;
const CELULA_A = 222;

function tokens(el: HTMLElement) {
  const estilo = getComputedStyle(el);
  const ler = (nome: string) => estilo.getPropertyValue(nome).trim();
  return { corpo: ler("--dado-corpo"), numero: ler("--dado-numero"), aresta: ler("--dado-aresta"), fonte: ler("--fonte-numero") };
}

/* Um triângulo por face numa textura só: uma imagem e um material, sem 20 desenhos. */
function desenharFaces(cores: ReturnType<typeof tokens>) {
  const tela = document.createElement("canvas");
  tela.width = COLUNAS * CELULA_L;
  tela.height = LINHAS * CELULA_A;
  const c = tela.getContext("2d")!;
  c.textAlign = "center";
  c.textBaseline = "middle";
  for (let n = 1; n <= 20; n++) {
    const x = ((n - 1) % COLUNAS) * CELULA_L;
    const y = Math.floor((n - 1) / COLUNAS) * CELULA_A;
    c.beginPath();
    c.moveTo(x + CELULA_L / 2, y);
    c.lineTo(x, y + CELULA_A);
    c.lineTo(x + CELULA_L, y + CELULA_A);
    c.closePath();
    c.fillStyle = cores.corpo;
    c.fill();
    c.lineWidth = 7;
    c.strokeStyle = cores.aresta;
    c.stroke();
    c.fillStyle = cores.numero;
    c.font = `92px ${cores.fonte}`;
    const cx = x + CELULA_L / 2;
    const cy = y + CELULA_A * 0.66;
    c.fillText(String(n), cx, cy);
    /* 6 e 9 ganham um traço, como nos dados de verdade. */
    if (n === 6 || n === 9) c.fillRect(cx - 18, cy + 44, 36, 6);
  }
  const textura = new CanvasTexture(tela);
  textura.colorSpace = SRGBColorSpace;
  textura.anisotropy = 4;
  return textura;
}

type Face = { numero: number; normal: Vector3; cima: Vector3 };

/* Numera as faces com opostas somando 21 e aponta a UV de cada uma para sua célula. */
function montarGeometria() {
  const geo = new IcosahedronGeometry(1, 0);
  const pos = geo.getAttribute("position");
  const faces: { a: Vector3; normal: Vector3; centro: Vector3; numero: number }[] = [];
  for (let i = 0; i < 20; i++) {
    const a = new Vector3().fromBufferAttribute(pos, i * 3);
    const b = new Vector3().fromBufferAttribute(pos, i * 3 + 1);
    const c = new Vector3().fromBufferAttribute(pos, i * 3 + 2);
    const centro = a.clone().add(b).add(c).divideScalar(3);
    faces.push({ a, centro, normal: centro.clone().normalize(), numero: 0 });
  }
  let proximo = 1;
  for (const face of faces) {
    if (face.numero) continue;
    const oposta = faces.find((f) => !f.numero && f !== face && f.normal.dot(face.normal) < -0.99)!;
    /* Alterna altos e baixos, para o 20 não ficar vizinho de todos os números altos. */
    face.numero = proximo % 2 ? proximo : 21 - proximo;
    oposta.numero = 21 - face.numero;
    proximo += 1;
  }
  const uv: number[] = [];
  faces.forEach((f) => {
    const col = (f.numero - 1) % COLUNAS;
    const lin = Math.floor((f.numero - 1) / COLUNAS);
    const u = (k: number) => (col + k) / COLUNAS;
    const v = (k: number) => 1 - (lin + k) / LINHAS;
    uv.push(u(0.5), v(0), u(0), v(1), u(1), v(1));
  });
  geo.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  const dados: Face[] = faces.map((f) => ({ numero: f.numero, normal: f.normal, cima: f.a.clone().sub(f.centro).normalize() }));
  return { geo, faces: dados };
}

const Z = new Vector3(0, 0, 1);

/* Rotação que deixa a face de frente para a câmera, com o número em pé e uma leve inclinação. */
function orientacaoFinal(face: Face, inclinacao: number) {
  const q1 = new Quaternion().setFromUnitVectors(face.normal, Z);
  const cima = face.cima.clone().applyQuaternion(q1);
  const q2 = new Quaternion().setFromAxisAngle(Z, Math.atan2(cima.x, cima.y));
  const inclina = new Quaternion().setFromAxisAngle(new Vector3(1, inclinacao, 0).normalize(), -0.2);
  return inclina.multiply(q2).multiply(q1);
}

export default function D20Tres({ valores, escolhido, duracaoMs, pulado, aoFalhar }: Props) {
  const tela = useRef<HTMLCanvasElement>(null);
  const puladoRef = useRef(pulado);
  puladoRef.current = pulado;

  useEffect(() => {
    const canvas = tela.current;
    if (!canvas) return;

    let render: WebGLRenderer;
    try {
      render = new WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      aoFalhar();
      return;
    }

    const largura = canvas.clientWidth || 320;
    const altura = canvas.clientHeight || 260;
    render.setPixelRatio(Math.min(devicePixelRatio, 2));
    render.setSize(largura, altura, false);

    const cena = new Scene();
    const camera = new PerspectiveCamera(30, largura / altura, 0.1, 50);
    camera.position.z = 7;

    cena.add(new AmbientLight(0xffffff, 1.3));
    const luz = new DirectionalLight(0xffffff, 2.6);
    luz.position.set(2, 3, 6);
    cena.add(luz);

    const { geo, faces } = montarGeometria();
    const textura = desenharFaces(tokens(canvas));

    const visivelA = 2 * Math.tan((15 * Math.PI) / 180) * 7;
    const visivelL = visivelA * (largura / altura);
    const n = valores.length;
    const escala = Math.min(n === 1 ? 1.35 : 1.05, (visivelL * 0.92) / (n * 2.3));
    const passo = escala * 2.3;

    const dados = valores.map((valor, i) => {
      /* Pouco reflexo: o brilho não pode lavar a face de cima, onde está o número que importa. */
      const material = new MeshStandardMaterial({ map: textura, flatShading: true, metalness: 0.05, roughness: 0.75 });
      const malha = new Mesh(geo, material);
      malha.scale.setScalar(escala);
      cena.add(malha);
      const face = faces.find((f) => f.numero === valor) ?? faces[0];
      return {
        malha,
        material,
        alvo: orientacaoFinal(face, i % 2 ? -0.5 : 0.5),
        eixoA: new Vector3(1, 0.4 + i * 0.3, 0.2).normalize(),
        eixoB: new Vector3(-0.3, 1, 0.5 - i * 0.4).normalize(),
        x: (i - (n - 1) / 2) * passo,
        atraso: i * 0.06,
      };
    });

    const q = new Quaternion();
    const giro = new Quaternion();
    const giro2 = new Quaternion();
    const ESCURO = new Color(0.4, 0.4, 0.4);

    function posar(t: number) {
      dados.forEach((d, i) => {
        const local = Math.min(1, Math.max(0, (t - d.atraso) / (1 - d.atraso)));
        const resto = 1 - local;
        const e = 1 - resto ** 3;
        /* Quanto falta girar some em zero no fim: o dado sempre para na face certa. */
        giro.setFromAxisAngle(d.eixoA, (1 - e) * 15);
        giro2.setFromAxisAngle(d.eixoB, (1 - e) * 9);
        q.copy(d.alvo).multiply(giro).multiply(giro2);
        d.malha.quaternion.copy(q);
        d.malha.position.x = d.x - resto * resto * 3.2;
        d.malha.position.y = Math.abs(Math.cos(e * Math.PI * 2.5)) * resto ** 1.4 * 2.2;
        d.material.color.set(local >= 1 && i !== escolhido ? ESCURO : 0xffffff);
      });
      render.render(cena, camera);
    }

    let quadro = 0;
    const inicio = performance.now();
    const passar = (agora: number) => {
      const t = duracaoMs > 0 && !puladoRef.current ? Math.min(1, (agora - inicio) / duracaoMs) : 1;
      posar(t);
      if (t < 1) quadro = requestAnimationFrame(passar);
    };
    quadro = requestAnimationFrame(passar);

    return () => {
      cancelAnimationFrame(quadro);
      geo.dispose();
      textura.dispose();
      dados.forEach((d) => d.material.dispose());
      render.dispose();
    };
    // A cena é montada uma vez por rolagem; a chave do componente troca a cada rolagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Pular depois que o laço terminou não existe; durante o laço, o próximo quadro já assenta. */
  return <canvas ref={tela} className="odm-d20-tela" aria-hidden="true" />;
}
