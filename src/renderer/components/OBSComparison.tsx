import React from 'react';
import { useAppStore } from '../store';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { ConfirmDialog } from './ConfirmDialog';
import { IconActivity, IconCheck, IconRefresh, Section } from './ui';
import type { AIRecommendation, OBSSettingsSnapshot } from '../../shared/types';

export type ComparisonRow = {
  label: string;
  current: string;
  recommended: string;
  type?: 'encoder' | 'recordingQuality';
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeEncoder(value: string): string {
  const normalized = normalize(value).replace(/[_-]/g, ' ');

  if (normalized.includes('apple') || normalized.includes('videotoolbox')) return 'apple_h264';
  if (normalized.includes('nvenc') || normalized.includes('nvidia')) return 'nvenc';
  if (normalized.includes('qsv') || normalized.includes('quick sync') || normalized.includes('intel')) return 'qsv';
  if (normalized.includes('amf') || normalized.includes('amd')) return 'amd';
  if (normalized.includes('x264')) return 'x264';

  return normalized;
}

function normalizeRecordingQuality(value: string): string {
  const normalized = normalize(value).replace(/[_-]/g, ' ');

  if (normalized === 'hq' || normalized === 'high') return 'high';
  if (normalized === 'small' || normalized === 'medium') return 'medium';
  if (normalized === 'stream' || normalized === 'same as stream' || normalized === 'same as stream encoder') return 'stream';
  if (normalized === 'lossless') return 'lossless';

  return normalized;
}

export function isSameValue(row: ComparisonRow): boolean {
  const { current, recommended } = row;
  if (current === '0' || current === 'Desconocido') return false;

  if (row.type === 'encoder') {
    return normalizeEncoder(current) === normalizeEncoder(recommended);
  }

  if (row.type === 'recordingQuality') {
    return normalizeRecordingQuality(current) === normalizeRecordingQuality(recommended);
  }

  return normalize(current) === normalize(recommended);
}

export function buildComparisonRows(
  snapshot: OBSSettingsSnapshot,
  recommendations: AIRecommendation['recommendations'],
): ComparisonRow[] {
  return [
    {
      label: 'Lienzo base',
      current: snapshot.baseResolution,
      recommended: recommendations.resolution,
    },
    {
      label: 'Resolucion de salida',
      current: snapshot.outputResolution,
      recommended: recommendations.resolution,
    },
    {
      label: 'FPS',
      current: String(snapshot.fps),
      recommended: String(recommendations.fps),
    },
    {
      label: 'Encoder',
      current: snapshot.encoder,
      recommended: recommendations.encoder,
      type: 'encoder',
    },
    {
      label: 'Bitrate de video',
      current: String(snapshot.bitrate),
      recommended: String(recommendations.bitrate),
    },
    {
      label: 'Bitrate de audio',
      current: String(snapshot.audioBitrate),
      recommended: String(recommendations.audio_bitrate),
    },
    {
      label: 'Formato de grabacion',
      current: snapshot.recordingFormat,
      recommended: recommendations.recording_format,
    },
    {
      label: 'Calidad de grabacion',
      current: snapshot.recordingQuality,
      recommended: recommendations.recording_quality,
      type: 'recordingQuality',
    },
  ];
}

export function OBSComparison() {
  const { obsSettingsSnapshot, recommendation, obsConnected, setError } = useAppStore();
  const { getLastBackup, restoreLastBackup } = useElectronAPI();
  const [restoreDialogOpen, setRestoreDialogOpen] = React.useState(false);
  const [backupDate, setBackupDate] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!obsConnected) {
      setBackupDate(null);
      return;
    }

    getLastBackup()
      .then((result) => {
        setBackupDate(result.success && result.backup ? result.backup.createdAt : null);
      })
      .catch(() => setBackupDate(null));
  }, [getLastBackup, obsConnected]);

  if (!obsConnected || !obsSettingsSnapshot || !recommendation) return null;

  const { recommendations } = recommendation;
  const rows = buildComparisonRows(obsSettingsSnapshot, recommendations);

  const changeCount = rows.filter((row) => !isSameValue(row)).length;
  const readableBackupDate = backupDate ? new Date(backupDate).toLocaleString() : '';

  const handleRestore = async () => {
    try {
      const result = await restoreLastBackup();
      if (!result.success) {
        setError(result.message);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo restaurar la configuracion anterior');
    } finally {
      setRestoreDialogOpen(false);
    }
  };

  return (
    <Section
      title="obs.diff"
      icon={<IconActivity className="h-4 w-4" />}
      action={
        <>
          {backupDate && (
            <button
              type="button"
              onClick={() => setRestoreDialogOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:border-primary/40 hover:bg-white/[0.04]"
            >
              <IconRefresh className="h-3.5 w-3.5" />
              Restaurar configuracion anterior
            </button>
          )}
          <span
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              changeCount === 0
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-primary/40 bg-primary/10 text-primary'
            }`}
          >
            {changeCount} cambio{changeCount === 1 ? '' : 's'}
          </span>
        </>
      }
    >
      <div className="overflow-hidden rounded-none border border-border">
        <div className="grid grid-cols-[1fr_1fr_1fr_104px] bg-background/80 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
          <span>Ajuste</span>
          <span>OBS actual</span>
          <span>Recomendado</span>
          <span>Estado</span>
        </div>
        {rows.map((row) => {
          const same = isSameValue(row);
          return (
            <div
              key={row.label}
              className="grid grid-cols-[1fr_1fr_1fr_104px] items-center border-t border-border px-4 py-3 text-sm transition-colors hover:bg-primary/[0.04]"
            >
              <span className="font-medium text-text">{row.label}</span>
              <span className="text-text-muted">{row.current || 'Desconocido'}</span>
              <span className="text-text">{row.recommended}</span>
              <span>
                {same ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    <IconCheck className="h-3 w-3" />
                    Mantener
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-black px-2.5 py-0.5 text-xs font-semibold text-amber-200">
                    Cambiar
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <ConfirmDialog
        open={restoreDialogOpen}
        title="Restaurar configuracion anterior"
        confirmLabel="Restaurar"
        onCancel={() => setRestoreDialogOpen(false)}
        onConfirm={handleRestore}
      >
        <p>Restaurar la configuracion guardada el {readableBackupDate}?</p>
        <p>OBSREC volvera a aplicar los valores de video, salida y servidor guardados en el ultimo respaldo.</p>
      </ConfirmDialog>
    </Section>
  );
}
