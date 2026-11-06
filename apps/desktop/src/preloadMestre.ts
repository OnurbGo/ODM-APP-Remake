import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("odmDesktop", {
  tokenMestre: () => ipcRenderer.invoke("mestre:token"),
  firewall: {
    estado: () => ipcRenderer.invoke("mestre:firewall-estado"),
    liberar: () => ipcRenderer.invoke("mestre:firewall-liberar"),
  },
});
