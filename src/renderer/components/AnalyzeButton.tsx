import React from 'react';
import { useAppStore } from '../store';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { extractObsBaseline } from '../../shared/obsUsage';
import { IconSparkles, Spinner } from './ui';

export function AnalyzeButton() {
  const { mode, platform, isAnalyzing, setIsAnalyzing, setError, obsSettingsSnapshot } = useAppStore();
  const { getSystemInfo, getAIRecommendation } = useElectronAPI();

  const isDisabled = !mode || !platform || isAnalyzing;

  const handleAnalyze = async () => {
    if (isDisabled || !mode || !platform) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const systemInfo = await getSystemInfo();
      // Incluir la config que OBS ya tiene como base para afinar la recomendacion.
      const currentSettings = obsSettingsSnapshot ? extractObsBaseline(obsSettingsSnapshot) : undefined;
      await getAIRecommendation({ systemInfo, mode, platform, currentSettings });
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleAnalyze}
      disabled={isDisabled}
      className={`group flex w-full items-center justify-center gap-3 rounded-none px-6 py-4 text-base font-bold lowercase tracking-terminal transition-all duration-200 ${
        isDisabled
          ? 'cursor-not-allowed border border-border bg-white/[0.03] text-text-muted'
          : 'bg-primary text-background shadow-[0_0_26px_-8px_rgba(94,255,159,0.6)] hover:bg-primary-hover hover:shadow-[0_0_32px_-6px_rgba(94,255,159,0.75)] active:scale-[0.99]'
      }`}
    >
      {isAnalyzing ? (
        <Spinner className="h-5 w-5 border-background/80 border-t-transparent" />
      ) : (
        <IconSparkles className="h-5 w-5" />
      )}
      <span>
        <span className="opacity-60">{isDisabled ? '$ ' : './'}</span>
        {isAnalyzing
          ? 'analizando sistema...'
          : !mode || !platform
            ? 'selecciona modo y plataforma'
            : 'analyze --recommend'}
      </span>
    </button>
  );
}
