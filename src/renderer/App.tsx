import React, { useEffect } from 'react';
import { useAppStore } from './store';
import { ModeSelector } from './components/ModeSelector';
import { PlatformSelector } from './components/PlatformSelector';
import { AnalyzeButton } from './components/AnalyzeButton';
import { SourceTargetSelector } from './components/SourceTargetSelector';
import { ConsoleSelector } from './components/ConsoleSelector';
import { ConsoleDetection } from './components/ConsoleDetection';
import { ConsoleReport } from './components/ConsoleReport';
import { Recommendations } from './components/Recommendations';
import { OBSComparison } from './components/OBSComparison';
import { AudioConfiguration } from './components/AudioConfiguration';
import { ScenesPanel } from './components/ScenesPanel';
import { ConnectPanel } from './components/ConnectPanel';
import { ImportButton } from './components/ImportButton';
import { StatusBar } from './components/StatusBar';
import { useElectronAPI } from './hooks/useElectronAPI';
import { IconAlert, IconX } from './components/ui';
import packageJson from '../../package.json';

const APP_VERSION = packageJson.version;

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

function StatusRow({ label, value, accent, title }: { label: string; value: React.ReactNode; accent?: boolean; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-text-faint lowercase">{label}</span>
      <span
        className={`min-w-0 truncate text-right ${accent ? 'text-primary' : 'text-text'}`}
        title={title}
      >
        {value}
      </span>
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
    analysisTarget,
    setObsAudioSnapshot,
    setObsConnected,
    setObsMessage,
    setObsSettingsSnapshot,
  } = useAppStore();
  const { disconnectFromOBS } = useElectronAPI();

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
          <h1 className="flex items-center font-display text-6xl font-black leading-none tracking-[0.02em] text-text sm:text-7xl">
            <span className="text-primary text-glow">obs</span>ee
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="ml-2 h-[0.72em] w-[0.72em] text-primary"
              style={{ filter: 'drop-shadow(0 0 8px rgba(94, 255, 159, 0.7))' }}
            >
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M5 6a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1l0 -12" />
              <path d="M8 10v-2h2m6 6v2h-2m-4 0h-2v-2m8 -4v-2h-2" />
              <path d="M3 10h2" />
              <path d="M3 14h2" />
              <path d="M10 3v2" />
              <path d="M14 3v2" />
              <path d="M21 10h-2" />
              <path d="M21 14h-2" />
              <path d="M14 21v-2" />
              <path d="M10 21v-2" />
            </svg>
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-text-muted">Analiza tu equipo, detecta tu harware y obten la mejor configuracion para un stream o directo  de calidad{' '}
            <span className="text-text">antes</span> de aplicarlo.
          </p>
        </div>

        {/* identity / status card */}
        <aside className="terminal-panel self-start p-4 text-xs">
          <div className="mb-3 flex items-center justify-between border-b border-border pb-2 text-[0.7rem] lowercase tracking-terminal text-text-faint">
            <span>~/status</span>
            {obsConnected ? (
              <button
                type="button"
                onClick={() => void disconnectFromOBS()}
                className="text-text-muted transition-colors hover:text-red-300"
                title="Desconectar de OBS"
              >
                desconectar ✕
              </button>
            ) : (
              <span className="text-text-muted">○ idle</span>
            )}
          </div>
          <StatusRow
            label="status"
            value={obsConnected ? 'connected' : 'disconnected'}
            accent={obsConnected}
          />
          <StatusRow label="mode" value={mode ? modeLabels[mode] : 'unset'} />
          <StatusRow label="platform" value={platform ?? 'unset'} />
          <div className="my-2 border-t border-border/60" />
          {systemInfo ? (
            <>
              <StatusRow label="cpu" value={`${systemInfo.cpu.cores}c · ${systemInfo.cpu.model}`} title={systemInfo.cpu.model} />
              <StatusRow label="gpu" value={systemInfo.gpu.model} title={systemInfo.gpu.model} />
              <StatusRow label="ram" value={`${systemInfo.ram.total}gb`} />
              <StatusRow label="os" value={`${systemInfo.os.distro} ${systemInfo.os.release}`} title={`${systemInfo.os.distro} ${systemInfo.os.release}`} />
              <StatusRow
                label="nvenc"
                value={systemInfo.gpu.hasNvenc ? 'yes' : 'no (software)'}
                accent={systemInfo.gpu.hasNvenc}
              />
            </>
          ) : (
            <div className="py-1.5 text-text-faint">hardware: corre <span className="text-text-muted">analyze</span> para detectarlo</div>
          )}
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
        {!obsConnected && (
          <>
            <div className="flex items-center gap-3 text-xs lowercase tracking-terminal text-text-faint">
              <span>conexion</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <ConnectPanel />
          </>
        )}

        <div className="flex items-center gap-3 pt-2 text-xs lowercase tracking-terminal text-text-faint">
          <span>setup</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <SourceTargetSelector />
        {analysisTarget === 'console' && (
          <>
            <ConsoleSelector />
            <ConsoleDetection />
          </>
        )}
        <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
          <ModeSelector />
          <PlatformSelector />
        </div>
        <AnalyzeButton />

        <div className="flex items-center gap-3 pt-2 text-xs lowercase tracking-terminal text-text-faint">
          <span>recomendacion</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <ConsoleReport />
        <Recommendations />
        <OBSComparison />

        <div className="flex items-center gap-3 pt-2 text-xs lowercase tracking-terminal text-text-faint">
          <span>escenas</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <ScenesPanel />

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
