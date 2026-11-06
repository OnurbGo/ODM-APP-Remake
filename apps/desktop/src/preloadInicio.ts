import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("odmInicio", {
  abrirMesa: () => ipcRenderer.invoke("inicio:abrir-mesa"),
  trocarPorta: (porta: number) => ipcRenderer.invoke("inicio:trocar-porta", porta),
  entrarEmMesa: (endereco: string) => ipcRenderer.invoke("inicio:entrar", endereco),
});
