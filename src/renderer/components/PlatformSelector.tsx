import React from 'react';
import { useAppStore } from '../store';
import { IconTwitch, IconYoutube, Section } from './ui';

const platforms = [
  {
    id: 'twitch',
    label: 'twitch',
    icon: IconTwitch,
    selectedClasses: 'border-secondary/60 bg-secondary/10 text-secondary shadow-[0_0_28px_-10px_rgba(32,214,181,0.55)]',
    selectedIconClasses: 'border-secondary/50 bg-secondary/15 text-secondary',
  },
  {
    id: 'youtube',
    label: 'youtube',
    icon: IconYoutube,
    selectedClasses: 'border-secondary/60 bg-secondary/10 text-secondary shadow-[0_0_28px_-10px_rgba(32,214,181,0.55)]',
    selectedIconClasses: 'border-secondary/50 bg-secondary/15 text-secondary',
  },
] as const;

export function PlatformSelector() {
  const { platform, setPlatform } = useAppStore();

  return (
    <Section title="plataforma" icon={<span className="text-xs">[2]</span>}>
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
                  : 'border-border bg-surface/45 text-text-muted hover:-translate-y-0.5 hover:border-secondary/35 hover:bg-surface-hover hover:text-text'
              }`}
            >
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-none border transition-colors ${
                  selected
                    ? p.selectedIconClasses
                    : 'border-border bg-surface-hover/45 text-text-muted group-hover:text-text'
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
