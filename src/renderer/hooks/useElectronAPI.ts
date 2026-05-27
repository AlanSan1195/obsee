import { useAppStore } from '../store';
import type { AIRecommendation, AIRecommendationRequest, OBSConfig, OBSConnectionSettings, OBSSettingsSnapshot, SystemInfo } from '../../shared/types';

export function useElectronAPI() {
  const setSystemInfo = useAppStore((state) => state.setSystemInfo);
  const setRecommendation = useAppStore((state) => state.setRecommendation);
  const setObsConnected = useAppStore((state) => state.setObsConnected);
  const setObsSettingsSnapshot = useAppStore((state) => state.setObsSettingsSnapshot);
  const setObsMessage = useAppStore((state) => state.setObsMessage);
  const setError = useAppStore((state) => state.setError);
  const setIsApplying = useAppStore((state) => state.setIsApplying);

  const getSystemInfo = async () => {
    try {
      const info = await window.electronAPI.system.getInfo();
      setSystemInfo(info);
      return info;
    } catch (error) {
      setError('Failed to get system info');
      throw error;
    }
  };

  const getAIRecommendation = async (request: AIRecommendationRequest) => {
    try {
      const recommendation = await window.electronAPI.ai.getRecommendation(request);
      setRecommendation(recommendation);
      return recommendation;
    } catch (error) {
      setError('Failed to get AI recommendation');
      throw error;
    }
  };

  const connectToOBS = async (settings: OBSConnectionSettings) => {
    try {
      const result = await window.electronAPI.obs.connect(settings);
      setObsConnected(result.success);
      setObsMessage(result.message);
      if (result.success) {
        const snapshotResult = await window.electronAPI.obs.getSettingsSnapshot();
        if (snapshotResult.success && snapshotResult.snapshot) {
          setObsSettingsSnapshot(snapshotResult.snapshot);
        } else {
          setObsSettingsSnapshot(null);
          setObsMessage(snapshotResult.message);
        }
      }
      return result;
    } catch (error) {
      setObsConnected(false);
      setObsMessage('Failed to connect to OBS');
      throw error;
    }
  };

  const disconnectFromOBS = async () => {
    const result = await window.electronAPI.obs.disconnect();
    setObsConnected(false);
    setObsSettingsSnapshot(null);
    setObsMessage(result.message);
    return result;
  };

  const applyConfig = async (config: OBSConfig) => {
    setIsApplying(true);
    try {
      const result = await window.electronAPI.obs.configure(config);
      return result;
    } finally {
      setIsApplying(false);
    }
  };

  return {
    getSystemInfo,
    getAIRecommendation,
    connectToOBS,
    disconnectFromOBS,
    applyConfig,
  };
}

declare global {
  interface Window {
    electronAPI: {
      obs: {
        connect: (settings: OBSConnectionSettings) => Promise<{ success: boolean; message: string }>;
        disconnect: () => Promise<{ success: boolean; message: string }>;
        getStatus: () => Promise<{ connected: boolean; message: string }>;
        getSettingsSnapshot: () => Promise<{ success: boolean; message: string; snapshot?: OBSSettingsSnapshot }>;
        configure: (config: OBSConfig) => Promise<{ success: boolean; message: string }>;
      };
      system: {
        getInfo: () => Promise<SystemInfo>;
      };
      ai: {
        getRecommendation: (request: AIRecommendationRequest) => Promise<AIRecommendation>;
      };
    };
  }
}
