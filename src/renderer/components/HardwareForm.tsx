import React, { useMemo, useState } from 'react';
import { detectHardwareHints, loadHardwareOverrides, saveHardwareOverrides } from '../lib/system-info';
import { Section } from './ui';

// Capacidades que existen de fabrica (PC y Apple Silicon)
const RAM_SIZES = [4, 8, 12, 16, 24, 32, 36, 48, 64, 96, 128];

function ramOptions(current: string): number[] {
  const value = Number(current);
  return Number.isFinite(value) && value > 0 && !RAM_SIZES.includes(value)
    ? [...RAM_SIZES, value].sort((a, b) => a - b)
    : RAM_SIZES;
}

export function HardwareForm() {
  const hints = useMemo(() => detectHardwareHints(), []);
  const initial = useMemo(() => loadHardwareOverrides(), []);
  const [cpuModel, setCpuModel] = useState(initial.cpuModel ?? hints.cpuModelHint ?? '');
  const [cpuCores, setCpuCores] = useState(String(initial.cpuCores ?? ''));
  const [ramGb, setRamGb] = useState(String(initial.ramGb ?? ''));

  const persistHardware = (next: { cpuModel: string; cpuCores: string; ramGb: string }) => {
    const cores = Number(next.cpuCores);
    const ram = Number(next.ramGb);
    saveHardwareOverrides({
      cpuModel: next.cpuModel.trim() || undefined,
      cpuCores: Number.isInteger(cores) && cores >= 1 && cores <= 256 ? cores : undefined,
      ramGb: Number.isFinite(ram) && ram > 0 ? ram : undefined,
    });
  };

  const handleCpuModelChange = (value: string) => {
    setCpuModel(value);
    persistHardware({ cpuModel: value, cpuCores, ramGb });
  };

  const handleCpuCoresChange = (value: string) => {
    setCpuCores(value);
    persistHardware({ cpuModel, cpuCores: value, ramGb });
  };

  const handleRamChange = (value: string) => {
    setRamGb(value);
    persistHardware({ cpuModel, cpuCores, ramGb: value });
  };

  return (
    <Section
      title="hardware.config"
      icon={<span className="text-xs">[hw]</span>}
      subtitle="El navegador estima la GPU. Confirma el CPU, sus nucleos y la RAM para que la recomendacion sea precisa."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border border-border bg-white/[0.03] px-4 py-3 text-xs lowercase tracking-terminal">
          <span className="flex items-center gap-1.5">
            <span className="text-text-faint">gpu</span>
            <span className="text-primary">{hints.gpu.model}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-text-faint">marca</span>
            <span className="text-text">{hints.gpu.vendor.toLowerCase()}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-text-faint">procesadores logicos (estimacion)</span>
            <span className="text-text">{hints.logicalProcessors ?? 'no disponible'}</span>
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px_140px]">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-muted">
              Modelo de CPU
            </span>
            <input
              type="text"
              value={cpuModel}
              onChange={(event) => handleCpuModelChange(event.target.value)}
              placeholder="Ej: AMD Ryzen 5 5600X, Intel Core i5-12400, Apple M4"
              spellCheck={false}
              className="w-full rounded-none border border-border bg-white/[0.03] px-4 py-3 text-sm text-text outline-none transition-colors focus:border-primary/60"
            />
            <span className="mt-2 block text-xs text-text-faint">
              {hints.os.platform === 'darwin'
                ? 'En Mac es el chip de tu equipo (Apple M1, M2, M3, M4...). Lo ves en  > Acerca de este Mac.'
                : 'En Windows: Configuracion > Sistema > Acerca de, campo "Procesador".'}
            </span>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-muted">
              Nucleos CPU
            </span>
            <input
              type="number"
              min={1}
              max={256}
              step={1}
              value={cpuCores}
              onChange={(event) => handleCpuCoresChange(event.target.value)}
              placeholder="Ej: 10"
              className="w-full rounded-none border border-border bg-white/[0.03] px-4 py-3 text-sm text-text outline-none transition-colors focus:border-primary/60"
            />
            <span className="mt-2 block text-xs text-text-faint">
              Confirma el total real; el navegador puede mostrar menos.
            </span>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-muted">
              RAM (GB)
            </span>
            <select
              value={ramGb}
              onChange={(event) => handleRamChange(event.target.value)}
              className="w-full rounded-none border border-border bg-background px-4 py-3 text-sm text-text outline-none transition-colors focus:border-primary/60"
            >
              <option value="">elige...</option>
              {ramOptions(ramGb).map((gb) => (
                <option key={gb} value={gb}>
                  {gb} GB
                </option>
              ))}
            </select>
            {hints.ramGbHint && (
              <span className="mt-2 block text-xs text-text-faint">
                El navegador reporta hasta {hints.ramGbHint} GB; confirma el valor real.
              </span>
            )}
          </label>
        </div>
      </div>
    </Section>
  );
}
