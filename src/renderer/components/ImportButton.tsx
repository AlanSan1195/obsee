import React, { useState } from 'react';
import { useAppStore } from '../store';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { createDefaultAudioConfig } from './AudioConfiguration';
import { buildComparisonRows, isSameValue } from './OBSComparison';
import { ConfirmDialog } from './ConfirmDialog';
import { IconUpload, Spinner } from './ui';

export function ImportButton() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const {
    mode,
    platform,
    recommendation,
    obsAudioSnapshot,
    obsSettingsSnapshot,
    obsConnected,
    setObsMessage,
    setError,
    isApplying,
  } = useAppStore();
  const { applyConfig } = useElectronAPI();

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

  // El panel de conexion vive arriba (ConnectPanel). Aqui solo se aplica la
  // configuracion recomendada, y solo tiene sentido con OBS ya conectado.
  if (!obsConnected) {
    return (
      <p className="rounded-none border border-border bg-white/[0.02] px-4 py-3 text-xs text-text-muted">
        Conecta OBS arriba para poder aplicar la configuracion recomendada.
      </p>
    );
  }

  return (
    <div>
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
          <p>No se detectaron diferencias, pero obsee volvera a aplicar la configuracion recomendada.</p>
        )}
        <p>Se guardara un respaldo automatico de tu configuracion actual.</p>
      </ConfirmDialog>
    </div>
  );
}
