import React, { useEffect, useMemo, useState } from 'react';
import type { ParsedGoal } from '../../shared/goalParser';
import type { AIRecommendationSettings, OBSMode } from '../../shared/types';
import { useAppStore } from '../store';
import { useAppAPI } from '../hooks/useAppAPI';
import { appAPI } from '../lib/app-api';
import {
  buildComparisonRows,
  formatEncoderName,
  isSameValue,
  type ComparisonRow,
} from './OBSComparison';
import { ConfirmDialog } from './ConfirmDialog';
import { ConnectionDock } from './ConnectionDock';
import { InlineEmphasis } from './InlineEmphasis';
import { createDefaultAudioConfig } from './AudioConfiguration';
import { IconActivity, IconCheck, IconRefresh, IconUpload, Spinner } from './ui';

interface RecommendationReviewProps {
  goal: ParsedGoal;
  onNewGoal: () => void;
}

interface ReviewRow extends ComparisonRow {
  reason: string;
}

const modeLabels: Record<OBSMode, string> = {
  stream_record: 'transmitir y grabar',
  stream_only: 'transmitir',
  record_only: 'grabar',
};

function recommendationReasons(settings: AIRecommendationSettings): Record<string, string> {
  return {
    'Lienzo base': 'Es el área de trabajo. Conserva el detalle de la fuente antes de crear cada salida.',
    'Salida maestra / grabacion': 'Define el archivo local y puede mantener más calidad que la transmisión.',
    'Salida del stream': 'Es lo que recibe la audiencia; equilibra nitidez con estabilidad de red.',
    FPS: `${settings.fps} FPS mantienen el movimiento fluido sin pedir cuadros que el perfil no necesita.`,
    'Encoder del stream': 'Comprime la emisión con el motor más adecuado para el hardware detectado.',
    'Bitrate del stream': 'Controla detalle y consumo de subida; está ajustado al destino y resolución.',
    'Encoder de grabacion': 'Separa el trabajo del archivo local para conservar calidad sin atarlo al stream.',
    'Bitrate de grabacion': 'Da margen adicional a escenas con movimiento y reduce artefactos en el archivo.',
    'Bitrate de audio': 'Conserva voz, música y juego con suficiente definición sin desperdiciar ancho de banda.',
    'Formato de grabacion': settings.recording_format === 'mkv'
      ? 'MKV protege la grabación si OBS o el equipo se cierran inesperadamente.'
      : 'Define cómo se guarda el archivo y su compatibilidad con editores y plataformas.',
    'Calidad de grabacion': 'Mantiene una copia de alta calidad lista para edición o publicación posterior.',
  };
}

function visibleForMode(label: string, mode: OBSMode): boolean {
  if (mode === 'stream_only') {
    return !/grabacion|grabación/i.test(label);
  }
  if (mode === 'record_only') {
    return !/stream/i.test(label);
  }
  return true;
}

function makeReviewRows(
  mode: OBSMode,
  settings: AIRecommendationSettings,
  currentRows: ComparisonRow[] | null,
): ReviewRow[] {
  const fallbackRows: ComparisonRow[] = [
    { label: 'Lienzo base', current: 'Sin comparar', recommended: settings.canvas_resolution },
    { label: 'Salida maestra / grabacion', current: 'Sin comparar', recommended: settings.recording_resolution },
    { label: 'Salida del stream', current: 'Sin comparar', recommended: settings.resolution },
    { label: 'FPS', current: 'Sin comparar', recommended: String(settings.fps) },
    { label: 'Encoder del stream', current: 'Sin comparar', recommended: settings.encoder, type: 'encoder' },
    { label: 'Bitrate del stream', current: 'Sin comparar', recommended: String(settings.bitrate) },
    { label: 'Encoder de grabacion', current: 'Sin comparar', recommended: settings.recording_encoder, type: 'encoder' },
    { label: 'Bitrate de grabacion', current: 'Sin comparar', recommended: String(settings.recording_bitrate) },
    { label: 'Bitrate de audio', current: 'Sin comparar', recommended: String(settings.audio_bitrate) },
    { label: 'Formato de grabacion', current: 'Sin comparar', recommended: settings.recording_format },
    { label: 'Calidad de grabacion', current: 'Sin comparar', recommended: settings.recording_quality, type: 'recordingQuality' },
  ];
  const reasons = recommendationReasons(settings);

  return (currentRows ?? fallbackRows)
    .filter((row) => visibleForMode(row.label, mode))
    .map((row) => {
      const applyMethod = row.label === 'Bitrate de grabacion'
        ? 'manual'
        : row.label === 'Bitrate del stream'
          ? mode === 'stream_only' ? 'automatic' : 'manual'
          : row.label === 'Calidad de grabacion'
            ? mode === 'stream_only' ? 'automatic' : 'manual'
          : row.applyMethod;

      return {
        ...row,
        applyMethod,
        reason: applyMethod === 'manual'
          ? 'OBS WebSocket no expone ni permite cambiar este valor en modo avanzado. Obsee muestra el objetivo, pero debes confirmarlo en Ajustes > Salida.'
          : reasons[row.label] ?? 'Ajuste calculado para el objetivo y hardware detectados.',
      };
    });
}

