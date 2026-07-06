import React from 'react';
import { useAppStore } from '../store';
import type { ConsoleModel } from '../../shared/types';
import { Section } from './ui';

const consoles: { id: ConsoleModel; label: string }[] = [
  { id: 'ps5', label: 'PS5' },
  { id: 'ps5_pro', label: 'PS5 Pro' },
  { id: 'xbox_series_x', label: 'Xbox Series X' },
  { id: 'xbox_series_s', label: 'Xbox Series S' },
  { id: 'switch', label: 'Switch' },
  { id: 'switch2', label: 'Switch 2' },
];

export function ConsoleSelector() {
  const { consoleModel, setConsoleModel } = useAppStore();

  return (
    <Section title="consola.select" icon={<span className="text-xs">[1]</span>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {consoles.map((c) => {
          const selected = consoleModel === c.id;
          return (
            <button
              type="button"
              key={c.id}
              onClick={() => setConsoleModel(c.id)}
              aria-pressed={selected}
              className={`flex items-center justify-center rounded-none border px-3 py-4 text-center text-sm font-medium lowercase tracking-terminal transition-all duration-200 ${
                selected
                  ? 'border-primary/60 bg-primary/10 text-primary shadow-[0_0_28px_-10px_rgba(58,155,220,0.6)]'
                  : 'border-border bg-white/[0.03] text-text-muted hover:-translate-y-0.5 hover:border-primary/30 hover:bg-surface-hover hover:text-text'
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </Section>
  );
}
