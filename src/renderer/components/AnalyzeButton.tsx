import React from 'react';
import { useAppStore } from '../store';
import { useElectronAPI } from '../hooks/useElectronAPI';

export function AnalyzeButton() {
  const { mode, platform, setIsAnalyzing, setError } = useAppStore();
  const { getSystemInfo, getAIRecommendation } = useElectronAPI();

  const isDisabled = !mode || !platform;

  const handleAnalyze = async () => {
    if (isDisabled || !mode || !platform) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const systemInfo = await getSystemInfo();
      await getAIRecommendation({ systemInfo, mode, platform });
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <button
      onClick={handleAnalyze}
      disabled={isDisabled}
      className={`
        w-full py-4 px-6 rounded-xl font-semibold text-lg
        transition-all duration-200 flex items-center justify-center gap-3
        ${isDisabled
          ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
          : 'bg-indigo-600 hover:bg-indigo-500 text-white'
        }
      `}
    >
      <span>🔍</span>
      <span>{isDisabled ? 'Select mode and platform first' : 'FIND BEST CONFIGURATION'}</span>
    </button>
  );
}
