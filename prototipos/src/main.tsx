import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@odm/estilo/estilo.css";
import "./tema-ordem-rascunho.css";
import { App } from "./App";

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
