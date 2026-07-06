import React, { useEffect, useMemo, useState } from 'react';
import { detectHardwareHints, loadHardwareOverrides, saveHardwareOverrides } from '../lib/system-info';
import { Section } from './ui';

// Capacidades que existen de fabrica (PC y Apple Silicon)
const RAM_SIZES = [4, 8, 12, 16, 18, 24, 32, 36, 48, 64, 96, 128];

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
  const [ramGb, setRamGb] = useState(String(initial.ramGb ?? hints.ramGbHint ?? ''));

  useEffect(() => {
    const ram = Number(ramGb);
    saveHardwareOverrides({
      cpuModel: cpuModel.trim() || undefined,
      ramGb: Number.isFinite(ram) && ram > 0 ? ram : undefined,
    });
  }, [cpuModel, ramGb]);

  return (
    <Section
      title="hardware.setup"
      icon={<span className="text-xs">[hw]</span>}
      subtitle="El navegador detecta tu GPU automaticamente. Completa el CPU y la RAM para que la recomendacion sea precisa."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border border-border bg-white/[0.03] px-4 py-3 text-xs lowercase tracking-terminal">
          <span className="flex items-center gap-1.5">
            <span className="text-text-faint">gpu</span>
            <span className="text-primary">{hints.gpu.model}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-text-faint">vendor</span>
            <span className="text-text">{hints.gpu.vendor.toLowerCase()}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-text-faint">hilos cpu</span>
            <span className="text-text">{hints.cores}</span>
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-muted">
              Modelo de CPU
            </span>
            <input
              type="text"
              value={cpuModel}
              onChange={(event) => setCpuModel(event.target.value)}
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
              RAM (GB)
            </span>
            <select
              value={ramGb}
              onChange={(event) => setRamGb(event.target.value)}
              className="w-full rounded-none border border-border bg-background px-4 py-3 text-sm text-text outline-none transition-colors focus:border-primary/60"
            >
              <option value="">elige...</option>
              {ramOptions(ramGb).map((gb) => (
                <option key={gb} value={gb}>
                  {gb} GB
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </Section>
  );
}
