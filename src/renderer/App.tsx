import React from 'react';
import { useAppStore } from './store';
import { ModeSelector } from './components/ModeSelector';
import { PlatformSelector } from './components/PlatformSelector';
import { AnalyzeButton } from './components/AnalyzeButton';
import { PCAnalysis } from './components/PCAnalysis';
import { Recommendations } from './components/Recommendations';
import { OBSComparison } from './components/OBSComparison';
import { AudioConfiguration } from './components/AudioConfiguration';
import { ImportButton } from './components/ImportButton';
import { StatusBar } from './components/StatusBar';

export default function App() {
  const { error, setError } = useAppStore();

  return (
    <div className="min-h-screen bg-neutral-950 p-8 flex flex-col">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white">OBSREC</h1>
        <p className="text-zinc-400">Auto-configure OBS for optimal streaming & recording</p>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl flex items-center justify-between">
          <span className="text-red-400">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300 text-xl"
          >
            ×
          </button>
        </div>
      )}

      <main className="flex-1">
        <ModeSelector />
        <PlatformSelector />
        <AnalyzeButton />
        <PCAnalysis />
        <Recommendations />
        <OBSComparison />
        <AudioConfiguration />
        <ImportButton />
      </main>

      <StatusBar />
    </div>
  );
}
