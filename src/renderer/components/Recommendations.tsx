import React from 'react';
import { useAppStore } from '../store';
import type { AIRecommendation } from '../../shared/types';

type RecommendationSettings = AIRecommendation['recommendations'];

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
    <label className="block rounded-lg bg-black p-4">
      <span className="mb-2 block text-xs text-zinc-500">{label}</span>
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
  return (
    <select
      value={value}
      onChange={(event) => {
        const selected = options.find((option) => String(option) === event.target.value);
        if (selected !== undefined) onChange(selected);
      }}
      className="w-full bg-transparent text-lg font-medium text-white outline-none"
    >
      {options.map((option) => (
        <option key={String(option)} value={option} className="bg-zinc-950 text-white">
          {String(option).toUpperCase()}
        </option>
      ))}
    </select>
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
        className="min-w-0 flex-1 bg-transparent text-lg font-medium text-white outline-none"
      />
      <span className="shrink-0 text-lg font-medium text-white">{suffix}</span>
    </div>
  );
}

export function Recommendations() {
  const { recommendation, isAnalyzing, setRecommendation } = useAppStore();

  if (isAnalyzing) {
    return (
      <div className="mb-8 p-6 bg-zinc-900 rounded-xl border border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-400 mb-4 uppercase tracking-wider">
          AI Recommended Settings
        </h3>
        <div className="flex items-center gap-3">
          <div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full" />
          <span className="text-zinc-400">Getting AI recommendations...</span>
        </div>
      </div>
    );
  }

  if (!recommendation) return null;

  const { recommendations, reasoning } = recommendation;
  const updateRecommendations = (patch: Partial<RecommendationSettings>) => {
    setRecommendation({
      ...recommendation,
      recommendations: {
        ...recommendations,
        ...patch,
      },
    });
  };

  return (
    <div className="mb-8 p-6 bg-zinc-900 rounded-xl border border-indigo-500/50">
      <h3 className="text-sm font-semibold text-indigo-400 mb-4 uppercase tracking-wider">
        AI Recommended Settings
      </h3>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Field label="Resolution">
          <SelectField
            value={recommendations.resolution}
            options={resolutionOptions}
            onChange={(resolution) => updateRecommendations({ resolution })}
          />
        </Field>
        <Field label="Framerate">
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
        <Field label="Bitrate">
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
        <Field label="Recording">
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
      <div className="bg-black p-4 rounded-lg border-l-4 border-indigo-500">
        <span className="text-xs text-zinc-500 block mb-2">WHY THIS CONFIG?</span>
        <p className="text-sm text-zinc-300">{reasoning}</p>
      </div>
    </div>
  );
}