function formatValue(row: ReviewRow, value: string): string {
  if (row.type === 'encoder') return formatEncoderName(value);
  if (value === 'No disponible por WebSocket' || value === 'No independiente') return value;
  if (/bitrate/i.test(row.label) && /^\d+$/.test(value)) return `${Number(value).toLocaleString('es-MX')} kbps`;
  if (row.label === 'FPS' && /^\d+$/.test(value)) return `${value} FPS`;
  return value.toUpperCase();
}

export function RecommendationReview({ goal, onNewGoal }: RecommendationReviewProps) {
  const {
    mode,
    platform,
    recommendation,
    systemInfo,
    obsConnected,
    obsSettingsSnapshot,
    obsAudioSnapshot,
    consoleProfile,
    isApplying,
    setError,
    setObsMessage,
  } = useAppStore();
  const { applyConfig, restoreLastBackup } = useAppAPI();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [backupDate, setBackupDate] = useState<string | null>(null);
  const [applyStatus, setApplyStatus] = useState<'idle' | 'complete' | 'partial'>('idle');

  useEffect(() => {
    if (!obsConnected) return;
    appAPI.obs.getLastBackup()
      .then((result) => setBackupDate(result.success && result.backup ? result.backup.createdAt : null))
      .catch(() => setBackupDate(null));
  }, [obsConnected]);

  const rows = useMemo(() => {
    if (!recommendation || !mode) return [];
    const currentRows = obsSettingsSnapshot
      ? buildComparisonRows(obsSettingsSnapshot, recommendation.recommendations)
      : null;
    return makeReviewRows(mode, recommendation.recommendations, currentRows);
  }, [mode, obsSettingsSnapshot, recommendation]);

  if (!mode || !platform || !recommendation || !systemInfo) return null;

  const changedRows = obsSettingsSnapshot
    ? rows.filter((row) => !isSameValue(row))
    : rows;
  const manualRows = changedRows.filter((row) => row.applyMethod === 'manual');
  const automaticRows = changedRows.filter((row) => row.applyMethod !== 'manual');
  const settings = recommendation.recommendations;
  const resultTitle = mode === 'stream_record'
    ? `Stream ${settings.resolution} + grabación ${settings.recording_resolution}`
    : mode === 'stream_only'
      ? `Stream ${settings.resolution} a ${settings.fps} FPS`
      : `Grabación ${settings.recording_resolution} a ${settings.fps} FPS`;

  const handleApply = async () => {
    try {
      const result = await applyConfig({
        mode,
        platform,
        resolution: settings.resolution,
        canvasResolution: settings.canvas_resolution,
        streamResolution: settings.resolution,
        recordingResolution: settings.recording_resolution,
        fps: settings.fps,
        encoder: settings.encoder,
        bitrate: settings.bitrate,
        recordingEncoder: settings.recording_encoder,
        recordingBitrate: settings.recording_bitrate,
        audioBitrate: settings.audio_bitrate,
        recordingFormat: settings.recording_format,
        recordingQuality: settings.recording_quality,
        audio: obsAudioSnapshot
          ? createDefaultAudioConfig(
            obsAudioSnapshot.inputName,
            obsAudioSnapshot.recommendedDevice
              ?? obsAudioSnapshot.devices.find((device) => device.id === obsAudioSnapshot.selectedDeviceId),
          )
          : undefined,
      });
      if (result.success) {
        setApplyStatus(result.requiresManualConfirmation ? 'partial' : 'complete');
        setObsMessage(result.message);
        const backup = await appAPI.obs.getLastBackup();
        setBackupDate(backup.success && backup.backup ? backup.backup.createdAt : null);
      } else {
        setError(result.message);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo aplicar la configuración');
    }
  };

  return (
    <main className="review-shell">
      <section className="review-hero">
        <div className="review-hero__status">
          <span className="signal-dot" aria-hidden="true" />
          Plan preparado
        </div>
        <p className="review-hero__kicker">Tu configuración ideal para {modeLabels[mode]}</p>
        <h1>{resultTitle}</h1>
        <p className="review-hero__goal">“{goal.preferences.description}”</p>
        <div className="review-hero__facts">
          <span>{systemInfo.cpu.model}</span>
          <span>{systemInfo.ram.total} GB RAM</span>
          <span>{platform === 'youtube' ? 'YouTube' : 'Twitch'}</span>
          <span>{recommendation.source === 'ai' ? 'Análisis IA' : 'Cálculo local verificado'}</span>
        </div>
      </section>

      <section className="reasoning-card">
        <div className="reasoning-card__icon">
          <IconActivity className="h-5 w-5" />
        </div>
        <div>
          <span className="eyebrow">Por qué este plan</span>
          <p><InlineEmphasis text={recommendation.reasoning} /></p>
        </div>
      </section>

      {consoleProfile && (
        <section className="capture-chain" aria-labelledby="capture-chain-title">
          <div className="capture-chain__header">
            <div>
              <span className="eyebrow">Cadena de captura</span>
              <h2 id="capture-chain-title">El límite real está identificado</h2>
            </div>
            <strong>{consoleProfile.profile.captureResolution} · {consoleProfile.profile.captureFps} FPS</strong>
          </div>
          <div className="capture-chain__devices">
            {[consoleProfile.profile.console, consoleProfile.profile.captureCard, consoleProfile.profile.monitor].map((device, index) => (
              <React.Fragment key={`${device.name}-${index}`}>
                {index > 0 && <span className="capture-chain__line" aria-hidden="true">→</span>}
                <div>
                  <span>{index === 0 ? 'Consola' : index === 1 ? 'Capturadora' : 'Pantalla'}</span>
                  <strong>{device.name}</strong>
                </div>
              </React.Fragment>
            ))}
          </div>
          <p>{consoleProfile.profile.bottleneck}</p>
        </section>
      )}

      <section className="recommendation-table" aria-labelledby="recommendation-title">
        <div className="recommendation-table__header">
          <div>
            <span className="eyebrow">Recomendación completa</span>
            <h2 id="recommendation-title">Qué cambia y para qué sirve</h2>
          </div>
          <span>
            {automaticRows.length} automático{automaticRows.length === 1 ? '' : 's'}
            {manualRows.length > 0 ? ` · ${manualRows.length} manual${manualRows.length === 1 ? '' : 'es'}` : ''}
          </span>
        </div>
        <div className="recommendation-table__columns" aria-hidden="true">
          <span>Ajuste</span>
          <span>Tu OBS</span>
          <span>Recomendado</span>
          <span>Por qué</span>
          <span>Estado</span>
        </div>
        <div className="recommendation-table__body">
          {rows.map((row) => {
            const same = obsSettingsSnapshot ? isSameValue(row) : false;
            const manual = !same && row.applyMethod === 'manual';
            return (
              <article key={row.label} className="recommendation-row">
                <strong className="recommendation-row__label">{row.label}</strong>
                <span data-label="Tu OBS" className="recommendation-row__current">
                  {row.current === 'Sin comparar' ? row.current : formatValue(row, row.current || 'Desconocido')}
                </span>
                <span data-label="Recomendado" className="recommendation-row__recommended">
                  {formatValue(row, row.recommended)}
                </span>
                <p data-label="Por qué">{row.reason}</p>
                <span className={`recommendation-row__state ${same ? 'is-same' : manual ? 'is-manual' : 'is-change'}`}>
                  {same ? <IconCheck className="h-3.5 w-3.5" /> : null}
                  {same ? 'Mantener' : manual ? 'Manual' : 'Cambiar'}
                </span>
              </article>
            );
          })}
        </div>
      </section>

      {!obsConnected && <ConnectionDock />}

      <section className={`apply-bar ${applyStatus === 'complete' ? 'apply-bar--success' : applyStatus === 'partial' ? 'apply-bar--partial' : ''}`}>
        <div>
          <span className="eyebrow">
            {applyStatus === 'complete'
              ? 'Configuración aplicada'
              : applyStatus === 'partial'
                ? 'Aplicación parcial verificada'
                : 'Listo para OBS'}
          </span>
          <strong>
            {applyStatus === 'complete'
              ? 'OBS ya usa esta configuración'
              : applyStatus === 'partial'
                ? 'OBS aplicó los cambios compatibles'
                : `${automaticRows.length} automáticos${manualRows.length > 0 ? ` · ${manualRows.length} manuales` : ''}`}
          </strong>
          <small>
            {applyStatus === 'complete'
              ? 'Verificamos el nuevo estado después de escribir los cambios.'
              : applyStatus === 'partial'
                ? 'Confirma el bitrate y la calidad marcados como Manual en Ajustes > Salida de OBS.'
                : manualRows.length > 0
                  ? 'El bitrate y la calidad avanzados no se pueden leer ni escribir por OBS WebSocket.'
                  : 'Nada se modifica hasta que confirmes.'}
          </small>
        </div>
        <div className="apply-bar__actions">
          {backupDate && (
            <button type="button" onClick={() => setRestoreOpen(true)} className="calm-button calm-button--ghost">
              <IconRefresh className="h-4 w-4" />
              Restaurar
            </button>
          )}
          {applyStatus !== 'idle' ? (
            <button type="button" onClick={onNewGoal} className="calm-button calm-button--primary">
              Nueva configuración
            </button>
          ) : (
            <button
              type="button"
              disabled={!obsConnected || isApplying}
              onClick={() => setConfirmOpen(true)}
              className="calm-button calm-button--primary"
            >
              {isApplying ? <Spinner className="h-4 w-4 border-background/70 border-t-transparent" /> : <IconUpload className="h-4 w-4" />}
              {isApplying ? 'Aplicando…' : `Aplicar ${automaticRows.length} cambios`}
            </button>
          )}
        </div>
      </section>

      <button type="button" className="new-goal-link" onClick={onNewGoal}>
        Empezar con otro objetivo
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title="Aplicar esta configuración"
        confirmLabel="Aplicar cambios"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void handleApply();
        }}
      >
        <p>Obsee cambiará {automaticRows.length} ajustes compatibles de video, salida y grabación.</p>
        {manualRows.length > 0 && (
          <p>
            Los {manualRows.length} ajustes marcados como Manual no se pueden leer, aplicar ni respaldar
            mediante OBS WebSocket. Tendrás que confirmarlos en Ajustes &gt; Salida.
          </p>
        )}
        <p>Antes guardará automáticamente los valores que OBS WebSocket sí permite restaurar.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={restoreOpen}
        title="Restaurar configuración anterior"
        confirmLabel="Restaurar"
        onCancel={() => setRestoreOpen(false)}
        onConfirm={() => {
          setRestoreOpen(false);
          void restoreLastBackup().then(() => setApplyStatus('idle'));
        }}
      >
        <p>OBS volverá al respaldo guardado {backupDate ? new Date(backupDate).toLocaleString('es-MX') : ''}.</p>
      </ConfirmDialog>
    </main>
  );
}
