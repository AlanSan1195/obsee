import { contextBridge, ipcRenderer } from 'electron';
import type { AIRecommendationExplanationRequest, AIRecommendationRequest, ApplyGuidedSourceDeviceInput, BeginGuidedSourceInput, ConsoleProfileRequest, CreateGuidedSourceConfig, MicProfileRequest, OBSAudioConfig, OBSConfig, OBSConnectionSettings, SetCameraLayoutInput } from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  obs: {
    connect: (settings: OBSConnectionSettings) => ipcRenderer.invoke('obs:connect', settings),
    disconnect: () => ipcRenderer.invoke('obs:disconnect'),
    getStatus: () => ipcRenderer.invoke('obs:get-status'),
    getSettingsSnapshot: () => ipcRenderer.invoke('obs:get-settings-snapshot'),
    getAudioSnapshot: () => ipcRenderer.invoke('obs:get-audio-snapshot'),
    getLastBackup: () => ipcRenderer.invoke('obs:get-last-backup'),
    restoreLastBackup: () => ipcRenderer.invoke('obs:restore-last-backup'),
    configure: (config: OBSConfig) => ipcRenderer.invoke('obs:configure', config),
    configureAudio: (config: OBSAudioConfig) => ipcRenderer.invoke('obs:configure-audio', config),
    getScenes: () => ipcRenderer.invoke('obs:get-scenes'),
    createScene: (name: string) => ipcRenderer.invoke('obs:create-scene', name),
    setCurrentScene: (name: string) => ipcRenderer.invoke('obs:set-current-scene', name),
    removeScene: (name: string) => ipcRenderer.invoke('obs:remove-scene', name),
    getSourceKinds: () => ipcRenderer.invoke('obs:get-source-kinds'),
    getSceneSources: (name: string) => ipcRenderer.invoke('obs:get-scene-sources', name),
    beginGuidedSource: (arg: BeginGuidedSourceInput) => ipcRenderer.invoke('obs:begin-guided-source', arg),
    applyGuidedSourceDevice: (arg: ApplyGuidedSourceDeviceInput) => ipcRenderer.invoke('obs:apply-guided-source-device', arg),
    setCameraLayout: (arg: SetCameraLayoutInput) => ipcRenderer.invoke('obs:set-camera-layout', arg),
    setSourceToBottom: (arg: { sceneName: string; sceneItemId: number }) => ipcRenderer.invoke('obs:set-source-to-bottom', arg),
    createCameraScene: (arg: { sceneName: string; inputName: string; deviceId: string; propertyName: string }) => ipcRenderer.invoke('obs:create-camera-scene', arg),
    cancelGuidedSource: (name: string) => ipcRenderer.invoke('obs:cancel-guided-source', name),
    createGuidedSource: (config: CreateGuidedSourceConfig) => ipcRenderer.invoke('obs:create-guided-source', config),
    removeSource: (name: string) => ipcRenderer.invoke('obs:remove-source', name),
    renameSource: (arg: { inputName: string; newInputName: string }) => ipcRenderer.invoke('obs:rename-source', arg),
    setSourceEnabled: (arg: { sceneName: string; sceneItemId: number; enabled: boolean }) => ipcRenderer.invoke('obs:set-source-enabled', arg),
    sourceScreenshot: (arg: { sourceName: string; maxWidth?: number }) => ipcRenderer.invoke('obs:source-screenshot', arg),
    getCaptureCapabilities: (arg: { deviceName?: string }) => ipcRenderer.invoke('obs:get-capture-capabilities', arg),
    pickImageFile: () => ipcRenderer.invoke('obs:pick-image-file'),
    onConnectionChanged: (callback: (status: { connected: boolean; message: string }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        status: { connected: boolean; message: string },
      ) => callback(status);
      ipcRenderer.on('obs:connection-changed', listener);
      return () => ipcRenderer.removeListener('obs:connection-changed', listener);
    },
  },
  system: {
    getInfo: () => ipcRenderer.invoke('system:get-info'),
    getPeripherals: () => ipcRenderer.invoke('system:get-peripherals'),
  },
  ai: {
    getRecommendation: (request: AIRecommendationRequest) => ipcRenderer.invoke('ai:get-recommendation', request),
    explainRecommendation: (request: AIRecommendationExplanationRequest) => ipcRenderer.invoke('ai:explain-recommendation', request),
    profileMicrophone: (request: MicProfileRequest) => ipcRenderer.invoke('ai:profile-microphone', request),
    profileConsole: (request: ConsoleProfileRequest) => ipcRenderer.invoke('ai:profile-console', request),
  },
});
