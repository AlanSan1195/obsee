import React, { useEffect, useState } from 'react';
import { useAppStore } from './store';
import { ModeSelector } from './components/ModeSelector';
import { PlatformSelector } from './components/PlatformSelector';
import { AnalyzeButton } from './components/AnalyzeButton';
import { SourceTargetSelector } from './components/SourceTargetSelector';
import { ConsoleSelector } from './components/ConsoleSelector';
import { ConsoleDetection } from './components/ConsoleDetection';
import { ConsoleReport } from './components/ConsoleReport';
import { HardwareForm } from './components/HardwareForm';
import { Recommendations } from './components/Recommendations';
import { OBSComparison } from './components/OBSComparison';
import { AudioConfiguration } from './components/AudioConfiguration';
import { ScenesPanel } from './components/ScenesPanel';
import { ConnectPanel } from './components/ConnectPanel';
import { ImportButton } from './components/ImportButton';
import { StatusBar } from './components/StatusBar';
import { appAPI } from './lib/app-api';
import { IconAlert, IconX } from './components/ui';
import packageJson from '../../package.json';

const APP_VERSION = packageJson.version;

type TabIndex = 0 | 1 | 2 | 3;

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

export default function App() {
  const [activeTab, setActiveTab] = useState<TabIndex>(0);

  const {
    error,
    setError,
    mode,
    platform,
    systemInfo,
    obsConnected,
    analysisTarget,
    recommendation,
    reset,
    setObsAudioSnapshot,
    setObsConnected,
    setObsMessage,
    setObsSettingsSnapshot,
  } = useAppStore();

  useEffect(() => {
    return appAPI.obs.onConnectionChanged((status) => {
      setObsConnected(status.connected);
      setObsMessage(status.message);

      if (!status.connected) {
        setObsSettingsSnapshot(null);
        setObsAudioSnapshot(null);
      } else if (activeTab === 0) {
        setActiveTab(1);
      }
    });
  }, [setObsAudioSnapshot, setObsConnected, setObsMessage, setObsSettingsSnapshot, activeTab]);

  useEffect(() => {
    if (recommendation && activeTab === 1) {
      setActiveTab(2);
    }
  }, [recommendation, activeTab]);

  const tabs = [
    { label: 'conectar', blocked: false, completed: obsConnected },
    { label: 'setup', blocked: !obsConnected, completed: obsConnected && !!recommendation },
    { label: 'deteccion', blocked: !obsConnected, completed: false },
    { label: 'escenas', blocked: !obsConnected, completed: false },
  ] as const;

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-7 font-mono lg:px-8">
      <div className="app-backdrop" aria-hidden="true" />

      {/* top meta strip */}
      <header className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-3 text-[0.7rem] lowercase tracking-terminal">
        <span className="font-display text-sm font-black tracking-[0.06em] text-text">
          <span className="text-primary text-glow">obs</span>ee
        </span>
        <span
          className={`flex items-center gap-1.5 border px-2 py-0.5 ${
            obsConnected ? 'border-primary/40 text-primary' : 'border-border text-text-muted'
          }`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${obsConnected ? 'animate-pulse-dot bg-primary' : 'bg-text-faint'}`}
          />
          {obsConnected ? 'online' : 'offline'}
        </span>
        <span className="hidden h-3 w-px bg-border sm:block" />
        <MetaItem label="mode" value={mode ? modeLabels[mode] : '—'} />
        <MetaItem label="target" value={platform ?? '—'} />
        <MetaItem label="os" value={systemInfo ? systemInfo.os.distro.toLowerCase() : '—'} />
        <span className="ml-auto text-text-faint">v{APP_VERSION}</span>
      </header>

      {/* stepper */}
      <nav className="mb-8 flex items-center gap-2 sm:gap-3" aria-label="progreso">
        {tabs.map((tab, idx) => {
          const isActive = activeTab === idx;
          const num = String(idx + 1).padStart(2, '0');
          return (
            <React.Fragment key={idx}>
              {idx > 0 && (
                <span
                  className={`h-px flex-1 transition-colors ${activeTab >= idx ? 'bg-primary/40' : 'bg-border'}`}
                  aria-hidden="true"
                />
              )}
              <button
                onClick={() => !tab.blocked && setActiveTab(idx as TabIndex)}
                disabled={tab.blocked}
                aria-current={isActive ? 'step' : undefined}
                className={`group flex items-center gap-2 px-1 text-xs lowercase tracking-terminal transition-colors disabled:cursor-not-allowed ${
                  isActive ? 'text-primary' : tab.blocked ? 'text-text-faint/50' : 'text-text-muted hover:text-text'
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center border text-[0.7rem] font-bold transition-all ${
                    isActive
                      ? 'border-primary bg-primary text-background glow-primary'
                      : tab.completed
                        ? 'border-primary/50 text-primary'
                        : tab.blocked
                          ? 'border-text-faint/30'
                          : 'border-text-muted/40 group-hover:border-text-muted'
                  }`}
                >
                  {tab.completed && !isActive ? '✓' : num}
                </span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </nav>

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

      <main className="flex-1">
        {activeTab === 0 && (
          <div className="flex flex-col items-center justify-center gap-6 py-12">
            <span className="text-[0.7rem] lowercase tracking-terminal text-text-faint">
              <span className="text-primary">$</span> obsee --init<span className="blink-cursor ml-1" />
            </span>
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
                style={{ filter: 'drop-shadow(0 0 8px rgba(59, 111, 224, 0.7))' }}
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
            <p className="max-w-md text-center text-sm leading-relaxed text-text-muted">
              Analiza tu equipo, detecta tu hardware y obtén la mejor configuración para un stream o directo de calidad <span className="text-text">antes</span> de aplicarlo.
            </p>

            {/* aviso beta, sin ensuciar el hero */}
            <div className="flex w-full max-w-md items-center gap-2 border border-border bg-primary/[0.03] px-4 py-3 text-left text-xs leading-relaxed text-text-muted">
              <span className="border border-primary/40 px-1.5 py-px text-[0.6rem] font-bold uppercase tracking-terminal text-primary">
                beta
              </span>
              <span>version en prueba: revisa en OBS los ajustes aplicados antes de un directo importante.</span>
            </div>

            <ConnectPanel />
          </div>
        )}

        {activeTab === 1 && (
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <ModeSelector />
              <PlatformSelector />
            </div>
            <HardwareForm />
            <SourceTargetSelector />
            {analysisTarget === 'console' && (
              <>
                <ConsoleSelector />
                <ConsoleDetection />
              </>
            )}
            <AnalyzeButton />
          </div>
        )}

        {activeTab === 2 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-xs lowercase tracking-terminal text-text-faint">
                <span>deteccion</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            </div>
            <ConsoleReport />
            <Recommendations />
            <OBSComparison />
            <AudioConfiguration onApplySuccess={() => setActiveTab(3)} />
          </div>
        )}

        {activeTab === 3 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-xs lowercase tracking-terminal text-text-faint">
                <span>escenas y fuentes</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            </div>
            <ScenesPanel />
            <ImportButton />
            <div className="pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => {
                  reset();
                  setActiveTab(0);
                }}
                className="w-full rounded-none border border-text-muted/30 px-6 py-3 text-sm lowercase tracking-terminal text-text-muted transition-colors hover:border-text-muted hover:text-text"
              >
                <span className="opacity-60">./</span>nueva configuracion
              </button>
            </div>
          </div>
        )}
      </main>

      <StatusBar />
    </div>
  );
}
