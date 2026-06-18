import React, { useEffect } from 'react';
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
import { IconAlert, IconX } from './components/ui';

const APP_VERSION = '1.0.1';

const modeLabels: Record<string, string> = {
  stream_record: 'stream + rec',
  stream_only: 'stream',
  record_only: 'rec',
};

function MetaItem({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-text-faint">{label}</span>
      <span className={accent ? 'text-primary' : 'text-text'}>{value}</span>
    </span>
  );
}

function StatusRow({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-text-faint lowercase">{label}</span>
      <span className={`text-right ${accent ? 'text-primary' : 'text-text'}`}>{value}</span>
    </div>
  );
}

export default function App() {
  const {
    error,
    setError,
    mode,
    platform,
    systemInfo,
    obsConnected,
    setObsAudioSnapshot,
    setObsConnected,
    setObsMessage,
    setObsSettingsSnapshot,
  } = useAppStore();

  useEffect(() => {
    if (!window.electronAPI) return undefined;

    return window.electronAPI.obs.onConnectionChanged((status) => {
      setObsConnected(status.connected);
      setObsMessage(status.message);

      if (!status.connected) {
        setObsSettingsSnapshot(null);
        setObsAudioSnapshot(null);
      }
    });
  }, [setObsAudioSnapshot, setObsConnected, setObsMessage, setObsSettingsSnapshot]);

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-7 font-mono lg:px-8">
      <div className="app-backdrop" aria-hidden="true">
        <span className="app-scanbeam" />
      </div>

      {/* top meta strip */}
      <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-border pb-3 text-[0.7rem] lowercase tracking-terminal">
        <span className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 ${obsConnected ? 'animate-pulse-dot bg-primary text-glow' : 'bg-text-faint'}`}
          />
          <span className={obsConnected ? 'text-primary' : 'text-text-muted'}>
            {obsConnected ? 'online' : 'offline'}
          </span>
        </span>
        <MetaItem label="obs" value={obsConnected ? 'linked' : 'no-conn'} accent={obsConnected} />
        <MetaItem label="mode" value={mode ? modeLabels[mode] : '—'} />
        <MetaItem label="target" value={platform ?? '—'} />
        <MetaItem label="os" value={systemInfo ? systemInfo.os.distro.toLowerCase() : '—'} />
        <span className="ml-auto text-text-faint">v{APP_VERSION}</span>
      </div>

      {/* hero */}
      <header className="mb-8 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col justify-center">
          <h1 className="font-display text-6xl font-black leading-none tracking-tight text-text sm:text-7xl">OBS
            <span className="text-primary text-glow">REC</span>
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-text-muted">Analiza tu equipo, detecta tu harware y obten la mejor configuracion para un stream o directo  de calidad{' '}
            <span className="text-text">antes</span> de aplicarlo.
          </p>
        </div>

        {/* identity / status card */}
        <aside className="terminal-panel self-start p-4 text-xs">
          <div className="mb-3 flex items-center justify-between border-b border-border pb-2 text-[0.7rem] lowercase tracking-terminal text-text-faint">
            <span>~/status</span>
            <span className={obsConnected ? 'text-primary' : 'text-text-muted'}>
              {obsConnected ? '● live' : '○ idle'}
            </span>
          </div>
          <StatusRow
            label="status"
            value={obsConnected ? 'connected' : 'disconnected'}
            accent={obsConnected}
          />
          <StatusRow label="mode" value={mode ? modeLabels[mode] : 'unset'} />
          <StatusRow label="platform" value={platform ?? 'unset'} />
          <div className="my-2 border-t border-border/60" />
          <StatusRow label="cpu" value={systemInfo ? `${systemInfo.cpu.cores} cores` : '—'} />
          <StatusRow label="ram" value={systemInfo ? `${systemInfo.ram.total}gb` : '—'} />
          <StatusRow
            label="nvenc"
            value={systemInfo ? (systemInfo.gpu.hasNvenc ? 'yes' : 'no') : '—'}
            accent={Boolean(systemInfo?.gpu.hasNvenc)}
          />
        </aside>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-6 flex items-center justify-between gap-4 border border-red-500/40 bg-black p-4"
        >
          <div className="flex items-center gap-3">
            <IconAlert className="h-5 w-5 shrink-0 text-red-400" />
            <span className="text-sm text-red-300">
              <span className="text-red-500/70">err: </span>
              {error}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Cerrar mensaje de error"
            className="p-1.5 text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
      )}

      <main className="flex-1 space-y-5">
        <div className="flex items-center gap-3 text-xs lowercase tracking-terminal text-text-faint">
          <span> setup</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
          <ModeSelector />
          <PlatformSelector />
        </div>
        <AnalyzeButton />

        <div className="flex items-center gap-3 pt-2 text-xs lowercase tracking-terminal text-text-faint">
          <span>diagnostico</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <PCAnalysis />
        <Recommendations />
        <OBSComparison />

        <div className="flex items-center gap-3 pt-2 text-xs lowercase tracking-terminal text-text-faint">
          <span>apply</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <AudioConfiguration />
        <ImportButton />
      </main>

      <StatusBar />
    </div>
  );
}
