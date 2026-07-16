import { obsManager } from './obs-manager';
import { loadBackup } from './backup-store';
import { getSystemInfo, getOsPlatform } from './system-info';
import { getPeripherals } from './peripherals';
import {
  getRemoteAIUserMessage,
  getRemoteConsoleProfile,
  getRemoteMicProfile,
  getRemoteRecommendation,
  getRemoteRecommendationExplanation,
  postToRemoteAI,
} from './ai-remote';
import { getLocalRecommendation, getLocalRecommendationExplanation } from '../../shared/localRecommendation';
import { getLocalMicProfile } from '../../shared/localMicProfile';
import { getLocalConsoleProfile } from '../../shared/localConsoleProfile';
import {
  validateAIRecommendationExplanationRequest,
  validateAIRecommendationRequest,
  validateApplyGuidedSourceDevice,
  validateBeginGuidedSource,
  validateConsoleProfileRequest,
  validateCreateGuidedSourceConfig,
  validateInputName,
  validateMicProfileRequest,
  validateOBSAudioConfig,
  validateOBSConfig,
  validateOBSConnectionSettings,
  validateSceneName,
  validateSetCameraLayout,
} from '../../shared/validation';
import type {
  AIRecommendationExplanationRequest,
  AIRecommendationRequest,
  ApplyGuidedSourceDeviceInput,
  BeginGuidedSourceInput,
  ConsoleProfileRequest,
  CreateGuidedSourceConfig,
  MicProfileRequest,
  OBSAudioConfig,
  OBSConfig,
  OBSConnectionSettings,
  SetCameraLayoutInput,
} from '../../shared/types';

// Sustituye al puente IPC de Electron: misma forma que window.electronAPI,
// pero llamando a obsManager y a la API serverless directamente desde el navegador.
void obsManager.initialize();

