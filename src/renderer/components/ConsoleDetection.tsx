import React, { useEffect } from 'react';
import { useAppStore } from '../store';
import { useAppAPI } from '../hooks/useAppAPI';
import { IconActivity, IconMonitor, IconRefresh, Section, Spinner } from './ui';

const secondaryButtonClasses =
  'inline-flex items-center gap-1.5 rounded-none border border-border px-3 py-2 text-xs font-semibold text-text transition-colors hover:border-primary/40 hover:bg-white/[0.04]';

const inputClasses =
  'w-full rounded-none border border-border bg-white/[0.03] px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-primary/60';

export function ConsoleDetection() {
  const {
    peripherals,
    selectedCaptureCard,
    selectedMonitor,
    obsConnected,
    captureCapabilities,
    setSelectedCaptureCard,
    setSelectedMonitor,
  } = useAppStore();
  const { getPeripherals, getCaptureCapabilities } = useAppAPI();
  const [readingCaps, setReadingCaps] = React.useState(false);

  const handleReadCaps = async () => {
    setReadingCaps(true);
    try {
      await getCaptureCapabilities(selectedCaptureCard || undefined);
    } finally {
      setReadingCaps(false);
    }
  };

  useEffect(() => {
    if (!peripherals) {
      void getPeripherals();
    }
  }, []);

  // Auto-elige el mejor candidato cuando se detectan, sin pisar lo que el usuario escriba.
  useEffect(() => {
    if (!peripherals) return;
    if (!selectedCaptureCard && peripherals.captureDevices[0]) {
      setSelectedCaptureCard(peripherals.captureDevices[0].name);
    }
    if (!selectedMonitor && peripherals.displays.length > 0) {
      const main = peripherals.displays.find((display) => display.main) ?? peripherals.displays[0];
      setSelectedMonitor(main.model);
    }
  }, [peripherals]);

  const captureOptions = peripherals?.captureDevices ?? [];
  const displayOptions = peripherals?.displays ?? [];

  return (
    <Section
      title="deteccion"
      icon={<IconMonitor className="h-4 w-4" />}
      subtitle="Detectamos tu capturadora y monitor. Corrige o escribe el modelo si algo no coincide (ej. una TV conectada a la consola)."
      action={
        <button type="button" onClick={() => void getPeripherals()} className={secondaryButtonClasses}>
          <IconRefresh className="h-3.5 w-3.5" />
          Re-detectar
        </button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-muted">Capturadora</span>
          {captureOptions.length > 0 && (
            <select
              value={captureOptions.some((device) => device.name === selectedCaptureCard) ? selectedCaptureCard : ''}
              onChange={(event) => setSelectedCaptureCard(event.target.value)}
              className={`app-select mb-2 ${inputClasses}`}
            >
              <option value="" className="bg-background text-text">(escribir manualmente)</option>
              {captureOptions.map((device) => (
                <option key={device.name} value={device.name} className="bg-background text-text">
                  {device.name}{device.vendor ? ` · ${device.vendor}` : ''}
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            value={selectedCaptureCard}
            onChange={(event) => setSelectedCaptureCard(event.target.value)}
            placeholder="Ej. Elgato HD60 X"
            spellCheck={false}
            className={inputClasses}
          />
          {captureOptions.length === 0 && (
            <span className="mt-2 block text-xs text-text-faint">No se detecto una capturadora por USB; escribe el modelo.</span>
          )}
          <div className="mt-2">
            {obsConnected ? (
              <button
                type="button"
                onClick={handleReadCaps}
                disabled={readingCaps}
                className={`${secondaryButtonClasses} ${readingCaps ? 'cursor-not-allowed opacity-60 ' : ' ai-glint'}`}
              >
                {readingCaps ? <Spinner className="h-3.5 w-3.5 border-text/60 border-t-transparent" /> : <IconActivity className="h-3.5 w-3.5" />}
                {readingCaps ? 'Leyendo...' : 'Leer capacidad real (OBS)'}
              </button>
            ) : (
              <span className="block text-xs text-text-faint">Conecta OBS para leer la capacidad real de captura (en vez de adivinar por el nombre).</span>
            )}
            {captureCapabilities?.maxResolution && (
              <p className="mt-2 text-xs text-primary">
                Capacidad real: hasta {captureCapabilities.maxResolution}
                {captureCapabilities.maxFps ? ` a ${captureCapabilities.maxFps}fps` : ''}
                {captureCapabilities.deviceName ? ` · ${captureCapabilities.deviceName}` : ''}
              </p>
            )}
          </div>
        </div>

        <div>
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-muted">Monitor / TV</span>
          {displayOptions.length > 0 && (
            <select
              value={displayOptions.some((display) => display.model === selectedMonitor) ? selectedMonitor : ''}
              onChange={(event) => setSelectedMonitor(event.target.value)}
              className={`app-select mb-2 ${inputClasses}`}
            >
              <option value="" className="bg-background text-text">(escribir manualmente)</option>
              {displayOptions.map((display) => (
                <option key={`${display.model}-${display.width}x${display.height}`} value={display.model} className="bg-background text-text">
                  {display.model} · {display.width}x{display.height}@{display.refreshRate}Hz{display.main ? ' (principal)' : ''}
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            value={selectedMonitor}
            onChange={(event) => setSelectedMonitor(event.target.value)}
            placeholder="Ej. LG 27GP850"
            spellCheck={false}
            className={inputClasses}
          />
        </div>
      </div>
    </Section>
  );
}
