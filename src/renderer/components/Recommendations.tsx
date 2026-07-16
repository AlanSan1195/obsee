import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store';
import { getLocalRecommendationExplanation } from '../../shared/localRecommendation';
import { appAPI } from '../lib/app-api';
import type { AIRecommendation, AIRecommendationField, AIRecommendationSettings } from '../../shared/types';
import { IconAlert, IconSliders, Section, Spinner } from './ui';

type RecommendationSettings = AIRecommendationSettings;

const recommendationFields: AIRecommendationField[] = [
  'canvas_resolution',
  'resolution',
  'recording_resolution',
  'fps',
  'encoder',
  'bitrate',
  'audio_bitrate',
  'recording_format',
  'recording_quality',
];
const resolutionOptions = ['1280x720', '1920x1080', '2560x1440', '3840x2160'];
const fpsOptions = [30, 60, 120];
const encoderOptions = ['apple vt h264', 'nvenc', 'x264', 'qsv', 'amd'];
const audioBitrateOptions = [160, 192, 256, 320];
const recordingFormatOptions = ['mkv', 'mp4', 'mov'];
const recordingQualityOptions = ['stream', 'medium', 'high', 'lossless'];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block rounded-none border border-border bg-surface/45 p-4 transition-colors focus-within:border-primary/50">
      <span className="mb-2 block text-xs uppercase tracking-wider text-text-muted">{label}</span>
      {children}
    </label>
  );
}

