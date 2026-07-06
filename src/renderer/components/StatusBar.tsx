import React from 'react';
import { useAppStore } from '../store';

export function StatusBar() {
  const { obsConnected, obsMessage } = useAppStore();

  return (
    <div className="mt-8 pt-4">
      <div
        aria-live="polite"
        className="flex items-center gap-3 border-t border-border px-1 py-3 text-xs lowercase tracking-terminal"
      >
        <span aria-hidden="true" className="flex shrink-0 items-center">
          <span
            className={`inline-block h-2 w-2 ${
              obsConnected ? 'animate-pulse-dot bg-secondary glow-secondary' : 'bg-danger'
            }`}
          />
        </span>
        <span className="text-text-faint">obsee@local:~$</span>
        <span className="text-text-muted">{obsMessage}</span>
        <span className="ml-auto hidden text-text-faint sm:block">
          {obsConnected ? 'ws · conectado' : 'ws · cerrado'}
        </span>
      </div>
    </div>
  );
}
