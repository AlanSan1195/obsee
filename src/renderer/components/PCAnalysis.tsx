import React from 'react';
import { useAppStore } from '../store';

export function PCAnalysis() {
  const { systemInfo, isAnalyzing } = useAppStore();

  if (isAnalyzing) {
    return (
      <div className="mb-8 p-6 bg-zinc-900 rounded-xl border border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-400 mb-4 uppercase tracking-wider">
          PC Analysis
        </h3>
        <div className="flex items-center gap-3">
          <div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full" />
          <span className="text-zinc-400">Analyzing your system...</span>
        </div>
      </div>
    );
  }

  if (!systemInfo) return null;

  return (
    <div className="mb-8 p-6 bg-zinc-900 rounded-xl border border-zinc-800">
      <h3 className="text-sm font-semibold text-zinc-400 mb-4 uppercase tracking-wider">
        PC Analysis
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-black p-4 rounded-lg">
          <span className="text-xs text-zinc-500 block mb-1">CPU</span>
          <span className="font-medium">{systemInfo.cpu.model}</span>
          <span className="text-xs text-zinc-500 ml-2">({systemInfo.cpu.cores} cores)</span>
        </div>
        <div className="bg-black p-4 rounded-lg">
          <span className="text-xs text-zinc-500 block mb-1">GPU</span>
          <span className="font-medium">{systemInfo.gpu.model}</span>
          <span className="text-xs text-zinc-500 ml-2">({(systemInfo.gpu.vram / 1024).toFixed(1)}GB VRAM)</span>
        </div>
        <div className="bg-black p-4 rounded-lg">
          <span className="text-xs text-zinc-500 block mb-1">RAM</span>
          <span className="font-medium">{systemInfo.ram.total}GB DDR</span>
        </div>
        <div className="bg-black p-4 rounded-lg">
          <span className="text-xs text-zinc-500 block mb-1">OS</span>
          <span className="font-medium">{systemInfo.os.distro}</span>
          <span className="text-xs text-zinc-500 ml-2">({systemInfo.os.release})</span>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        {systemInfo.gpu.hasNvenc ? (
          <>
            <span className="text-green-500">✓</span>
            <span className="text-sm text-green-500">Hardware NVENC available</span>
          </>
        ) : (
          <>
            <span className="text-yellow-500">⚠</span>
            <span className="text-sm text-yellow-500">No hardware NVENC - using software encoding</span>
          </>
        )}
      </div>
    </div>
  );
}