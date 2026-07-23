import { create } from 'zustand';
import type { AIRecommendation, CaptureCapabilities, ConsoleModel, ConsoleProfileResponse, MicProfileResponse, OBSAudioSettingsSnapshot, OBSConnectionSettings, OBSMode, OBSPlatform, OBSSettingsSnapshot, PeripheralsSnapshot, ResolvedSourceKind, Scene, SceneItemSummary, SystemInfo } from '../shared/types';

export type AnalysisTarget = 'pc' | 'console';

interface AppState {
  mode: OBSMode | null;
  platform: OBSPlatform | null;
  systemInfo: SystemInfo | null;
  recommendation: AIRecommendation | null;
  isAnalyzing: boolean;
  isApplying: boolean;
  obsConnectionSettings: OBSConnectionSettings;
  obsSettingsSnapshot: OBSSettingsSnapshot | null;
  obsAudioSnapshot: OBSAudioSettingsSnapshot | null;
  obsConnected: boolean;
  obsMessage: string;
  error: string | null;
  scenes: Scene[];
  currentSceneName: string | null;
  selectedSceneName: string | null;
  sceneSources: SceneItemSummary[];
  availableSourceKinds: ResolvedSourceKind[] | null;
  micProfile: MicProfileResponse | null;
  isProfilingMic: boolean;
  analysisTarget: AnalysisTarget;
  consoleModel: ConsoleModel | null;
  peripherals: PeripheralsSnapshot | null;
  selectedCaptureCard: string;
  selectedMonitor: string;
  captureCapabilities: CaptureCapabilities | null;
  consoleProfile: ConsoleProfileResponse | null;
  isAnalyzingConsole: boolean;

  setMode: (mode: OBSMode) => void;
  setPlatform: (platform: OBSPlatform) => void;
  setSystemInfo: (info: SystemInfo) => void;
  setRecommendation: (rec: AIRecommendation | null) => void;
  setIsAnalyzing: (value: boolean) => void;
  setIsApplying: (value: boolean) => void;
  setObsConnectionSettings: (settings: Partial<OBSConnectionSettings>) => void;
  setObsSettingsSnapshot: (snapshot: OBSSettingsSnapshot | null) => void;
  setObsAudioSnapshot: (snapshot: OBSAudioSettingsSnapshot | null) => void;
  setObsConnected: (connected: boolean) => void;
  setObsMessage: (message: string) => void;
  setError: (error: string | null) => void;
  setScenes: (scenes: Scene[]) => void;
  setCurrentSceneName: (name: string | null) => void;
  setSelectedSceneName: (name: string | null) => void;
  setSceneSources: (sources: SceneItemSummary[]) => void;
  setAvailableSourceKinds: (kinds: ResolvedSourceKind[] | null) => void;
  setMicProfile: (profile: MicProfileResponse | null) => void;
  setIsProfilingMic: (value: boolean) => void;
  setAnalysisTarget: (target: AnalysisTarget) => void;
  setConsoleModel: (model: ConsoleModel | null) => void;
  setPeripherals: (peripherals: PeripheralsSnapshot | null) => void;
  setSelectedCaptureCard: (value: string) => void;
  setSelectedMonitor: (value: string) => void;
  setCaptureCapabilities: (caps: CaptureCapabilities | null) => void;
  setConsoleProfile: (profile: ConsoleProfileResponse | null) => void;
  setIsAnalyzingConsole: (value: boolean) => void;
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
  obsAudioSnapshot: null,
  obsConnected: false,
  obsMessage: 'Desconectado de OBS',
  error: null,
  scenes: [],
  currentSceneName: null,
  selectedSceneName: null,
  sceneSources: [],
  availableSourceKinds: null,
  micProfile: null,
  isProfilingMic: false,
  analysisTarget: 'pc',
  consoleModel: null,
  peripherals: null,
  selectedCaptureCard: '',
  selectedMonitor: '',
  captureCapabilities: null,
  consoleProfile: null,
  isAnalyzingConsole: false,

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
  setObsAudioSnapshot: (obsAudioSnapshot) => set({ obsAudioSnapshot }),
  setObsConnected: (obsConnected) => set({ obsConnected }),
  setObsMessage: (obsMessage) => set({ obsMessage }),
  setError: (error) => set({ error }),
  setScenes: (scenes) => set({ scenes }),
  setCurrentSceneName: (currentSceneName) => set({ currentSceneName }),
  setSelectedSceneName: (selectedSceneName) => set({ selectedSceneName }),
  setSceneSources: (sceneSources) => set({ sceneSources }),
  setAvailableSourceKinds: (availableSourceKinds) => set({ availableSourceKinds }),
  setMicProfile: (micProfile) => set({ micProfile }),
  setIsProfilingMic: (isProfilingMic) => set({ isProfilingMic }),
  setAnalysisTarget: (analysisTarget) => set({ analysisTarget }),
  setConsoleModel: (consoleModel) => set({ consoleModel }),
  setPeripherals: (peripherals) => set({ peripherals }),
  setSelectedCaptureCard: (selectedCaptureCard) => set({ selectedCaptureCard }),
  setSelectedMonitor: (selectedMonitor) => set({ selectedMonitor }),
  setCaptureCapabilities: (captureCapabilities) => set({ captureCapabilities }),
  setConsoleProfile: (consoleProfile) => set({ consoleProfile }),
  setIsAnalyzingConsole: (isAnalyzingConsole) => set({ isAnalyzingConsole }),
  reset: () => set({
    mode: null,
    platform: null,
    systemInfo: null,
    recommendation: null,
    obsSettingsSnapshot: null,
    obsAudioSnapshot: null,
    error: null,
    scenes: [],
    currentSceneName: null,
    selectedSceneName: null,
    sceneSources: [],
    availableSourceKinds: null,
    micProfile: null,
    isProfilingMic: false,
    analysisTarget: 'pc',
    consoleProfile: null,
    isAnalyzingConsole: false,
    peripherals: null,
    selectedCaptureCard: '',
    selectedMonitor: '',
    captureCapabilities: null,
  }),
}));
