import React from 'react';
import { useAppStore } from '../store';
import { useAppAPI } from '../hooks/useAppAPI';
import { extractObsBaseline } from '../../shared/obsUsage';
import { IconSparkles, Spinner } from './ui';

export function AnalyzeButton() {
  const {
    mode,
    platform,
    isAnalyzing,
    setIsAnalyzing,
    setError,
    obsSettingsSnapshot,
    analysisTarget,
    consoleModel,
    peripherals,
    selectedCaptureCard,
    selectedMonitor,
    captureCapabilities,
    isAnalyzingConsole,
  } = useAppStore();
  const { getSystemInfo, getAIRecommendation, profileConsole } = useAppAPI();

  const isConsole = analysisTarget === 'console';
  const busy = isAnalyzing || isAnalyzingConsole;
  const missingBase = !mode || !platform;
  const isDisabled = busy || missingBase || (isConsole && !consoleModel);

  const handleAnalyze = async () => {
    if (isDisabled || !mode || !platform) return;
    setError(null);

    if (isConsole) {
      if (!consoleModel) return;
      try {
        const systemInfo = await getSystemInfo();
        const matchedDisplay = peripherals?.displays.find((display) => display.model === selectedMonitor);
        await profileConsole({
          console: consoleModel,
          captureCard: selectedCaptureCard || captureCapabilities?.deviceName || undefined,
          monitor: selectedMonitor || undefined,
          monitorRefreshRate: matchedDisplay?.refreshRate || undefined,
          captureMaxResolution: captureCapabilities?.maxResolution,
          captureMaxFps: captureCapabilities?.maxFps,
          platform,
          mode,
          systemInfo,
        });
      } catch (error) {
        console.error('Console analysis failed:', error);
      }
      return;
    }

    setIsAnalyzing(true);
    try {
      const systemInfo = await getSystemInfo();
      const currentSettings = obsSettingsSnapshot ? extractObsBaseline(obsSettingsSnapshot) : undefined;
      await getAIRecommendation({ systemInfo, mode, platform, currentSettings });
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const label = busy
    ? (isConsole ? 'analizando consola...' : 'analizando sistema...')
    : missingBase
      ? 'selecciona modo y plataforma'
      : isConsole && !consoleModel
        ? 'selecciona tu consola'
        : isConsole
          ? 'analyze --console'
          : 'analyze --recommend';

  return (
    <button
      type="button"
      onClick={handleAnalyze}
      disabled={isDisabled}
      className={`group flex w-full items-center justify-center gap-3 rounded-none px-6 py-4 text-base font-bold lowercase tracking-terminal transition-all duration-200 ${
        isDisabled
          ? 'cursor-not-allowed border border-border bg-white/[0.03] text-text-muted'
          : 'bg-primary text-background shadow-[0_0_26px_-8px_rgba(58,155,220,0.6)] hover:bg-primary-hover hover:shadow-[0_0_32px_-6px_rgba(58,155,220,0.75)] active:scale-[0.99]'
      }`}
    >
      {busy ? (
        <Spinner className="h-5 w-5 border-background/80 border-t-transparent" />
      ) : (
        <IconSparkles className="h-5 w-5" />
      )}
      <span>
        <span className="opacity-60">{isDisabled ? '$ ' : './'}</span>
        {label}
      </span>
    </button>
  );
}
