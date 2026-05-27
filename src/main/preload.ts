import { contextBridge, ipcRenderer } from 'electron';
import type { AIRecommendationRequest, OBSConfig, OBSConnectionSettings } from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  obs: {
    connect: (settings: OBSConnectionSettings) => ipcRenderer.invoke('obs:connect', settings),
    disconnect: () => ipcRenderer.invoke('obs:disconnect'),
    getStatus: () => ipcRenderer.invoke('obs:get-status'),
    configure: (config: OBSConfig) => ipcRenderer.invoke('obs:configure', config),
  },
  system: {
    getInfo: () => ipcRenderer.invoke('system:get-info'),
  },
  ai: {
    getRecommendation: (request: AIRecommendationRequest) => ipcRenderer.invoke('ai:get-recommendation', request),
  },
});
