import React, { useState } from 'react';
import { useAppStore } from '../store';
import { useAppAPI } from '../hooks/useAppAPI';
import { IconPlug, Section } from './ui';

export function ConnectPanel() {
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const {
    obsConnectionSettings,
    obsConnected,
    setObsConnectionSettings,
    setError,
  } = useAppStore();
  const { connectToOBS } = useAppAPI();

  if (obsConnected) return null;

  const handleConnect = async () => {
    setError(null);
    try {
      const result = await connectToOBS(obsConnectionSettings);
      if (!result.success) {
        setError(result.message);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo conectar con OBS');
    }
  };

  return (
    <Section
      title="obs.conectar"
      accent
      icon={<IconPlug className="h-4 w-4" />}
      subtitle="OBS debe estar abierto en esta misma computadora con el servidor WebSocket activado: Herramientas > Ajustes del servidor WebSocket. Usa Chrome, Edge o Firefox (Safari no puede conectarse a OBS)."
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-muted">
            Password de WebSocket (opcional)
          </span>
          <div className="flex rounded-none border border-border bg-white/[0.03] transition-colors focus-within:border-primary/60">
            <input
              type={showPassword ? 'text' : 'password'}
              value={obsConnectionSettings.password}
              onChange={(event) => setObsConnectionSettings({ password: event.target.value })}
              className="min-w-0 flex-1 rounded-none bg-transparent px-4 py-3 text-sm text-text outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="shrink-0 rounded-none border-l border-border px-4 text-xs font-semibold text-text-muted transition-colors hover:bg-white/[0.02] hover:text-text"
            >
              {showPassword ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          <span className="mt-2 block text-xs text-text-faint">Password opcional. Solo llenalo si OBS tiene autenticacion activada.</span>
        </label>
        <button
          type="button"
          onClick={() => setShowAdvanced((value) => !value)}
          aria-expanded={showAdvanced}
          className="block rounded-none text-xs lowercase tracking-terminal text-text-muted transition-colors hover:text-text"
        >
          <span className="text-primary/70">{showAdvanced ? 'v' : '>'}</span> opciones avanzadas (host / puerto)
        </button>
        {showAdvanced && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Host
              </span>
              <input
                type="text"
                value={obsConnectionSettings.host}
                onChange={(event) => setObsConnectionSettings({ host: event.target.value })}
                spellCheck={false}
                className="w-full rounded-none border border-border bg-white/[0.03] px-4 py-3 text-sm text-text outline-none transition-colors focus:border-primary/60"
              />
              <span className="mt-2 block text-xs text-text-faint">Normalmente localhost si OBS esta en esta misma computadora.</span>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Puerto
              </span>
              <input
                type="number"
                min={1}
                max={65535}
                value={obsConnectionSettings.port}
                onChange={(event) => setObsConnectionSettings({ port: Number(event.target.value) })}
                className="w-full rounded-none border border-border bg-white/[0.03] px-4 py-3 text-sm text-text outline-none transition-colors focus:border-primary/60"
              />
              <span className="mt-2 block text-xs text-text-faint">Normalmente 4455.</span>
            </label>
          </div>
        )}
        <button
          type="button"
          onClick={handleConnect}
          className="flex w-full items-center justify-center gap-2 rounded-none border border-primary/40 bg-primary/[0.06] px-6 py-3.5 text-base font-bold lowercase tracking-terminal text-primary transition-all duration-200 hover:border-primary/70 hover:bg-primary/15 hover:text-glow active:scale-[0.99]"
        >
          <IconPlug className="h-5 w-5" />
          <span><span className="opacity-60">./</span>conectar --obs</span>
        </button>
      </div>
    </Section>
  );
}