function SelectField<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: T[];
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const displayValue = String(value).toUpperCase();

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
        className="flex min-h-9 w-full items-center justify-between gap-3 rounded-none border border-transparent bg-surface-hover/45 px-3 py-2 text-left text-base font-medium text-text transition-colors hover:border-border hover:bg-surface-hover focus:border-primary/60 focus:outline-none"
      >
        <span className="min-w-0 truncate">{displayValue}</span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-2 max-h-56 overflow-y-auto rounded-none border border-border bg-background p-1 shadow-2xl shadow-black/40"
        >
          {options.map((option) => {
            const selected = String(option) === String(value);
            return (
              <button
                key={String(option)}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-none px-3 py-2 text-left text-sm font-medium transition-colors ${
                  selected
                    ? 'bg-secondary/15 text-secondary'
                    : 'text-text hover:bg-surface-hover'
                }`}
              >
                <span>{String(option).toUpperCase()}</span>
                {selected && <span className="text-xs text-secondary">Actual</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NumberField({
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-w-0 flex-1 bg-transparent text-base font-medium text-text outline-none"
      />
      <span className="shrink-0 text-sm font-medium text-text-muted">{suffix}</span>
    </div>
  );
}

function getChangedFields(
  originalRecommendations: RecommendationSettings,
  currentRecommendations: RecommendationSettings,
): AIRecommendationField[] {
  return recommendationFields.filter((field) => (
    originalRecommendations[field] !== currentRecommendations[field]
  ));
}

function isUsableRecommendation(settings: RecommendationSettings): boolean {
  return Boolean(
    /^\d{3,4}x\d{3,4}$/.test(settings.canvas_resolution)
    && /^\d{3,4}x\d{3,4}$/.test(settings.resolution)
    && /^\d{3,4}x\d{3,4}$/.test(settings.recording_resolution)
    && settings.fps > 0
    && settings.bitrate > 0
    && settings.audio_bitrate > 0
    && settings.encoder.trim()
    && settings.recording_format.trim()
    && settings.recording_quality.trim(),
  );
}

function getSourceLabel(source: AIRecommendation['source']): string {
  return source === 'ai' ? 'IA integrada' : 'Recomendacion local';
}

export function Recommendations() {
  const {
    recommendation,
    isAnalyzing,
    mode,
    platform,
    systemInfo,
    setRecommendation,
  } = useAppStore();
  const [isExplaining, setIsExplaining] = useState(false);
  const [explanationSource, setExplanationSource] = useState<AIRecommendation['source'] | null>(null);
  const explanationRequestIdRef = useRef(0);

  useEffect(() => {
    if (!recommendation || !mode || !platform || !systemInfo) return undefined;

    const originalRecommendations = recommendation.originalRecommendations ?? recommendation.recommendations;
    const changedFields = getChangedFields(originalRecommendations, recommendation.recommendations);
    if (changedFields.length === 0 || !isUsableRecommendation(recommendation.recommendations)) {
      setIsExplaining(false);
      setExplanationSource(null);
      if (
        changedFields.length === 0
        && recommendation.originalReasoning
        && recommendation.reasoning !== recommendation.originalReasoning
      ) {
        setRecommendation({
          ...recommendation,
          reasoning: recommendation.originalReasoning,
        });
      }
      return undefined;
    }

    const requestId = explanationRequestIdRef.current + 1;
    explanationRequestIdRef.current = requestId;
    setIsExplaining(true);

    const request = {
      systemInfo,
      mode,
      platform,
      originalRecommendations,
      currentRecommendations: recommendation.recommendations,
      changedFields,
    };

    const timeoutId = window.setTimeout(async () => {
      const explanation = await appAPI.ai.explainRecommendation(request)
        .catch(() => getLocalRecommendationExplanation(request));

      if (explanationRequestIdRef.current !== requestId) return;

      const latestRecommendation = useAppStore.getState().recommendation;
      if (!latestRecommendation) return;

      setRecommendation({
        ...latestRecommendation,
        originalRecommendations: latestRecommendation.originalRecommendations ?? originalRecommendations,
        reasoning: explanation.reasoning,
      });
      setExplanationSource(explanation.source);
      setIsExplaining(false);
    }, 700);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    mode,
    platform,
    recommendation?.originalRecommendations?.audio_bitrate,
    recommendation?.originalRecommendations?.bitrate,
    recommendation?.originalRecommendations?.canvas_resolution,
    recommendation?.originalRecommendations?.encoder,
    recommendation?.originalRecommendations?.fps,
    recommendation?.originalRecommendations?.recording_format,
    recommendation?.originalRecommendations?.recording_quality,
    recommendation?.originalRecommendations?.recording_resolution,
    recommendation?.originalRecommendations?.resolution,
    recommendation?.originalReasoning,
    recommendation?.recommendations.audio_bitrate,
    recommendation?.recommendations.bitrate,
    recommendation?.recommendations.canvas_resolution,
    recommendation?.recommendations.encoder,
    recommendation?.recommendations.fps,
    recommendation?.recommendations.recording_format,
    recommendation?.recommendations.recording_quality,
    recommendation?.recommendations.recording_resolution,
    recommendation?.recommendations.resolution,
    setRecommendation,
    systemInfo,
  ]);

  if (isAnalyzing) {
    return (
      <Section title="config.recomendada" icon={<IconSliders className="h-4 w-4" />}>
        <div className="flex items-center gap-3">
          <Spinner />
          <span className="text-sm text-text-muted">Obteniendo recomendaciones...</span>
        </div>
      </Section>
    );
  }

  if (!recommendation) return null;

  const { recommendations, reasoning } = recommendation;
  const originalRecommendations = recommendation.originalRecommendations ?? recommendations;
  const changedFields = getChangedFields(originalRecommendations, recommendations);
  const hasUserChanges = changedFields.length > 0;
  const updateRecommendations = (patch: Partial<RecommendationSettings>) => {
    const baselineRecommendations = recommendation.originalRecommendations ?? recommendation.recommendations;
    const baselineReasoning = recommendation.originalReasoning ?? recommendation.reasoning;
    setRecommendation({
      ...recommendation,
      originalRecommendations: baselineRecommendations,
      originalReasoning: baselineReasoning,
      recommendations: {
        ...recommendations,
        ...patch,
      },
    });
  };

  return (
    <Section title="config.recomendada" icon={<IconSliders className="h-4 w-4" />} accent>
      {recommendation.source === 'local' && (
        <div className="mb-4 flex items-start gap-3 rounded-none border border-warning/35 bg-warning/[0.06] p-4 text-sm text-warning">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>La IA integrada no respondio o alcanzo su limite. Esta es una recomendacion local de respaldo generada por obsee.</span>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-none border border-border bg-surface/45 p-3 text-xs text-text-muted">
        <span className="font-semibold uppercase tracking-wider text-primary">
          {getSourceLabel(recommendation.source)}
        </span>
        <span>Privacidad: solo se envia informacion tecnica del equipo, modo y plataforma; no se envian archivos ni claves de OBS.</span>
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Lienzo base">
          <SelectField
            value={recommendations.canvas_resolution}
            options={resolutionOptions}
            onChange={(canvas_resolution) => updateRecommendations({ canvas_resolution })}
          />
        </Field>
        <Field label="Stream">
          <SelectField
            value={recommendations.resolution}
            options={resolutionOptions}
            onChange={(resolution) => updateRecommendations({ resolution })}
          />
        </Field>
        <Field label="Grabacion">
          <SelectField
            value={recommendations.recording_resolution}
            options={resolutionOptions}
            onChange={(recording_resolution) => updateRecommendations({ recording_resolution })}
          />
        </Field>
        <Field label="FPS">
          <SelectField
            value={recommendations.fps}
            options={fpsOptions}
            onChange={(fps) => updateRecommendations({ fps })}
          />
        </Field>
        <Field label="Encoder">
          <SelectField
            value={recommendations.encoder}
            options={encoderOptions}
            onChange={(encoder) => updateRecommendations({ encoder })}
          />
        </Field>
        <Field label="Bitrate del stream">
          <NumberField
            value={recommendations.bitrate}
            min={500}
            max={100000}
            step={500}
            suffix="kbps"
            onChange={(bitrate) => updateRecommendations({ bitrate })}
          />
        </Field>
        <Field label="Audio">
          <SelectField
            value={recommendations.audio_bitrate}
            options={audioBitrateOptions}
            onChange={(audio_bitrate) => updateRecommendations({ audio_bitrate })}
          />
        </Field>
        <Field label="Formato y calidad">
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              value={recommendations.recording_format}
              options={recordingFormatOptions}
              onChange={(recording_format) => updateRecommendations({ recording_format })}
            />
            <SelectField
              value={recommendations.recording_quality}
              options={recordingQualityOptions}
              onChange={(recording_quality) => updateRecommendations({ recording_quality })}
            />
          </div>
        </Field>
      </div>
      <div className="rounded-none border border-primary/30 bg-primary/[0.06] p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="block text-xs font-semibold uppercase tracking-wider text-primary">
            Por que esta configuracion?
          </span>
          {hasUserChanges && (
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {isExplaining && <Spinner className="h-3 w-3" />}
              {isExplaining
                ? 'IA recalculando'
                : explanationSource === 'local'
                  ? 'Analisis actualizado'
                  : 'IA integrada actualizada'}
            </span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-text">{reasoning}</p>
      </div>
    </Section>
  );
}
