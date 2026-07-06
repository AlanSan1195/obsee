import React from 'react';
import { useAppStore } from '../store';
import { IconClapperboard, IconTv, IconVideo, Section } from './ui';

const modes = [
  { id: 'stream_record', label: 'stream + rec', icon: IconVideo },
  { id: 'stream_only', label: 'solo stream', icon: IconTv },
  { id: 'record_only', label: 'solo grabacion', icon: IconClapperboard },
] as const;

export function ModeSelector() {
  const { mode, setMode } = useAppStore();

  return (
    <Section title="modo.select" icon={<span className="text-xs">[1]</span>}>
      <div className="grid grid-cols-3 gap-3">
        {modes.map((m) => {
          const selected = mode === m.id;
          const Icon = m.icon;
          return (
            <button
              type="button"
              key={m.id}
              onClick={() => setMode(m.id)}
              aria-pressed={selected}
              className={`group flex flex-col items-center gap-3 rounded-none border p-5 transition-all duration-200 ${
                selected
                  ? 'border-primary/60 bg-primary/10 text-primary shadow-[0_0_28px_-10px_rgba(59,111,224,0.6)]'
                  : 'border-border bg-white/[0.03] text-text-muted hover:-translate-y-0.5 hover:border-primary/30 hover:bg-surface-hover hover:text-text'
              }`}
            >
              <span
                className={`flex h-11 w-11 items-center justify-center border transition-colors ${
                  selected
                    ? 'border-primary/50 bg-primary/15 text-primary'
                    : 'border-border bg-white/5 text-text-muted group-hover:text-text'
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-center text-sm font-medium lowercase tracking-terminal leading-tight">{m.label}</span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}
