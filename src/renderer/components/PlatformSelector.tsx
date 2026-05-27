import React from 'react';
import { useAppStore } from '../store';

const platforms = [
  { id: 'twitch', label: 'Twitch', color: '#9146FF' },
  { id: 'youtube', label: 'YouTube', color: '#FF0000' },
] as const;

export function PlatformSelector() {
  const { platform, setPlatform } = useAppStore();

  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-zinc-400 mb-4 uppercase tracking-wider">
        Select Platform
      </h2>
      <div className="grid grid-cols-2 gap-4">
        {platforms.map((p) => (
          <button
            key={p.id}
            onClick={() => setPlatform(p.id)}
            className={`
              p-6 rounded-xl border transition-all duration-200
              ${platform === p.id
                ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                : 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
              }
            `}
          >
            <span className="text-2xl block mb-2" style={{ color: p.color }}>
              {p.id === 'twitch' ? '👾' : '▶️'}
            </span>
            <span className="text-lg font-semibold">{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}