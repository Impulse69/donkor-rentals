import { contextBridge, ipcRenderer } from 'electron';

const api = {
  ping: (): Promise<string> => ipcRenderer.invoke('ping'),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
} as const;

export type DonkorApi = typeof api;

contextBridge.exposeInMainWorld('donkor', api);
