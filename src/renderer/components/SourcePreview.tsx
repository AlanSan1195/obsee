import React, { useEffect, useRef, useState } from 'react';
import { useElectronAPI } from '../hooks/useElectronAPI';

type SourcePreviewProps = {
  sourceName: string;
  intervalMs?: number;
};

// Vista previa de baja frecuencia: consulta una captura de OBS (~1 fps) para que
// el usuario confirme "asi se ve" sin abrir OBS. Si OBS no puede capturar (kind
// sin soporte, permisos), se oculta de forma silenciosa.
export function SourcePreview({ sourceName, intervalMs = 1200 }: SourcePreviewProps) {
  const { getSourceScreenshot } = useElectronAPI();
  const [imageData, setImageData] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // useElectronAPI devuelve funciones nuevas en cada render, asi que la guardamos
  // en un ref para que el efecto de polling solo dependa de sourceName (si no, el
  // efecto se reiniciaria en cada render y el preview parpadearia sin mostrarse).
  const screenshotRef = useRef(getSourceScreenshot);
  screenshotRef.current = getSourceScreenshot;

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    let gotImage = false;
    setImageData(null);
    setFailed(false);

    const tick = async () => {
      if (!active) return;
      try {
        const result = await screenshotRef.current(sourceName, 480);
        if (!active) return;
        if (result.success && result.imageData) {
          setImageData(result.imageData);
          setFailed(false);
          gotImage = true;
          failures = 0;
        } else {
          failures += 1;
        }
      } catch {
        failures += 1;
      } finally {
        // Ocultar tras varios fallos sin lograr una sola captura (kind sin soporte / permisos).
        if (active && failures >= 4 && !gotImage) {
          setFailed(true);
        }
        if (active) {
          timer = setTimeout(tick, intervalMs);
        }
      }
    };

    tick();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [sourceName, intervalMs]);

  if (failed) return null;

  return (
    <div className="flex aspect-video w-full items-center justify-center overflow-hidden border border-border bg-black">
      {imageData ? (
        <img src={imageData} alt={`Vista previa de ${sourceName}`} className="h-full w-full object-contain" />
      ) : (
        <span className="text-xs lowercase tracking-terminal text-text-faint">cargando vista previa…</span>
      )}
    </div>
  );
}
