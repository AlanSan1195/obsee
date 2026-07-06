import React from 'react';
import { useAppStore } from '../store';
import { IconTwitch, IconYoutube, Section } from './ui';

const platforms = [
  {
    id: 'twitch',
    label: 'twitch',
    icon: IconTwitch,
    selectedClasses: 'border-primary/60 bg-primary/10 text-primary shadow-[0_0_28px_-10px_rgba(58,155,220,0.6)]',
    selectedIconClasses: 'border-primary/50 bg-primary/15 text-primary',
  },
  {
    id: 'youtube',
    label: 'youtube',
    icon: IconYoutube,
    selectedClasses: 'border-primary/60 bg-primary/10 text-primary shadow-[0_0_28px_-10px_rgba(58,155,220,0.6)]',
    selectedIconClasses: 'border-primary/50 bg-primary/15 text-primary',
  },
] as const;

export function PlatformSelector() {
  const { platform, setPlatform } = useAppStore();

  return (
    <Section title="target.select" icon={<span className="text-xs">[2]</span>}>
      <div className="grid grid-cols-2 gap-3">
        {platforms.map((p) => {
          const selected = platform === p.id;
          const Icon = p.icon;
          return (
            <button
              type="button"
              key={p.id}
              onClick={() => setPlatform(p.id)}
              aria-pressed={selected}
              className={`group flex flex-col items-center gap-3 rounded-none border p-5 backdrop-blur-md transition-all duration-200 ${
                selected
                  ? p.selectedClasses
                  : 'border-border bg-white/[0.03] text-text-muted hover:-translate-y-0.5 hover:border-primary/30 hover:bg-surface-hover hover:text-text'
              }`}
            >
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-none border transition-colors ${
                  selected
                    ? p.selectedIconClasses
                    : 'border-border bg-white/5 text-text-muted group-hover:text-text'
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-sm font-medium lowercase tracking-terminal">{p.label}</span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}
