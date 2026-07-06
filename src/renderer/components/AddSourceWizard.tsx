import React, { useState } from 'react';
import { useAppStore } from '../store';
import { useAppAPI } from '../hooks/useAppAPI';
import type { DeviceOption, ResolvedSourceKind, SourceKindFriendly } from '../../shared/types';
import { IconClapperboard, IconMonitor, IconTv, IconVideo, Spinner } from './ui';
import { SourcePreview } from './SourcePreview';

type AddSourceWizardProps = {
  sceneName: string;
  onClose: () => void;
  onCreated: () => void;
};

type WizardStep = 'choose-what' | 'image-path' | 'choose-device' | 'camera-layout' | 'confirm';

type FriendlyCard = {
  friendly: SourceKindFriendly;
  title: string;
  help: string;
  icon: React.ReactNode;
};

const CARDS: FriendlyCard[] = [
  { friendly: 'camera', title: 'Camara web', help: 'Tu webcam o camara USB', icon: <IconVideo className="h-6 w-6" /> },
  { friendly: 'display', title: 'Pantalla completa', help: 'Captura todo un monitor', icon: <IconMonitor className="h-6 w-6" /> },
  { friendly: 'window', title: 'Ventana', help: 'Una aplicacion abierta', icon: <IconTv className="h-6 w-6" /> },
  { friendly: 'game_console', title: 'Consola (PS5/Xbox/Switch)', help: 'Necesitas una tarjeta de captura conectada', icon: <IconClapperboard className="h-6 w-6" /> },
  { friendly: 'image', title: 'Imagen / Logo', help: 'Un PNG o JPG desde tu equipo', icon: <IconVideo className="h-6 w-6" /> },
];

const primaryButton =
  'inline-flex items-center justify-center gap-1.5 rounded-none bg-primary px-4 py-2.5 text-sm font-bold lowercase tracking-terminal text-background glow-primary transition-all hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton =
  'inline-flex items-center justify-center gap-1.5 rounded-none border border-border px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:border-primary/40 hover:bg-white/[0.04]';

