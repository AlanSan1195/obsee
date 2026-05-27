import React from 'react';
import { useAppStore } from '../store';

export function StatusBar() {
  const { obsConnected, obsMessage } = useAppStore();

  return (
    <div className="mt-auto pt-4 border-t border-zinc-800">
      <div className="flex items-center gap-2">
        <span className={`w-3 h-3 rounded-full ${obsConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-sm text-zinc-400">{obsMessage}</span>
      </div>
    </div>
  );
}