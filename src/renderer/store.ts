import { create } from 'zustand';
import type { AIRecommendation, OBSConnectionSettings, OBSMode, OBSPlatform, OBSSettingsSnapshot, SystemInfo } from '../shared/types';

interface AppState {
  mode: OBSMode | null;
  platform: OBSPlatform | null;
  systemInfo: SystemInfo | null;
  recommendation: AIRecommendation | null;
  isAnalyzing: boolean;
  isApplying: boolean;
  obsConnectionSettings: OBSConnectionSettings;
  obsSettingsSnapshot: OBSSettingsSnapshot | null;
  obsConnected: boolean;
  obsMessage: string;
  error: string | null;

  setMode: (mode: OBSMode) => void;
  setPlatform: (platform: OBSPlatform) => void;
  setSystemInfo: (info: SystemInfo) => void;
  setRecommendation: (rec: AIRecommendation) => void;
  setIsAnalyzing: (value: boolean) => void;
  setIsApplying: (value: boolean) => void;
  setObsConnectionSettings: (settings: Partial<OBSConnectionSettings>) => void;
  setObsSettingsSnapshot: (snapshot: OBSSettingsSnapshot | null) => void;
  setObsConnected: (connected: boolean) => void;
  setObsMessage: (message: string) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  mode: null,
  platform: null,
  systemInfo: null,
  recommendation: null,
  isAnalyzing: false,
  isApplying: false,
  obsConnectionSettings: {
    host: 'localhost',
    port: 4455,
    password: '',
  },
  obsSettingsSnapshot: null,
  obsConnected: false,
  obsMessage: 'Disconnected from OBS',
  error: null,

  setMode: (mode) => set({ mode }),
  setPlatform: (platform) => set({ platform }),
  setSystemInfo: (systemInfo) => set({ systemInfo }),
  setRecommendation: (recommendation) => set({ recommendation }),
  setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
  setIsApplying: (isApplying) => set({ isApplying }),
  setObsConnectionSettings: (settings) => set((state) => ({
    obsConnectionSettings: {
      ...state.obsConnectionSettings,
      ...settings,
    },
  })),
  setObsSettingsSnapshot: (obsSettingsSnapshot) => set({ obsSettingsSnapshot }),
  setObsConnected: (obsConnected) => set({ obsConnected }),
  setObsMessage: (obsMessage) => set({ obsMessage }),
  setError: (error) => set({ error }),
  reset: () => set({
    systemInfo: null,
    recommendation: null,
    obsSettingsSnapshot: null,
    error: null,
  }),
}));