export function AddSourceWizard({ sceneName, onClose, onCreated }: AddSourceWizardProps) {
  const availableSourceKinds = useAppStore((state) => state.availableSourceKinds);
  const {
    beginGuidedSource,
    applyGuidedSourceDevice,
    cancelGuidedSource,
    setCameraLayout,
    createCameraScene,
    refreshScenes,
    createGuidedSource,
    renameSource,
  } = useAppAPI();

  const [step, setStep] = useState<WizardStep>('choose-what');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [friendly, setFriendly] = useState<SourceKindFriendly | null>(null);
  const [inputName, setInputName] = useState('');
  const [sceneItemId, setSceneItemId] = useState<number | null>(null);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [propertyName, setPropertyName] = useState<string | undefined>(undefined);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [imagePath, setImagePath] = useState('');

  const kindByFriendly = (value: SourceKindFriendly): ResolvedSourceKind | undefined =>
    availableSourceKinds?.find((kind) => kind.friendly === value);

  // Limpia el input recien creado en OBS si el asistente se cierra sin terminar.
  const closeWithCleanup = async () => {
    if (inputName) {
      await cancelGuidedSource(inputName).catch(() => undefined);
    }
    onClose();
  };

  const handleChooseFriendly = async (value: SourceKindFriendly) => {
    setLocalError('');

    if (value === 'image') {
      // El navegador no expone rutas absolutas de archivos: se pide la ruta a mano
      // porque OBS necesita la ubicacion real de la imagen en el disco.
      setFriendly('image');
      setStep('image-path');
      return;
    }

    setBusy(true);
    setFriendly(value);
    try {
      const result = await beginGuidedSource({ sceneName, friendly: value });
      if (!result.success || !result.inputName || result.sceneItemId === undefined) {
        setLocalError(result.message);
        setFriendly(null);
        return;
      }
      setInputName(result.inputName);
      setSceneItemId(result.sceneItemId);
      setDevices(result.devices ?? []);
      setPropertyName(result.propertyName);
      setNameDraft(result.inputName);
      if (result.supportsDeviceEnum && (result.devices?.length ?? 0) > 0) {
        setSelectedDeviceId(result.devices?.[0]?.id ?? '');
        setStep('choose-device');
      } else {
        setStep('confirm');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCreateImage = async () => {
    const trimmedPath = imagePath.trim();
    if (!trimmedPath) {
      setLocalError('Escribe la ruta de la imagen.');
      return;
    }
    setBusy(true);
    setLocalError('');
    try {
      const sourceName = trimmedPath.split(/[\\/]/).pop() || 'Imagen';
      const result = await createGuidedSource({
        sceneName,
        friendly: 'image',
        sourceName,
        imagePath: trimmedPath,
        fitToCanvas: true,
      });
      if (result.success) {
        onCreated();
        onClose();
      } else {
        setLocalError(result.message);
      }
    } finally {
      setBusy(false);
    }
  };

  // Tras elegir el dispositivo, la camara ofrece elegir formato (facecam 1:1 o
  // pantalla completa); el resto va directo a confirmar.
  const stepAfterDevice = (): WizardStep => (friendly === 'camera' ? 'camera-layout' : 'confirm');

  const handleApplyDevice = async () => {
    if (!selectedDeviceId || !propertyName || sceneItemId === null) {
      setStep(stepAfterDevice());
      return;
    }
    setBusy(true);
    setLocalError('');
    try {
      const result = await applyGuidedSourceDevice({
        inputName,
        sceneName,
        sceneItemId,
        propertyName,
        deviceId: selectedDeviceId,
      });
      if (result.success) {
        setStep(stepAfterDevice());
      } else {
        setLocalError(result.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleChooseLayout = async (layout: 'facecam' | 'fullscreen') => {
    if (sceneItemId === null) {
      setStep('confirm');
      return;
    }
    setBusy(true);
    setLocalError('');
    try {
      const result = await setCameraLayout(sceneName, sceneItemId, layout);
      if (result.success) {
        setStep('confirm');
      } else {
        setLocalError(result.message);
      }
    } finally {
      setBusy(false);
    }
  };

  // "Ambas": la camara actual queda como facecam "camStream" en la escena actual,
  // y la camara a pantalla completa se separa en su propia escena "fullCam".
  const handleChooseBoth = async () => {
    if (sceneItemId === null) {
      setStep('confirm');
      return;
    }
    setBusy(true);
    setLocalError('');
    try {
      // 1) Fuente actual -> facecam + nombre camStream (se queda en esta escena).
      await setCameraLayout(sceneName, sceneItemId, 'facecam');
      await renameSource(inputName, 'camStream');

      // 2) Escena nueva "fullCam" con la misma camara a pantalla completa.
      const prop = propertyName;
      if (prop && selectedDeviceId) {
        const sceneResult = await createCameraScene('fullCam', 'fullCam', selectedDeviceId, prop);
        if (!sceneResult.success) {
          setLocalError(sceneResult.message);
        } else {
          await refreshScenes();
        }
      } else {
        setLocalError('No se pudo identificar la camara para crear la escena fullCam.');
      }

      onCreated();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleBackToChoose = async () => {
    if (inputName) {
      await cancelGuidedSource(inputName).catch(() => undefined);
    }
    setInputName('');
    setSceneItemId(null);
    setDevices([]);
    setFriendly(null);
    setStep('choose-what');
  };

  const handleFinish = async () => {
    setBusy(true);
    try {
      const trimmed = nameDraft.trim();
      if (trimmed && trimmed !== inputName) {
        await renameSource(inputName, trimmed);
      }
      onCreated();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const isConsole = friendly === 'game_console';

  return (
    <div className="border border-border bg-background/40 text-text">
      <div className="space-y-5 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-text">
            {step === 'choose-what' && 'Que quieres mostrar?'}
            {step === 'image-path' && 'Donde esta la imagen?'}
            {step === 'choose-device' && (isConsole ? 'Elige tu tarjeta de captura' : 'Elige cual')}
            {step === 'camera-layout' && 'Como quieres usar la camara?'}
            {step === 'confirm' && 'Listo para agregar'}
          </h2>
          <span className="text-[0.7rem] lowercase tracking-terminal text-text-faint">en {sceneName}</span>
        </div>

        {localError && (
          <p className="border border-red-500/40 bg-black p-3 text-sm text-red-300">{localError}</p>
        )}

        {step === 'choose-what' && (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {CARDS.map((card) => {
              const resolved = kindByFriendly(card.friendly);
              const unavailable = card.friendly !== 'image' && availableSourceKinds !== null && resolved?.available === false;
              return (
                <button
                  key={card.friendly}
                  type="button"
                  disabled={busy || unavailable}
                  onClick={() => handleChooseFriendly(card.friendly)}
                  title={unavailable ? 'Tu instalacion de OBS no incluye esta captura en este sistema' : undefined}
                  className="flex items-start gap-3 border border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="mt-0.5 shrink-0 text-primary">{card.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-text">{card.title}</span>
                    <span className="block text-xs text-text-muted">{unavailable ? 'No disponible en este OBS' : card.help}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {step === 'image-path' && (
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs lowercase tracking-terminal text-text-faint">ruta del archivo de imagen</span>
              <input
                type="text"
                value={imagePath}
                onChange={(event) => setImagePath(event.target.value)}
                placeholder="C:\Users\tu-usuario\Pictures\logo.png"
                spellCheck={false}
                className="w-full rounded-none border border-border bg-background px-3 py-2.5 text-sm text-text focus:border-primary focus:outline-none"
              />
            </label>
            <p className="text-xs text-text-muted">
              Escribe la ruta completa de la imagen en la computadora donde corre OBS. Tip: en el explorador de archivos, clic derecho sobre la imagen y copia su ruta.
            </p>
            <div className="flex justify-between gap-3 pt-1">
              <button type="button" className={secondaryButton} onClick={handleBackToChoose} disabled={busy}>
                Atras
              </button>
              <button type="button" className={primaryButton} onClick={handleCreateImage} disabled={busy || imagePath.trim().length === 0}>
                {busy ? <Spinner className="h-4 w-4" /> : 'Agregar'}
              </button>
            </div>
          </div>
        )}

        {step === 'choose-device' && (
          <div className="space-y-3">
            {devices.length === 0 ? (
              <p className="text-sm text-text-muted">
                No se detectaron dispositivos. Verifica que esten conectados y que OBS tenga permisos del sistema.
              </p>
            ) : (
              <label className="block space-y-1.5">
                <span className="text-xs lowercase tracking-terminal text-text-faint">
                  {isConsole ? 'tarjeta de captura' : 'dispositivo'}
                </span>
                <select
                  value={selectedDeviceId}
                  onChange={(event) => setSelectedDeviceId(event.target.value)}
                  className="w-full rounded-none border border-border bg-background px-3 py-2.5 text-sm text-text focus:border-primary focus:outline-none"
                >
                  {devices.map((device, index) => (
                    <option key={`${device.id}-${index}`} value={device.id}>
                      {device.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex justify-between gap-3 pt-1">
              <button type="button" className={secondaryButton} onClick={handleBackToChoose} disabled={busy}>
                Atras
              </button>
              <button type="button" className={primaryButton} onClick={handleApplyDevice} disabled={busy || devices.length === 0}>
                {busy ? <Spinner className="h-4 w-4" /> : 'Continuar'}
              </button>
            </div>
          </div>
        )}

        {step === 'camera-layout' && (
          <div className="space-y-3">
            <p className="text-sm text-text-muted">Elige como se vera tu camara en la escena. Cada opcion queda como una fuente mas que puedes mover o quitar despues.</p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => handleChooseLayout('facecam')}
                className="flex flex-col items-start gap-2 border border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex h-16 w-full items-end justify-end">
                  <span className="h-10 w-10 border border-primary/70 bg-primary/10" aria-hidden="true" />
                </span>
                <span className="block text-sm font-semibold text-text">Facecam 1:1</span>
                <span className="block text-xs text-text-muted">Cuadrado pequeno en la esquina, ideal para streamear</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleChooseLayout('fullscreen')}
                className="flex flex-col items-start gap-2 border border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex h-16 w-full items-center justify-center">
                  <span className="h-12 w-full border border-primary/70 bg-primary/10" aria-hidden="true" />
                </span>
                <span className="block text-sm font-semibold text-text">Pantalla completa</span>
                <span className="block text-xs text-text-muted">La camara abarca todo el lienzo</span>
              </button>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={handleChooseBoth}
              className="flex w-full items-center gap-3 border border-primary/40 bg-primary/[0.04] p-3 text-left transition-colors hover:border-primary/60 hover:bg-primary/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex shrink-0 items-end gap-1" aria-hidden="true">
                <span className="h-8 w-12 border border-primary/70 bg-primary/10" />
                <span className="h-5 w-5 border border-primary/70 bg-primary/10" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-text">Ambas</span>
                <span className="block text-xs text-text-muted">
                  Un facecam <span className="text-text">camStream</span> en esta escena y una escena aparte <span className="text-text">fullCam</span> con la camara a pantalla completa
                </span>
              </span>
            </button>
            {busy && (
              <div className="flex justify-center pt-1">
                <Spinner className="h-4 w-4" />
              </div>
            )}
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-3">
            <SourcePreview sourceName={inputName} />
            <label className="block space-y-1.5">
              <span className="text-xs lowercase tracking-terminal text-text-faint">nombre de la fuente</span>
              <input
                type="text"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                className="w-full rounded-none border border-border bg-background px-3 py-2.5 text-sm text-text focus:border-primary focus:outline-none"
              />
            </label>
            <div className="flex justify-between gap-3 pt-1">
              <button type="button" className={secondaryButton} onClick={closeWithCleanup} disabled={busy}>
                Cancelar
              </button>
              <button type="button" className={primaryButton} onClick={handleFinish} disabled={busy}>
                {busy ? <Spinner className="h-4 w-4" /> : 'Listo'}
              </button>
            </div>
          </div>
        )}

        {step === 'choose-what' && (
          <div className="flex justify-end">
            <button type="button" className={secondaryButton} onClick={closeWithCleanup} disabled={busy}>
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
