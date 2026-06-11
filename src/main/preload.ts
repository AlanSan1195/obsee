import { contextBridge, ipcRenderer } from 'electron';
import type { AIRecommendationRequest, OBSAudioConfig, OBSConfig, OBSConnectionSettings } from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  obs: {
    connect: (settings: OBSConnectionSettings) => ipcRenderer.invoke('obs:connect', settings),
    disconnect: () => ipcRenderer.invoke('obs:disconnect'),
    getStatus: () => ipcRenderer.invoke('obs:get-status'),
    getSettingsSnapshot: () => ipcRenderer.invoke('obs:get-settings-snapshot'),
    getAudioSnapshot: () => ipcRenderer.invoke('obs:get-audio-snapshot'),
    configure: (config: OBSConfig) => ipcRenderer.invoke('obs:configure', config),
    configureAudio: (config: OBSAudioConfig) => ipcRenderer.invoke('obs:configure-audio', config),
  },
  system: {
    getInfo: () => ipcRenderer.invoke('system:get-info'),
  },
  ai: {
    getRecommendation: (request: AIRecommendationRequest) => ipcRenderer.invoke('ai:get-recommendation', request),
  },
});
