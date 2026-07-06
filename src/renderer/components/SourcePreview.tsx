import React, { useEffect, useRef, useState } from 'react';
import { useAppAPI } from '../hooks/useAppAPI';

type SourcePreviewProps = {
  sourceName: string | null;
  intervalMs?: number;
  // Modo persistente: nunca se oculta; sin captura muestra el lienzo negro con leyenda.
  persistent?: boolean;
};

// Vista previa de baja frecuencia: consulta una captura de OBS (~1 fps) para que
// el usuario confirme "asi se ve" sin abrir OBS. Funciona con fuentes y con
// escenas completas. Si OBS no puede capturar (kind sin soporte, permisos), se
// oculta de forma silenciosa — salvo en modo persistente.
export function SourcePreview({ sourceName, intervalMs = 1200, persistent = false }: SourcePreviewProps) {
  const { getSourceScreenshot } = useAppAPI();
  const [imageData, setImageData] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // useAppAPI devuelve funciones nuevas en cada render, asi que la guardamos
  // en un ref para que el efecto de polling solo dependa de sourceName (si no, el
  // efecto se reiniciaria en cada render y el preview parpadearia sin mostrarse).
  const screenshotRef = useRef(getSourceScreenshot);
  screenshotRef.current = getSourceScreenshot;

  useEffect(() => {
    setImageData(null);
    setFailed(false);
    if (!sourceName) return undefined;

    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    let gotImage = false;

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

  if (failed && !persistent) return null;

  const showImage = Boolean(imageData && sourceName && !failed);
  const waiting = Boolean(sourceName && !imageData && !failed);

  return (
    <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden border border-border bg-black">
      {showImage ? (
        <>
          <img src={imageData!} alt={`Vista previa de ${sourceName}`} className="h-full w-full object-contain" />
          {persistent && (
            <span className="absolute left-2 top-2 flex items-center gap-1.5 border border-border bg-black/70 px-2 py-0.5 text-[0.65rem] lowercase tracking-terminal text-text-muted">
              <span className="inline-block h-1.5 w-1.5 animate-pulse-dot bg-primary" aria-hidden="true" />
              {sourceName}
            </span>
          )}
        </>
      ) : (
        <span className="px-4 text-center text-xs lowercase tracking-terminal text-text-faint">
          {persistent && !waiting ? 'asi se vera tu stream' : 'cargando vista previa…'}
        </span>
      )}
    </div>
  );
}
