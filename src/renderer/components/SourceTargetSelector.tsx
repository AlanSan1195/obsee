import React from 'react';
import { useAppStore } from '../store';
import { IconCpu, IconTv, Section } from './ui';

const targets = [
  { id: 'pc', label: 'pc', icon: IconCpu },
  { id: 'console', label: 'consola', icon: IconTv },
] as const;

export function SourceTargetSelector() {
  const { analysisTarget, setAnalysisTarget } = useAppStore();

  return (
    <Section title="fuente" icon={<span className="text-xs">[3]</span>} subtitle="Que vas a transmitir: tu PC, o una consola capturada con tarjeta capturadora.">
      <div className="grid grid-cols-2 gap-3">
        {targets.map((t) => {
          const selected = analysisTarget === t.id;
          const Icon = t.icon;
          return (
            <button
              type="button"
              key={t.id}
              onClick={() => setAnalysisTarget(t.id)}
              aria-pressed={selected}
              className={`group flex flex-col items-center gap-3 rounded-none border p-5 transition-all duration-200 ${
                selected
                  ? 'border-secondary/60 bg-secondary/10 text-secondary shadow-[0_0_28px_-10px_rgba(32,214,181,0.55)]'
                  : 'border-border bg-surface/45 text-text-muted hover:-translate-y-0.5 hover:border-secondary/35 hover:bg-surface-hover hover:text-text'
              }`}
            >
              <span
                className={`flex h-11 w-11 items-center justify-center border transition-colors ${
                  selected
                    ? 'border-secondary/50 bg-secondary/15 text-secondary'
                    : 'border-border bg-surface-hover/45 text-text-muted group-hover:text-text'
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-center text-sm font-medium lowercase tracking-terminal leading-tight">{t.label}</span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}
