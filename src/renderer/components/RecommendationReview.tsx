import React, { useEffect, useMemo, useState } from 'react';
import { parseGoal, type ParsedGoal } from '../../shared/goalParser';
import {
  getLocalRecommendationExplanation,
  getRecordingBitrate,
  getStreamBitrate,
} from '../../shared/localRecommendation';
import {
  recommendationEncoderOptions,
  recommendationRecordingFormatOptions,
  recommendationRecordingQualityOptions,
} from '../../shared/recommendationOptions';
import type {
  AIRecommendationField,
  AIRecommendationSettings,
  OBSMode,
} from '../../shared/types';
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
import {
  IconActivity,
  IconAlert,
  IconCheck,
  IconRefresh,
  IconSliders,
  IconUpload,
  IconX,
  Spinner,
} from './ui';

interface RecommendationReviewProps {
  goal: ParsedGoal;
  onNewGoal: () => void;
  onRefineGoal: (
    goal: ParsedGoal,
    technicalOverrides: Partial<AIRecommendationSettings>,
  ) => Promise<boolean>;
}

interface ReviewRow extends ComparisonRow {
  reason: string;
}

const modeLabels: Record<OBSMode, string> = {
  stream_record: 'transmitir y grabar',
  stream_only: 'transmitir',
  record_only: 'grabar',
};

const resolutionOptions = ['1280x720', '1920x1080', '2560x1440', '3840x2160'];
const fpsOptions = [30, 60, 120];
const audioBitrateOptions = [160, 192, 256, 320];

interface GoalMismatch {
  label: string;
  requested: string;
  recommended: string;
}

function getGoalMismatches(
  goal: ParsedGoal,
  settings: AIRecommendationSettings,
): GoalMismatch[] {
  const mismatches: GoalMismatch[] = [];
  if (
    goal.mode !== 'record_only'
    && goal.preferences.streamResolution
    && goal.preferences.streamResolution !== settings.resolution
  ) {
    mismatches.push({
      label: 'Stream',
      requested: goal.preferences.streamResolution,
      recommended: settings.resolution,
    });
  }
  if (
    goal.mode !== 'stream_only'
    && goal.preferences.recordingResolution
    && goal.preferences.recordingResolution !== settings.recording_resolution
  ) {
    mismatches.push({
      label: 'Grabación',
      requested: goal.preferences.recordingResolution,
      recommended: settings.recording_resolution,
    });
  }
  if (goal.preferences.fps && goal.preferences.fps !== settings.fps) {
    mismatches.push({
      label: 'Fluidez',
      requested: `${goal.preferences.fps} FPS`,
      recommended: `${settings.fps} FPS`,
    });
  }
  return mismatches;
}

function resolutionPixels(resolution: string): number {
  const [width, height] = resolution.split('x').map(Number);
  return Number.isFinite(width) && Number.isFinite(height) ? width * height : 0;
}

interface RecommendationAdjusterProps {
  goal: ParsedGoal;
  settings: AIRecommendationSettings;
  onClose: () => void;
  onSubmit: RecommendationReviewProps['onRefineGoal'];
}

