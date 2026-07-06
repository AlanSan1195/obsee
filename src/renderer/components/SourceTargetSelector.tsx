import React from 'react';
import { useAppStore } from '../store';
import { IconCpu, IconTv, Section } from './ui';

const targets = [
  { id: 'pc', label: 'pc gaming', icon: IconCpu },
  { id: 'console', label: 'consola', icon: IconTv },
] as const;

export function SourceTargetSelector() {
  const { analysisTarget, setAnalysisTarget } = useAppStore();

  return (
    <Section title="fuente.select" icon={<span className="text-xs">[0]</span>} subtitle="Que vas a transmitir: tu PC, o una consola capturada con tarjeta capturadora.">
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
                  ? 'border-primary/60 bg-primary/10 text-primary shadow-[0_0_28px_-10px_rgba(58,155,220,0.6)]'
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
              <span className="text-center text-sm font-medium lowercase tracking-terminal leading-tight">{t.label}</span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}
