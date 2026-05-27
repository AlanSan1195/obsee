import React from 'react';
import { useAppStore } from '../store';

type ComparisonRow = {
  label: string;
  current: string;
  recommended: string;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isSameValue(current: string, recommended: string): boolean {
  if (current === '0' || current === 'Unknown') return false;
  return normalize(current) === normalize(recommended);
}

export function OBSComparison() {
  const { obsSettingsSnapshot, recommendation, obsConnected } = useAppStore();

  if (!obsConnected || !obsSettingsSnapshot || !recommendation) return null;

  const { recommendations } = recommendation;
  const rows: ComparisonRow[] = [
    {
      label: 'Base canvas',
      current: obsSettingsSnapshot.baseResolution,
      recommended: recommendations.resolution,
    },
    {
      label: 'Output resolution',
      current: obsSettingsSnapshot.outputResolution,
      recommended: recommendations.resolution,
    },
    {
      label: 'FPS',
      current: String(obsSettingsSnapshot.fps),
      recommended: String(recommendations.fps),
    },
    {
      label: 'Encoder',
      current: obsSettingsSnapshot.encoder,
      recommended: recommendations.encoder,
    },
    {
      label: 'Video bitrate',
      current: String(obsSettingsSnapshot.bitrate),
      recommended: String(recommendations.bitrate),
    },
    {
      label: 'Audio bitrate',
      current: String(obsSettingsSnapshot.audioBitrate),
      recommended: String(recommendations.audio_bitrate),
    },
    {
      label: 'Recording format',
      current: obsSettingsSnapshot.recordingFormat,
      recommended: recommendations.recording_format,
    },
    {
      label: 'Recording quality',
      current: obsSettingsSnapshot.recordingQuality,
      recommended: recommendations.recording_quality,
    },
  ];

  const changeCount = rows.filter((row) => !isSameValue(row.current, row.recommended)).length;

  return (
    <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          OBS Diagnosis
        </h3>
        <span className="rounded-full border border-indigo-500/40 px-3 py-1 text-xs font-semibold text-indigo-300">
          {changeCount} changes
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <div className="grid grid-cols-[1fr_1fr_1fr_96px] bg-black px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <span>Setting</span>
          <span>Current OBS</span>
          <span>Recommended</span>
          <span>Status</span>
        </div>
        {rows.map((row) => {
          const same = isSameValue(row.current, row.recommended);
          return (
            <div
              key={row.label}
              className="grid grid-cols-[1fr_1fr_1fr_96px] items-center border-t border-zinc-800 px-4 py-3 text-sm"
            >
              <span className="font-medium text-zinc-300">{row.label}</span>
              <span className="text-zinc-500">{row.current || 'Unknown'}</span>
              <span className="text-zinc-100">{row.recommended}</span>
              <span className={same ? 'text-green-400' : 'text-yellow-400'}>
                {same ? 'Keep' : 'Change'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
