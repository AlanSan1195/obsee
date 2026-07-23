import { useMemo, useState } from 'react';
import type { ParsedHardware } from '../../shared/goalParser';
import { detectHardwareHints } from '../lib/system-info';
import { IconCheck, IconCpu, IconMemory } from './ui';

interface HardwareConfirmationProps {
  initial: ParsedHardware;
  onConfirm: (hardware: Required<ParsedHardware>) => void;
}

export function HardwareConfirmation({ initial, onConfirm }: HardwareConfirmationProps) {
  const hints = useMemo(() => detectHardwareHints(), []);
  const [cpuModel, setCpuModel] = useState(initial.cpuModel ?? hints.cpuModelHint ?? '');
  const [cpuCores, setCpuCores] = useState(String(initial.cpuCores ?? hints.logicalProcessors ?? ''));
  const [ramGb, setRamGb] = useState(String(initial.ramGb ?? ''));
  const cores = Number(cpuCores);
  const ram = Number(ramGb);
  const valid = cpuModel.trim().length > 1
    && Number.isInteger(cores)
    && cores > 0
    && Number.isFinite(ram)
    && ram > 0;

  return (
    <section className="conversation-card conversation-card--hardware" aria-labelledby="hardware-title">
      <div className="conversation-card__eyebrow">
        <IconCpu className="h-4 w-4" />
        Falta una comprobación
      </div>
      <h2 id="hardware-title">Confirma el equipo que ejecuta OBS</h2>
      <p>
        El navegador detectó <strong>{hints.gpu.model}</strong>, pero CPU y memoria
        necesitan confirmación para evitar una recomendación demasiado agresiva.
      </p>
      <div className="hardware-fields">
        <label>
          <span>Procesador o chip</span>
          <input
            value={cpuModel}
            onChange={(event) => setCpuModel(event.target.value)}
            placeholder="Apple M4, Ryzen 7 7800X…"
          />
        </label>
        <label>
          <span>Núcleos</span>
          <input
            type="number"
            min={1}
            max={256}
            value={cpuCores}
            onChange={(event) => setCpuCores(event.target.value)}
          />
        </label>
        <label>
          <span className="inline-flex items-center gap-1.5">
            <IconMemory className="h-3.5 w-3.5" />
            RAM
          </span>
          <div className="hardware-fields__suffix">
            <input
              type="number"
              min={1}
              max={2048}
              value={ramGb}
              onChange={(event) => setRamGb(event.target.value)}
            />
            <span>GB</span>
          </div>
        </label>
      </div>
      <button
        type="button"
        disabled={!valid}
        onClick={() => onConfirm({
          cpuModel: cpuModel.trim(),
          cpuCores: cores,
          ramGb: ram,
        })}
        className="calm-button calm-button--primary"
      >
        <IconCheck className="h-4 w-4" />
        Confirmar y analizar
      </button>
    </section>
  );
}
