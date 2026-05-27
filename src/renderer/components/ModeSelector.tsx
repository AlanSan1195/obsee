import React from 'react';
import { useAppStore } from '../store';

const modes = [
  { id: 'stream_record', label: 'STREAM + RECORD', icon: '📹' },
  { id: 'stream_only', label: 'STREAM ONLY', icon: '📺' },
  { id: 'record_only', label: 'RECORD ONLY', icon: '🎬' },
] as const;

export function ModeSelector() {
  const { mode, setMode } = useAppStore();

  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-zinc-400 mb-4 uppercase tracking-wider">
        Select Mode
      </h2>
      <div className="grid grid-cols-3 gap-4">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`
              p-6 rounded-xl border transition-all duration-200
              ${mode === m.id
                ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                : 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
              }
            `}
          >
            <span className="text-3xl block mb-2">{m.icon}</span>
            <span className="text-sm font-medium">{m.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}