function RecommendationAdjuster({
  goal,
  settings,
  onClose,
  onSubmit,
}: RecommendationAdjusterProps) {
  const initialStreamResolution = goal.preferences.streamResolution ?? settings.resolution;
  const initialRecordingResolution = goal.preferences.recordingResolution ?? settings.recording_resolution;
  const initialFps = goal.preferences.fps ?? settings.fps;
  const [clarification, setClarification] = useState('');
  const [streamResolution, setStreamResolution] = useState(initialStreamResolution);
  const [recordingResolution, setRecordingResolution] = useState(initialRecordingResolution);
  const [fps, setFps] = useState(initialFps);
  const [encoder, setEncoder] = useState(settings.encoder);
  const [recordingEncoder, setRecordingEncoder] = useState(settings.recording_encoder);
  const [bitrate, setBitrate] = useState(settings.bitrate);
  const [recordingBitrate, setRecordingBitrate] = useState(settings.recording_bitrate);
  const [audioBitrate, setAudioBitrate] = useState(settings.audio_bitrate);
  const [recordingFormat, setRecordingFormat] = useState(settings.recording_format);
  const [recordingQuality, setRecordingQuality] = useState(settings.recording_quality);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isRefining, setIsRefining] = useState(false);

  const submitRefinement = async () => {
    const parsed = clarification.trim() ? parseGoal(clarification) : null;
    const description = clarification.trim()
      ? `${goal.preferences.description}\nAclaración: ${clarification.trim()}`
      : goal.preferences.description;
    const selectedStreamChanged = streamResolution !== initialStreamResolution;
    const selectedRecordingChanged = recordingResolution !== initialRecordingResolution;
    const selectedFpsChanged = fps !== initialFps;
    const refinedGoal: ParsedGoal = {
      ...goal,
      mode: goal.mode,
      platform: parsed?.platform ?? goal.platform,
      consoleModel: parsed?.consoleModel ?? goal.consoleModel,
      captureCard: parsed?.captureCard ?? goal.captureCard,
      monitor: parsed?.monitor ?? goal.monitor,
      hardware: {
        cpuModel: parsed?.hardware.cpuModel ?? goal.hardware.cpuModel,
        cpuCores: parsed?.hardware.cpuCores ?? goal.hardware.cpuCores,
        ramGb: parsed?.hardware.ramGb ?? goal.hardware.ramGb,
      },
      preferences: {
        ...goal.preferences,
        streamResolution: selectedStreamChanged
          ? streamResolution
          : parsed?.preferences.streamResolution ?? streamResolution,
        recordingResolution: selectedRecordingChanged
          ? recordingResolution
          : parsed?.preferences.recordingResolution ?? recordingResolution,
        fps: selectedFpsChanged ? fps : parsed?.preferences.fps ?? fps,
        source: parsed?.consoleModel ? 'console' : goal.preferences.source,
        deviceNotes: parsed?.preferences.deviceNotes ?? goal.preferences.deviceNotes,
        description,
      },
    };
    const technicalOverrides: Partial<AIRecommendationSettings> = {};
    if (encoder !== settings.encoder) technicalOverrides.encoder = encoder;
    if (recordingEncoder !== settings.recording_encoder) {
      technicalOverrides.recording_encoder = recordingEncoder;
    }
    if (bitrate !== settings.bitrate) technicalOverrides.bitrate = bitrate;
    if (recordingBitrate !== settings.recording_bitrate) {
      technicalOverrides.recording_bitrate = recordingBitrate;
    }
    if (audioBitrate !== settings.audio_bitrate) technicalOverrides.audio_bitrate = audioBitrate;
    if (recordingFormat !== settings.recording_format) {
      technicalOverrides.recording_format = recordingFormat;
    }
    if (recordingQuality !== settings.recording_quality) {
      technicalOverrides.recording_quality = recordingQuality;
    }

    setIsRefining(true);
    const success = await onSubmit(refinedGoal, technicalOverrides);
    setIsRefining(false);
    if (success) onClose();
  };

  return (
    <section className="recommendation-adjuster" aria-labelledby="adjuster-title">
      <div className="recommendation-adjuster__header">
        <div>
          <span className="eyebrow">Ajustar recomendación</span>
          <h2 id="adjuster-title">Corrige lo que Obsee debe respetar</h2>
          <p>Conservaremos tu contexto y volveremos a validar las salidas con esta precisión.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar ajustes">
          <IconX className="h-4 w-4" />
        </button>
      </div>

      <div className="recommendation-adjuster__quick">
        <button type="button" onClick={() => setStreamResolution('1920x1080')}>Stream 1080p</button>
        <button type="button" onClick={() => setRecordingResolution('3840x2160')}>Grabar en 4K</button>
        <button type="button" onClick={() => setFps(60)}>Conservar 60 FPS</button>
      </div>

      <label className="recommendation-adjuster__clarification">
        <span>Aclara el detalle inesperado</span>
        <textarea
          value={clarification}
          onChange={(event) => setClarification(event.target.value)}
          placeholder="Ej.: el stream sí va a 1080p, pero la grabación local debe ser 4K60."
          rows={3}
        />
      </label>

      <div className="recommendation-adjuster__intent">
        {goal.mode !== 'record_only' && (
          <label>
            <span>Salida del stream</span>
            <select value={streamResolution} onChange={(event) => setStreamResolution(event.target.value)}>
              {resolutionOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
        )}
        {goal.mode !== 'stream_only' && (
          <label>
            <span>Grabación local</span>
            <select value={recordingResolution} onChange={(event) => setRecordingResolution(event.target.value)}>
              {resolutionOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
        )}
        <label>
          <span>Fluidez</span>
          <select value={fps} onChange={(event) => setFps(Number(event.target.value))}>
            {fpsOptions.map((option) => <option key={option} value={option}>{option} FPS</option>)}
          </select>
        </label>
      </div>

      <button
        type="button"
        className="recommendation-adjuster__advanced-toggle"
        aria-expanded={advancedOpen}
        onClick={() => setAdvancedOpen((value) => !value)}
      >
        <IconSliders className="h-4 w-4" />
        Ajustes técnicos
        <span>{advancedOpen ? 'Ocultar' : 'Editar encoders y bitrates'}</span>
      </button>

      {advancedOpen && (
        <div className="recommendation-adjuster__technical">
          {goal.mode !== 'record_only' && (
            <>
              <label>
                <span>Encoder del stream</span>
                <select value={encoder} onChange={(event) => setEncoder(event.target.value)}>
                  {recommendationEncoderOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span>Bitrate del stream</span>
                <div><input type="number" min={500} max={100000} step={500} value={bitrate} onChange={(event) => setBitrate(Number(event.target.value))} /><small>kbps</small></div>
              </label>
            </>
          )}
          {goal.mode !== 'stream_only' && (
            <>
              <label>
                <span>Encoder de grabación</span>
                <select value={recordingEncoder} onChange={(event) => setRecordingEncoder(event.target.value)}>
                  {recommendationEncoderOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span>Bitrate de grabación</span>
                <div><input type="number" min={500} max={200000} step={500} value={recordingBitrate} onChange={(event) => setRecordingBitrate(Number(event.target.value))} /><small>kbps</small></div>
              </label>
              <label>
                <span>Formato de grabación</span>
                <select value={recordingFormat} onChange={(event) => setRecordingFormat(event.target.value)}>
                  {recommendationRecordingFormatOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                <span>Calidad de grabación</span>
                <select value={recordingQuality} onChange={(event) => setRecordingQuality(event.target.value)}>
                  {recommendationRecordingQualityOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
            </>
          )}
          <label>
            <span>Bitrate de audio</span>
            <select value={audioBitrate} onChange={(event) => setAudioBitrate(Number(event.target.value))}>
              {audioBitrateOptions.map((option) => <option key={option} value={option}>{option} kbps</option>)}
            </select>
          </label>
        </div>
      )}

      <div className="recommendation-adjuster__footer">
        <p>Antes de aplicar verás nuevamente la comparación contra tu OBS.</p>
        <button
          type="button"
          className="calm-button calm-button--primary"
          disabled={isRefining}
          onClick={() => void submitRefinement()}
        >
          {isRefining ? <Spinner className="h-4 w-4 border-background/70 border-t-transparent" /> : <IconRefresh className="h-4 w-4" />}
          {isRefining ? 'Recalculando…' : 'Actualizar recomendación'}
        </button>
      </div>
    </section>
  );
}

function recommendationReasons(settings: AIRecommendationSettings): Record<string, string> {
  return {
    'Lienzo base': 'Es el área de trabajo. Conserva el detalle de la fuente antes de crear cada salida.',
    'Salida maestra / grabacion': 'Define el archivo local y puede mantener más calidad que la transmisión.',
    'Salida del stream': 'Es lo que recibe la audiencia; equilibra nitidez con estabilidad de red.',
    FPS: `${settings.fps} FPS mantienen el movimiento fluido sin pedir cuadros que el perfil no necesita.`,
    'Encoder del stream': 'Comprime la emisión con el motor más adecuado para el hardware detectado.',
    'Bitrate del stream': 'Controla detalle y consumo de subida; está ajustado al destino y resolución.',
    'Control de tasa del stream': 'CBR mantiene una entrega estable para la plataforma de transmisión.',
    'Fotogramas clave del stream': 'Dos segundos es el intervalo esperado por las plataformas principales.',
    'Perfil del stream': 'High conserva eficiencia y compatibilidad para H.264.',
    'B-frames del stream': 'Mejoran la compresión sin aumentar el bitrate objetivo.',
    'AQ espacial del stream': 'Automático deja que VideoToolbox adapte detalle a cada escena.',
    'Encoder de grabacion': 'Separa el trabajo del archivo local para conservar calidad sin atarlo al stream.',
    'Bitrate de grabacion': 'Da margen adicional a escenas con movimiento y reduce artefactos en el archivo.',
    'Control de tasa de grabacion': 'Mantiene predecible el tamaño y la tasa del archivo local.',
    'Fotogramas clave de grabacion': 'Facilita búsqueda y edición sin crear fotogramas clave innecesarios.',
    'Perfil de grabacion': 'Conserva el perfil y la profundidad de color que ya usa el encoder local.',
    'B-frames de grabacion': 'Aprovecha mejor el bitrate del archivo para conservar detalle.',
    'AQ espacial de grabacion': 'Automático distribuye calidad según la complejidad visual.',
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
      const fallbackApplyMethod = row.label === 'Bitrate de grabacion'
        ? 'manual'
        : row.label === 'Bitrate del stream' || row.label === 'Calidad de grabacion'
          ? mode === 'stream_only' ? 'automatic' : 'manual'
          : undefined;
      const applyMethod = row.applyMethod ?? fallbackApplyMethod;

      return {
        ...row,
        applyMethod,
        reason: applyMethod === 'manual'
          ? 'Instala el complemento nativo de Obsee para leer y aplicar este valor de Salida avanzada; sin él debes confirmarlo en Ajustes > Salida.'
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

export function RecommendationReview({ goal, onNewGoal, onRefineGoal }: RecommendationReviewProps) {
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
    setConsoleProfile,
    setError,
    setObsMessage,
    setRecommendation,
  } = useAppStore();
  const { applyConfig, restoreLastBackup } = useAppAPI();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [backupDate, setBackupDate] = useState<string | null>(null);
  const [applyStatus, setApplyStatus] = useState<'idle' | 'complete' | 'partial'>('idle');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [mismatchAcknowledged, setMismatchAcknowledged] = useState(false);

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
  const mismatches = useMemo(
    () => recommendation ? getGoalMismatches(goal, recommendation.recommendations) : [],
    [goal, recommendation],
  );
  const mismatchKey = mismatches
    .map((mismatch) => `${mismatch.label}:${mismatch.requested}:${mismatch.recommended}`)
    .join('|');

  useEffect(() => {
    setMismatchAcknowledged(false);
  }, [mismatchKey]);

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

  const handleUseRequestedGoal = () => {
    const requestedSettings: AIRecommendationSettings = {
      ...settings,
      resolution: goal.mode === 'record_only'
        ? settings.resolution
        : goal.preferences.streamResolution ?? settings.resolution,
      recording_resolution: goal.mode === 'stream_only'
        ? settings.recording_resolution
        : goal.preferences.recordingResolution ?? settings.recording_resolution,
      fps: goal.preferences.fps ?? settings.fps,
    };
    requestedSettings.canvas_resolution = resolutionPixels(requestedSettings.recording_resolution)
      > resolutionPixels(requestedSettings.resolution)
      ? requestedSettings.recording_resolution
      : requestedSettings.resolution;
    requestedSettings.bitrate = getStreamBitrate(
      platform,
      requestedSettings.resolution,
      requestedSettings.fps,
    );
    requestedSettings.recording_bitrate = getRecordingBitrate(
      requestedSettings.recording_resolution,
      requestedSettings.fps,
      requestedSettings.recording_encoder,
    );
    const fields = Object.keys(requestedSettings) as AIRecommendationField[];
    const changedFields = fields.filter((field) => requestedSettings[field] !== settings[field]);
    const explanation = getLocalRecommendationExplanation({
      systemInfo,
      mode,
      platform,
      goal: goal.preferences,
      originalRecommendations: settings,
      currentRecommendations: requestedSettings,
      changedFields,
    });
    const reasoning = `Se priorizó la salida que pediste. Si la fuente de captura sigue en una resolución menor, OBS la escalará; revisa las propiedades de la capturadora para obtener 4K real. ${explanation.reasoning}`;
    setRecommendation({
      ...recommendation,
      originalRecommendations: recommendation.originalRecommendations ?? settings,
      originalReasoning: recommendation.originalReasoning ?? recommendation.reasoning,
      recommendations: requestedSettings,
      reasoning,
    });
    if (consoleProfile) {
      setConsoleProfile({
        ...consoleProfile,
        recommendations: requestedSettings,
        reasoning,
      });
    }
    setAdjustOpen(false);
  };

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

      <section className="intent-contract" aria-labelledby="intent-contract-title">
        <div>
          <span className="eyebrow">Lo que entendimos</span>
          <h2 id="intent-contract-title">Objetivo que esta recomendación debe respetar</h2>
        </div>
        <div className="intent-contract__items">
          {mode !== 'record_only' && (
            <span>
              <small>Emitir</small>
              <strong>{goal.preferences.streamResolution ?? settings.resolution}</strong>
            </span>
          )}
          {mode !== 'stream_only' && (
            <span>
              <small>Grabar</small>
              <strong>{goal.preferences.recordingResolution ?? settings.recording_resolution}</strong>
            </span>
          )}
          <span>
            <small>Fluidez</small>
            <strong>{goal.preferences.fps ?? settings.fps} FPS</strong>
          </span>
          <span>
            <small>Fuente</small>
            <strong>{goal.captureCard ?? (goal.consoleModel ? 'Consola' : 'Este equipo')}</strong>
          </span>
        </div>
        <button type="button" className="calm-button calm-button--ghost" onClick={() => setAdjustOpen(true)}>
          <IconSliders className="h-4 w-4" />
          Corregir
        </button>
      </section>

      {mismatches.length > 0 && (
        <section className="intent-warning" role="alert">
          <div className="intent-warning__icon"><IconAlert className="h-5 w-5" /></div>
          <div>
            <span className="eyebrow">Hay un detalle sin cumplir</span>
            <h2>La recomendación no coincide con una instrucción explícita</h2>
            <div className="intent-warning__diffs">
              {mismatches.map((mismatch) => (
                <span key={mismatch.label}>
                  <strong>{mismatch.label}</strong>
                  Pediste {mismatch.requested}
                  <i aria-hidden="true">→</i>
                  Resultado {mismatch.recommended}
                </span>
              ))}
            </div>
            <p>
              Puede ser un límite verificado de la capturadora o una interpretación incorrecta.
              Revísalo antes de escribir cambios en OBS.
            </p>
          </div>
          <div className="intent-warning__actions">
            <button type="button" className="calm-button calm-button--primary" onClick={() => setAdjustOpen(true)}>
              Ajustar ahora
            </button>
            <button type="button" className="calm-button calm-button--ghost" onClick={handleUseRequestedGoal}>
              Usar lo que pedí
            </button>
            <button
              type="button"
              className={`calm-button calm-button--ghost ${mismatchAcknowledged ? 'is-acknowledged' : ''}`}
              onClick={() => setMismatchAcknowledged(true)}
            >
              {mismatchAcknowledged ? <IconCheck className="h-4 w-4" /> : null}
              {mismatchAcknowledged ? 'Limitación aceptada' : 'Aceptar este resultado'}
            </button>
          </div>
        </section>
      )}

      {adjustOpen && (
        <RecommendationAdjuster
          key={`${settings.resolution}-${settings.recording_resolution}-${settings.fps}`}
          goal={goal}
          settings={settings}
          onClose={() => setAdjustOpen(false)}
          onSubmit={onRefineGoal}
        />
      )}

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
            {obsSettingsSnapshot?.advancedControl?.available
              ? `Complemento avanzado ${obsSettingsSnapshot.advancedControl.pluginVersion} activo · `
              : ''}
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
                ? 'Instala el complemento de Obsee o confirma los ajustes marcados como Manual en Ajustes > Salida.'
                : manualRows.length > 0
                  ? 'El complemento nativo habilita la lectura y escritura de los encoders avanzados.'
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
            <>
              <button type="button" onClick={() => setAdjustOpen(true)} className="calm-button calm-button--ghost">
                <IconSliders className="h-4 w-4" />
                Ajustar recomendación
              </button>
              <button
                type="button"
                disabled={!obsConnected || isApplying || (mismatches.length > 0 && !mismatchAcknowledged)}
                onClick={() => setConfirmOpen(true)}
                className="calm-button calm-button--primary"
              >
                {isApplying
                  ? <Spinner className="h-4 w-4 border-background/70 border-t-transparent" />
                  : mismatches.length > 0 && !mismatchAcknowledged
                    ? <IconAlert className="h-4 w-4" />
                    : <IconUpload className="h-4 w-4" />}
                {isApplying
                  ? 'Aplicando…'
                  : mismatches.length > 0 && !mismatchAcknowledged
                    ? 'Revisar antes de aplicar'
                    : `Aplicar ${automaticRows.length} cambios`}
              </button>
            </>
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
            Los {manualRows.length} ajustes marcados como Manual requieren el complemento nativo de Obsee.
            Sin él tendrás que confirmarlos en Ajustes &gt; Salida.
          </p>
        )}
        <p>Antes guardará automáticamente un respaldo de los valores detectados.</p>
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