async function searchWeb(query: string): Promise<string[]> {
  try {
    const payload = await postToRemoteAI('/api/web-search', { query });
    const sources = typeof payload === 'object' && payload !== null
      ? (payload as { sources?: unknown }).sources
      : undefined;
    return Array.isArray(sources) ? sources.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export const appAPI = {
  obs: {
    connect: async (settings: OBSConnectionSettings) => {
      const validation = validateOBSConnectionSettings(settings);
      if (!validation.success) {
        return { success: false, message: validation.message };
      }
      return obsManager.connect(validation.value);
    },
    disconnect: async () => obsManager.disconnect(),
    getStatus: async () => obsManager.getStatus(),
    getSettingsSnapshot: async () => obsManager.getSettingsSnapshot(),
    getAudioSnapshot: async () => obsManager.getAudioSnapshot(),
    getLastBackup: async () => {
      const backup = await loadBackup();
      return backup
        ? { success: true, message: 'Respaldo disponible', backup }
        : { success: false, message: 'No hay respaldo guardado' };
    },
    restoreLastBackup: async () => {
      const backup = await loadBackup();
      if (!backup) {
        return { success: false, message: 'No hay respaldo guardado', warnings: [] as string[] };
      }
      return obsManager.restoreSnapshot(backup.snapshot);
    },
    configure: async (config: OBSConfig) => {
      const validation = validateOBSConfig(config);
      if (!validation.success) {
        return { success: false, message: validation.message };
      }
      return obsManager.configure(validation.value);
    },
    configureAudio: async (config: OBSAudioConfig) => {
      const validation = validateOBSAudioConfig(config);
      if (!validation.success) {
        return { success: false, message: validation.message, warnings: [] as string[] };
      }
      return obsManager.configureAudio(validation.value);
    },
    getScenes: async () => obsManager.getScenesSnapshot(),
    createScene: async (name: string) => {
      const validation = validateSceneName(name);
      if (!validation.success) {
        return { success: false, message: validation.message };
      }
      return obsManager.createScene(validation.value);
    },
    setCurrentScene: async (name: string) => {
      const validation = validateSceneName(name);
      if (!validation.success) {
        return { success: false, message: validation.message };
      }
      return obsManager.setCurrentScene(validation.value);
    },
    removeScene: async (name: string) => {
      const validation = validateSceneName(name);
      if (!validation.success) {
        return { success: false, message: validation.message };
      }
      return obsManager.removeScene(validation.value);
    },
    getSourceKinds: async () => obsManager.getAvailableSourceKinds(),
    getSceneSources: async (name: string) => {
      const validation = validateSceneName(name);
      if (!validation.success) {
        return { success: false, message: validation.message };
      }
      return obsManager.getSceneSources(validation.value);
    },
    beginGuidedSource: async (arg: BeginGuidedSourceInput) => {
      const validation = validateBeginGuidedSource(arg);
      if (!validation.success) {
        return { success: false, message: validation.message, warnings: [] as string[] };
      }
      return obsManager.beginGuidedSource(validation.value.sceneName, validation.value.friendly);
    },
    applyGuidedSourceDevice: async (arg: ApplyGuidedSourceDeviceInput) => {
      const validation = validateApplyGuidedSourceDevice(arg);
      if (!validation.success) {
        return { success: false, message: validation.message, warnings: [] as string[] };
      }
      return obsManager.applyGuidedSourceDevice(validation.value);
    },
    cancelGuidedSource: async (name: string) => {
      const validation = validateInputName(name);
      if (!validation.success) {
        return { success: false, message: validation.message };
      }
      return obsManager.cancelGuidedSource(validation.value);
    },
    createGuidedSource: async (config: CreateGuidedSourceConfig) => {
      const validation = validateCreateGuidedSourceConfig(config);
      if (!validation.success) {
        return { success: false, message: validation.message, warnings: [] as string[] };
      }
      return obsManager.createGuidedSource(validation.value);
    },
    removeSource: async (name: string) => {
      const validation = validateInputName(name);
      if (!validation.success) {
        return { success: false, message: validation.message };
      }
      return obsManager.removeInput(validation.value);
    },
    setCameraLayout: async (arg: SetCameraLayoutInput) => {
      const validation = validateSetCameraLayout(arg);
      if (!validation.success) {
        return { success: false, message: validation.message, warnings: [] as string[] };
      }
      return obsManager.setCameraLayout(validation.value.sceneName, validation.value.sceneItemId, validation.value.layout);
    },
    createCameraScene: async (arg: { sceneName: string; inputName: string; deviceId: string; propertyName: string }) => {
      const sceneName = validateSceneName(arg.sceneName);
      if (!sceneName.success) return { success: false, message: sceneName.message, warnings: [] as string[] };
      const inputName = validateInputName(arg.inputName);
      if (!inputName.success) return { success: false, message: inputName.message, warnings: [] as string[] };
      if (arg.deviceId.trim().length === 0) {
        return { success: false, message: 'Selecciona una camara valida.', warnings: [] as string[] };
      }
      if (arg.propertyName.trim().length === 0) {
        return { success: false, message: 'Falta la propiedad del dispositivo.', warnings: [] as string[] };
      }
      return obsManager.createCameraScene(sceneName.value, inputName.value, arg.deviceId.trim(), arg.propertyName.trim());
    },
    setSourceToBottom: async (arg: { sceneName: string; sceneItemId: number }) => {
      return obsManager.setSourceToBottom(arg.sceneName, arg.sceneItemId);
    },
    renameSource: async (arg: { inputName: string; newInputName: string }) => {
      const current = validateInputName(arg.inputName);
      if (!current.success) return { success: false, message: current.message };
      const next = validateInputName(arg.newInputName);
      if (!next.success) return { success: false, message: next.message };
      return obsManager.renameInput(current.value, next.value);
    },
    setSourceEnabled: async (arg: { sceneName: string; sceneItemId: number; enabled: boolean }) => {
      return obsManager.setSceneItemEnabled(arg.sceneName, arg.sceneItemId, arg.enabled);
    },
    sourceScreenshot: async (arg: { sourceName: string; maxWidth?: number }) => {
      if (arg.sourceName.trim().length === 0) {
        return { success: false, message: 'Falta el nombre de la fuente.' };
      }
      return obsManager.getSourceScreenshot(arg.sourceName, arg.maxWidth);
    },
    getCaptureCapabilities: async (arg: { deviceName?: string }) => {
      return obsManager.getCaptureCapabilities(arg.deviceName);
    },
    onConnectionChanged: (callback: (status: { connected: boolean; message: string }) => void) => {
      obsManager.onStatusChange(callback);
      return () => {
        obsManager.onStatusChange(() => undefined);
      };
    },
  },
  system: {
    getInfo: async () => getSystemInfo(),
    getPeripherals: async () => getPeripherals(),
  },
  ai: {
    getRecommendation: async (rawRequest: AIRecommendationRequest) => {
      const validation = validateAIRecommendationRequest(rawRequest);
      if (!validation.success) {
        throw new Error(validation.message);
      }

      const request: AIRecommendationRequest = validation.value;
      try {
        return await getRemoteRecommendation(request);
      } catch (error) {
        console.error('Error getting integrated AI recommendation:', error);
        const localRecommendation = getLocalRecommendation(request);
        return {
          ...localRecommendation,
          reasoning: `${localRecommendation.reasoning} IA integrada no disponible: ${getRemoteAIUserMessage(error)}`,
        };
      }
    },
    explainRecommendation: async (rawRequest: AIRecommendationExplanationRequest) => {
      const validation = validateAIRecommendationExplanationRequest(rawRequest);
      if (!validation.success) {
        throw new Error(validation.message);
      }

      const request: AIRecommendationExplanationRequest = validation.value;
      try {
        return await getRemoteRecommendationExplanation(request);
      } catch (error) {
        console.error('Error explaining integrated AI recommendation:', error);
        const localExplanation = getLocalRecommendationExplanation(request);
        return {
          ...localExplanation,
          reasoning: `${localExplanation.reasoning} IA integrada no disponible: ${getRemoteAIUserMessage(error)}`,
        };
      }
    },
    profileMicrophone: async (rawRequest: MicProfileRequest) => {
      const validation = validateMicProfileRequest(rawRequest);
      if (!validation.success) {
        throw new Error(validation.message);
      }

      const request: MicProfileRequest = { ...validation.value, os: getOsPlatform() };
      try {
        return await getRemoteMicProfile(request);
      } catch (error) {
        console.error('Error profiling microphone with integrated AI:', error);
        const localProfile = getLocalMicProfile(request);
        return {
          ...localProfile,
          reasoning: `${localProfile.reasoning} IA integrada no disponible: ${getRemoteAIUserMessage(error)}`,
        };
      }
    },
    profileConsole: async (rawRequest: ConsoleProfileRequest) => {
      const validation = validateConsoleProfileRequest(rawRequest);
      if (!validation.success) {
        throw new Error(validation.message);
      }

      const request: ConsoleProfileRequest = { ...validation.value, os: getOsPlatform() };
      try {
        return await getRemoteConsoleProfile(request);
      } catch (error) {
        console.error('Error profiling console with integrated AI:', error);
        // Intento 2: busqueda web via /api/web-search (Tavily en el servidor)
        const webSources = await searchWeb(`${request.captureCard} capture card specifications resolution fps`);
        const localProfile = getLocalConsoleProfile(request);
        return {
          ...localProfile,
          profile: {
            ...localProfile.profile,
            sources: webSources.length > 0 ? webSources : localProfile.profile.sources,
            research: {
              status: webSources.length > 0 ? 'verified' as const : 'no_results' as const,
              provider: 'tavily' as const,
              sourceCount: webSources.length,
            },
          },
          reasoning: `${localProfile.reasoning}${webSources.length > 0 ? ' [Fuentes navegadas via Tavily]' : ' IA integrada no disponible: ' + getRemoteAIUserMessage(error)}`,
        };
      }
    },
  },
};
