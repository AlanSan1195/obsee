import React, { useState } from 'react';
import { useAppStore } from '../store';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { createDefaultAudioConfig } from './AudioConfiguration';
import { buildComparisonRows, isSameValue } from './OBSComparison';
import { ConfirmDialog } from './ConfirmDialog';
import { IconPlug, IconUpload, Section, Spinner } from './ui';

export function ImportButton() {
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const {
    mode,
    platform,
    recommendation,
    obsConnectionSettings,
    obsAudioSnapshot,
    obsSettingsSnapshot,
    obsConnected,
    setObsConnectionSettings,
    setObsMessage,
    setError,
    isApplying,
  } = useAppStore();
  const { connectToOBS, applyConfig } = useElectronAPI();

  const canImport = mode && platform && recommendation && obsConnected;
  const changedRows = recommendation && obsSettingsSnapshot
    ? buildComparisonRows(obsSettingsSnapshot, recommendation.recommendations).filter((row) => !isSameValue(row))
    : [];

  const handleImport = async () => {
    if (!canImport || !recommendation) return;

    try {
      const result = await applyConfig({
        mode,
        platform,
        resolution: recommendation.recommendations.resolution,
        fps: recommendation.recommendations.fps,
        encoder: recommendation.recommendations.encoder,
        bitrate: recommendation.recommendations.bitrate,
        audioBitrate: recommendation.recommendations.audio_bitrate,
        recordingFormat: recommendation.recommendations.recording_format,
        recordingQuality: recommendation.recommendations.recording_quality,
        audio: obsAudioSnapshot
          ? createDefaultAudioConfig(
            obsAudioSnapshot.inputName,
            obsAudioSnapshot.recommendedDevice ?? obsAudioSnapshot.devices.find((device) => device.id === obsAudioSnapshot.selectedDeviceId),
          )
          : undefined,
      });

      if (result.success) {
        setObsMessage('Configuracion aplicada correctamente');
      } else {
        setError(result.message);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo aplicar la configuracion');
    }
  };

  const handleImportClick = () => {
    if (!canImport || !recommendation) return;
    setConfirmOpen(true);
  };

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
    <div>
      {!obsConnected ? (
        <Section
          title="obs.connect"
          icon={<IconPlug className="h-4 w-4" />}
          subtitle="Activa el servidor WebSocket en OBS: Herramientas > Ajustes del servidor WebSocket."
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
              <span><span className="opacity-60">./</span>connect --obs</span>
            </button>
          </div>
        </Section>
      ) : (
        <button
          type="button"
          onClick={handleImportClick}
          disabled={!canImport || isApplying}
          className={`group flex w-full items-center justify-center gap-3 rounded-none px-6 py-4 text-base font-bold lowercase tracking-terminal transition-all duration-200 ${
            canImport && !isApplying
              ? 'bg-primary text-background shadow-[0_0_26px_-8px_rgba(94,255,159,0.6)] hover:bg-primary-hover hover:shadow-[0_0_32px_-6px_rgba(94,255,159,0.75)] active:scale-[0.99]'
              : 'cursor-not-allowed border border-border bg-white/[0.03] text-text-muted'
          }`}
        >
          {isApplying ? (
            <>
              <Spinner className="h-5 w-5 border-background/80 border-t-transparent" />
              <span>aplicando...</span>
            </>
          ) : (
            <>
              <IconUpload className="h-5 w-5" />
              <span><span className="opacity-60">./</span>import --to obs</span>
            </>
          )}
        </button>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title="Confirmar cambios en OBS"
        confirmLabel="Aplicar cambios"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void handleImport();
        }}
      >
        {changedRows.length > 0 ? (
          <div className="space-y-2">
            {changedRows.map((row) => (
              <div key={row.label} className="rounded-none border border-border bg-white/[0.02] p-3">
                <span className="block text-xs font-semibold uppercase tracking-wider text-text-muted">{row.label}</span>
                <span className="mt-1 block text-text">
                  {row.current || 'Desconocido'} → <span className="font-medium text-primary">{row.recommended}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p>No se detectaron diferencias, pero OBSREC volvera a aplicar la configuracion recomendada.</p>
        )}
        <p>Se guardara un respaldo automatico de tu configuracion actual.</p>
      </ConfirmDialog>
    </div>
  );
}
