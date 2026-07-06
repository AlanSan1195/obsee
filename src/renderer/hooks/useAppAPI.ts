import { useAppStore } from '../store';
import { inferObsUsage } from '../../shared/obsUsage';
import { appAPI } from '../lib/app-api';
import type { AIRecommendationExplanationRequest, AIRecommendationRequest, ApplyGuidedSourceDeviceInput, BeginGuidedSourceInput, BeginGuidedSourceResult, CameraLayout, CaptureCapabilities, ConsoleProfileRequest, ConsoleProfileResponse, CreateGuidedSourceConfig, MicProfileRequest, MicProfileResponse, OBSAudioConfig, OBSConfig, OBSConnectionSettings, PeripheralsSnapshot } from '../../shared/types';

function getElectronAPI() {
  return appAPI;
}

export function useElectronAPI() {
  const setSystemInfo = useAppStore((state) => state.setSystemInfo);
  const setRecommendation = useAppStore((state) => state.setRecommendation);
  const setObsConnected = useAppStore((state) => state.setObsConnected);
  const setObsSettingsSnapshot = useAppStore((state) => state.setObsSettingsSnapshot);
  const setObsAudioSnapshot = useAppStore((state) => state.setObsAudioSnapshot);
  const setObsMessage = useAppStore((state) => state.setObsMessage);
  const setError = useAppStore((state) => state.setError);
  const setIsApplying = useAppStore((state) => state.setIsApplying);
  const setScenes = useAppStore((state) => state.setScenes);
  const setCurrentSceneName = useAppStore((state) => state.setCurrentSceneName);
  const setSelectedSceneName = useAppStore((state) => state.setSelectedSceneName);
  const setSceneSources = useAppStore((state) => state.setSceneSources);
  const setAvailableSourceKinds = useAppStore((state) => state.setAvailableSourceKinds);
  const setMicProfile = useAppStore((state) => state.setMicProfile);
  const setIsProfilingMic = useAppStore((state) => state.setIsProfilingMic);
  const setPeripherals = useAppStore((state) => state.setPeripherals);
  const setConsoleProfile = useAppStore((state) => state.setConsoleProfile);
  const setIsAnalyzingConsole = useAppStore((state) => state.setIsAnalyzingConsole);
  const setCaptureCapabilities = useAppStore((state) => state.setCaptureCapabilities);

  const getSystemInfo = async () => {
    try {
      const info = await getElectronAPI().system.getInfo();
      setSystemInfo(info);
      return info;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo leer la informacion del sistema');
      throw error;
    }
  };

  const getAIRecommendation = async (request: AIRecommendationRequest) => {
    try {
      const recommendation = await getElectronAPI().ai.getRecommendation(request);
      setRecommendation(recommendation);
      return recommendation;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo obtener la recomendacion de IA');
      throw error;
    }
  };

  const explainAIRecommendation = async (request: AIRecommendationExplanationRequest) => {
    try {
      return await getElectronAPI().ai.explainRecommendation(request);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo actualizar la explicacion de IA');
      throw error;
    }
  };

  const profileMicrophone = async (request: MicProfileRequest): Promise<MicProfileResponse | null> => {
    setIsProfilingMic(true);
    setError(null);
    try {
      const profile = await getElectronAPI().ai.profileMicrophone(request);
      setMicProfile(profile);
      return profile;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo analizar el microfono con IA');
      return null;
    } finally {
      setIsProfilingMic(false);
    }
  };

  const getCaptureCapabilities = async (deviceName?: string): Promise<CaptureCapabilities | null> => {
    try {
      const result = await getElectronAPI().obs.getCaptureCapabilities({ deviceName });
      if (result.success && result.capabilities) {
        setCaptureCapabilities(result.capabilities);
        return result.capabilities;
      }
      setError(result.message);
      return null;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudieron leer las capacidades de la capturadora');
      return null;
    }
  };

  const getPeripherals = async (): Promise<PeripheralsSnapshot | null> => {
    try {
      const peripherals = await getElectronAPI().system.getPeripherals();
      if (import.meta.env.DEV) {
        console.log('[peripherals] Detectados:', {
          capturadoras: peripherals.captureDevices,
          monitores: peripherals.displays,
        });
      }
      setPeripherals(peripherals);
      return peripherals;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudieron detectar los perifericos');
      return null;
    }
  };

  const profileConsole = async (request: ConsoleProfileRequest): Promise<ConsoleProfileResponse | null> => {
    setIsAnalyzingConsole(true);
    setError(null);
    try {
      const profile = await getElectronAPI().ai.profileConsole(request);
      if (import.meta.env.DEV) {
        const navSources = profile.profile?.sources ?? [];
        console.log('[console-profile] Respuesta IA:', {
          fuentesNavegadas: navSources.length > 0 ? navSources : 'NO (sources vacio: la IA no navego specs oficiales)',
          capturaRecomendada: `${profile.profile?.captureResolution} @${profile.profile?.captureFps}fps`,
          bottleneck: profile.profile?.bottleneck,
          origen: profile.source,
        });
      }
      setConsoleProfile(profile);
      // Reusa el flujo de aplicar de OBS: la recomendacion alimenta OBSComparison/ImportButton.
      setRecommendation({
        source: profile.source,
        recommendations: profile.recommendations,
        reasoning: profile.reasoning,
      });
      return profile;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo analizar la consola con IA');
      return null;
    } finally {
      setIsAnalyzingConsole(false);
    }
  };

  const connectToOBS = async (settings: OBSConnectionSettings) => {
    try {
      const result = await getElectronAPI().obs.connect(settings);
      setObsConnected(result.success);
      setObsMessage(result.message);
      if (result.success) {
        const snapshotResult = await getElectronAPI().obs.getSettingsSnapshot();
        if (snapshotResult.success && snapshotResult.snapshot) {
          setObsSettingsSnapshot(snapshotResult.snapshot);
          setObsAudioSnapshot(snapshotResult.snapshot.audio ?? null);
          // Autodetectar modo y plataforma desde la config que OBS ya tiene
          // (lo que el usuario eligio en el asistente inicial de OBS), sin pisar
          // una eleccion previa del usuario.
          const usage = inferObsUsage(snapshotResult.snapshot);
          const state = useAppStore.getState();
          if (!state.mode) state.setMode(usage.mode);
          if (!state.platform && usage.platform) state.setPlatform(usage.platform);
        } else {
          setObsSettingsSnapshot(null);
          setObsAudioSnapshot(null);
          setObsMessage(snapshotResult.message);
        }
        await Promise.all([
          refreshScenes().catch(() => undefined),
          loadSourceKinds().catch(() => undefined),
        ]);
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo conectar con OBS';
      setObsConnected(false);
      setObsMessage(message);
      setError(message);
      throw error;
    }
  };

  const disconnectFromOBS = async () => {
    const result = await getElectronAPI().obs.disconnect();
    setObsConnected(false);
    setObsSettingsSnapshot(null);
    setObsAudioSnapshot(null);
    setObsMessage(result.message);
    return result;
  };

  const refreshAudioSnapshot = async () => {
    const result = await getElectronAPI().obs.getAudioSnapshot();
    if (result.success && result.snapshot) {
      setObsAudioSnapshot(result.snapshot);
    }
    return result;
  };

  const applyAudioConfig = async (config: OBSAudioConfig) => {
    setIsApplying(true);
    try {
      const result = await getElectronAPI().obs.configureAudio(config);
      if (result.success && result.snapshot) {
        setObsAudioSnapshot(result.snapshot);
      }
      return result;
    } finally {
      setIsApplying(false);
    }
  };

  const applyConfig = async (config: OBSConfig) => {
    setIsApplying(true);
    try {
      const result = await getElectronAPI().obs.configure(config);
      if (result.success) {
        const snapshotResult = await getElectronAPI().obs.getSettingsSnapshot();
        if (snapshotResult.success && snapshotResult.snapshot) {
          setObsSettingsSnapshot(snapshotResult.snapshot);
          setObsAudioSnapshot(snapshotResult.snapshot.audio ?? null);
        }
      }
      return result;
    } finally {
      setIsApplying(false);
    }
  };

  const refreshScenes = async () => {
    const result = await getElectronAPI().obs.getScenes();
    if (result.success && result.snapshot) {
      setScenes(result.snapshot.scenes);
      setCurrentSceneName(result.snapshot.currentProgramSceneName ?? null);
      const selected = useAppStore.getState().selectedSceneName;
      const stillExists = selected && result.snapshot.scenes.some((scene) => scene.sceneName === selected);
      if (!stillExists) {
        setSelectedSceneName(result.snapshot.currentProgramSceneName ?? result.snapshot.scenes[0]?.sceneName ?? null);
      }
    }
    return result;
  };

  const loadSourceKinds = async () => {
    const result = await getElectronAPI().obs.getSourceKinds();
    if (result.success && result.resolved) {
      setAvailableSourceKinds(result.resolved);
    }
    return result;
  };

  const createScene = async (name: string) => {
    const result = await getElectronAPI().obs.createScene(name);
    if (result.success && result.snapshot) {
      setScenes(result.snapshot.scenes);
      setCurrentSceneName(result.snapshot.currentProgramSceneName ?? null);
      setSelectedSceneName(name);
      setSceneSources([]);
    } else if (!result.success) {
      setError(result.message);
    }
    return result;
  };

  const selectScene = async (name: string) => {
    setSelectedSceneName(name);
    const result = await getElectronAPI().obs.setCurrentScene(name);
    if (result.success) {
      setCurrentSceneName(name);
    } else {
      setError(result.message);
    }
    await loadSceneSources(name);
    return result;
  };

  const removeScene = async (name: string) => {
    const result = await getElectronAPI().obs.removeScene(name);
    if (result.success && result.snapshot) {
      setScenes(result.snapshot.scenes);
      setCurrentSceneName(result.snapshot.currentProgramSceneName ?? null);
      const next = result.snapshot.currentProgramSceneName ?? result.snapshot.scenes[0]?.sceneName ?? null;
      setSelectedSceneName(next);
      if (next) {
        await loadSceneSources(next);
      } else {
        setSceneSources([]);
      }
    } else if (!result.success) {
      setError(result.message);
    }
    return result;
  };

  const loadSceneSources = async (name: string) => {
    const result = await getElectronAPI().obs.getSceneSources(name);
    if (result.success && result.snapshot) {
      setSceneSources(result.snapshot.items);
    }
    return result;
  };

  const beginGuidedSource = async (arg: BeginGuidedSourceInput): Promise<BeginGuidedSourceResult> => {
    const result = await getElectronAPI().obs.beginGuidedSource(arg);
    if (!result.success) {
      setError(result.message);
    }
    return result;
  };

  const applyGuidedSourceDevice = async (arg: ApplyGuidedSourceDeviceInput) => {
    const result = await getElectronAPI().obs.applyGuidedSourceDevice(arg);
    if (!result.success) {
      setError(result.message);
    }
    return result;
  };

  const cancelGuidedSource = async (inputName: string) => {
    return getElectronAPI().obs.cancelGuidedSource(inputName);
  };

  const setCameraLayout = async (sceneName: string, sceneItemId: number, layout: CameraLayout) => {
    const result = await getElectronAPI().obs.setCameraLayout({ sceneName, sceneItemId, layout });
    if (!result.success) {
      setError(result.message);
    }
    return result;
  };

  const setSourceToBottom = async (sceneName: string, sceneItemId: number) => {
    return getElectronAPI().obs.setSourceToBottom({ sceneName, sceneItemId });
  };

  const createCameraScene = async (sceneName: string, inputName: string, deviceId: string, propertyName: string) => {
    const result = await getElectronAPI().obs.createCameraScene({ sceneName, inputName, deviceId, propertyName });
    if (!result.success) {
      setError(result.message);
    }
    return result;
  };

  const createGuidedSource = async (config: CreateGuidedSourceConfig) => {
    const result = await getElectronAPI().obs.createGuidedSource(config);
    if (!result.success) {
      setError(result.message);
    }
    return result;
  };

  const removeSource = async (name: string, sceneName: string) => {
    const result = await getElectronAPI().obs.removeSource(name);
    if (result.success) {
      await loadSceneSources(sceneName);
    } else {
      setError(result.message);
    }
    return result;
  };

  const renameSource = async (inputName: string, newInputName: string) => {
    const result = await getElectronAPI().obs.renameSource({ inputName, newInputName });
    if (!result.success) {
      setError(result.message);
    }
    return result;
  };

  const setSourceEnabled = async (sceneName: string, sceneItemId: number, enabled: boolean) => {
    const result = await getElectronAPI().obs.setSourceEnabled({ sceneName, sceneItemId, enabled });
    if (result.success) {
      await loadSceneSources(sceneName);
    } else {
      setError(result.message);
    }
    return result;
  };

  const getSourceScreenshot = async (sourceName: string, maxWidth?: number) => {
    return getElectronAPI().obs.sourceScreenshot({ sourceName, maxWidth });
  };

  const getLastBackup = async () => {
    return getElectronAPI().obs.getLastBackup();
  };

  const restoreLastBackup = async () => {
    const result = await getElectronAPI().obs.restoreLastBackup();
    if (result.success) {
      const snapshotResult = await getElectronAPI().obs.getSettingsSnapshot();
      if (snapshotResult.success && snapshotResult.snapshot) {
        setObsSettingsSnapshot(snapshotResult.snapshot);
        setObsAudioSnapshot(snapshotResult.snapshot.audio ?? null);
      }
      setObsMessage(result.message);
    } else {
      setError(result.message);
    }
    return result;
  };

  return {
    getSystemInfo,
    getAIRecommendation,
    explainAIRecommendation,
    connectToOBS,
    disconnectFromOBS,
    refreshAudioSnapshot,
    applyAudioConfig,
    applyConfig,
    getLastBackup,
    restoreLastBackup,
    refreshScenes,
    loadSourceKinds,
    createScene,
    selectScene,
    removeScene,
    loadSceneSources,
    beginGuidedSource,
    applyGuidedSourceDevice,
    cancelGuidedSource,
    setCameraLayout,
    setSourceToBottom,
    createCameraScene,
    createGuidedSource,
    removeSource,
    renameSource,
    setSourceEnabled,
    getSourceScreenshot,
    profileMicrophone,
    getPeripherals,
    getCaptureCapabilities,
    profileConsole,
  };
}

