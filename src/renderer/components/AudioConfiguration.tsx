import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { useElectronAPI } from '../hooks/useElectronAPI';
import type { OBSAudioConfig, OBSAudioDevice } from '../../shared/types';
import { ConfirmDialog } from './ConfirmDialog';
import { IconAlert, IconMic, IconRefresh, Section, Spinner } from './ui';

const defaultFilters = {
  gainDb: 10,
  compressorRatio: 4,
  compressorThresholdDb: -10,
  limiterThresholdDb: -1,
  noiseSuppression: true,
};

const secondaryButtonClasses =
  'inline-flex items-center gap-1.5 rounded-none border border-border px-3 py-2 text-xs font-semibold text-text transition-colors hover:border-primary/40 hover:bg-white/[0.04]';

function getSelectedDevice(devices: OBSAudioDevice[], selectedDeviceId?: string): OBSAudioDevice | undefined {
  return devices.find((device) => device.id === selectedDeviceId);
}

function getDefaultDeviceId(devices: OBSAudioDevice[], currentDeviceId?: string): string {
  const recommended = devices.find((device) => device.isRecommended);
  return recommended?.id ?? currentDeviceId ?? devices[0]?.id ?? '';
}

export function createDefaultAudioConfig(inputName: string, device?: OBSAudioDevice): OBSAudioConfig {
  return {
    inputName,
    deviceId: device?.id,
    deviceName: device?.name,
    mono: true,
    filters: defaultFilters,
  };
}

export function AudioConfiguration() {
  const {
    obsConnected,
    obsAudioSnapshot,
    obsSettingsSnapshot,
    isApplying,
    setError,
    setObsMessage,
  } = useAppStore();
  const { refreshAudioSnapshot, applyAudioConfig } = useElectronAPI();
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [localDeviceStatus, setLocalDeviceStatus] = useState('Permiso de microfono local no solicitado');
  const [detectionMessage, setDetectionMessage] = useState('');
  const [autoDetectTried, setAutoDetectTried] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [monitorType, setMonitorType] = useState<OBSAudioConfig['monitorType']>('OBS_MONITORING_TYPE_NONE');
  const [syncOffsetMs, setSyncOffsetMs] = useState(0);
  const [duckingEnabled, setDuckingEnabled] = useState(false);
  const [selectedDuckingTarget, setSelectedDuckingTarget] = useState('');

  useEffect(() => {
    if (obsAudioSnapshot) {
      setSelectedDeviceId(getDefaultDeviceId(obsAudioSnapshot.devices, obsAudioSnapshot.selectedDeviceId));
      setMonitorType(obsAudioSnapshot.monitorType as OBSAudioConfig['monitorType']);
      setSyncOffsetMs(obsAudioSnapshot.syncOffsetMs);
      const defaultDuckingTarget = obsAudioSnapshot.duckingTargets.find((target) => target.duckingConfigured)
        ?? obsAudioSnapshot.duckingTargets[0];
      setSelectedDuckingTarget(defaultDuckingTarget?.inputName ?? '');
      setDuckingEnabled(Boolean(defaultDuckingTarget?.duckingConfigured));
      setDetectionMessage('');
    }
  }, [obsAudioSnapshot]);

  useEffect(() => {
    if (!obsConnected || obsAudioSnapshot || autoDetectTried) return;

    setAutoDetectTried(true);
    refreshAudioSnapshot().then((result) => {
      if (!result.success) {
        setDetectionMessage(result.message);
      }
    }).catch(() => {
      setDetectionMessage('OBSREC no pudo leer las entradas de audio desde OBS.');
    });
  }, [autoDetectTried, obsConnected, obsAudioSnapshot, refreshAudioSnapshot]);

  const selectedDevice = useMemo(() => {
    if (!obsAudioSnapshot) return undefined;
    return getSelectedDevice(obsAudioSnapshot.devices, selectedDeviceId);
  }, [obsAudioSnapshot, selectedDeviceId]);

  const handleRefresh = async () => {
    setError(null);
    setDetectionMessage('');
    const result = await refreshAudioSnapshot();
    if (!result.success) {
      setDetectionMessage(result.message);
      setError(result.message);
    }
  };

  const handleLocalDeviceScan = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setLocalDeviceStatus('La deteccion local de microfono no esta disponible en este entorno');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((device) => device.kind === 'audioinput');
      setLocalDeviceStatus(`${audioInputs.length} microfono${audioInputs.length === 1 ? '' : 's'} local${audioInputs.length === 1 ? '' : 'es'} visible${audioInputs.length === 1 ? '' : 's'} para OBSREC`);
    } catch {
      setLocalDeviceStatus('Se nego el permiso del microfono local; los datos de OBS siguen disponibles');
    }
  };

  const handleApply = async () => {
    if (!obsAudioSnapshot) return;

    const config: OBSAudioConfig = {
      ...createDefaultAudioConfig(obsAudioSnapshot.inputName, selectedDevice),
      filters: {
        ...defaultFilters,
        noiseSuppression,
      },
      monitorType,
      syncOffsetMs,
      ducking: selectedDuckingTarget
        ? {
          enabled: duckingEnabled,
          desktopInputName: selectedDuckingTarget,
        }
        : undefined,
    };

    setError(null);
    const result = await applyAudioConfig(config);
    if (result.success) {
      setObsMessage(result.message);
    } else {
      setError(result.message);
    }
  };

  if (!obsAudioSnapshot) {
    return (
      <Section
        title="audio.voice"
        icon={<IconMic className="h-4 w-4" />}
        action={
          <button type="button" onClick={handleRefresh} className={secondaryButtonClasses}>
            <IconRefresh className="h-3.5 w-3.5" />
            Detectar audio
          </button>
        }
      >
        <div className="rounded-none border border-border bg-white/[0.02] p-4">
          <p className="text-sm text-text">
            {obsConnected
              ? 'OBSREC esta buscando un dispositivo Mic/Aux o una fuente Audio Input Capture para aplicar la configuracion de voz.'
              : 'Conecta OBS para detectar tu microfono y aplicar la configuracion de voz de OBSREC.'}
          </p>
          {detectionMessage && (
            <p className="mt-3 text-sm text-amber-300">{detectionMessage}</p>
          )}
        </div>
      </Section>
    );
  }

  const filtersReady = obsAudioSnapshot.obsrecFiltersConfigured;
  const monoSupported = obsAudioSnapshot.monoSupported;
  const fps = obsSettingsSnapshot?.fps ?? 60;
  const syncFrames = [1, 2, 3, 4, 5, 6];
  const selectedDuckingTargetInfo = obsAudioSnapshot.duckingTargets.find((target) => target.inputName === selectedDuckingTarget);
  const stageTwoActions = [
    noiseSuppression ? 'Supresion de ruido RNNoise' : 'Sin supresion de ruido OBSREC',
    monitorType === 'OBS_MONITORING_TYPE_NONE' ? 'Sin monitoreo de microfono' : monitorType === 'OBS_MONITORING_TYPE_MONITOR_ONLY' ? 'Solo monitoreo' : 'Monitorizar y emitir',
    `Sync de audio: ${syncOffsetMs} ms`,
    duckingEnabled && selectedDuckingTarget ? `Ducking sobre ${selectedDuckingTarget}` : 'Ducking desactivado',
  ];

  return (
    <Section
      title="audio.voice"
      icon={<IconMic className="h-4 w-4" />}
      subtitle="Objetivo: que tu voz se escuche clara, fuerte y sin ruido de fondo al grabar o transmitir."
      action={
        <>
          <button type="button" onClick={handleLocalDeviceScan} className={secondaryButtonClasses}>
            <IconMic className="h-3.5 w-3.5" />
            Buscar micro local
          </button>
          <button type="button" onClick={handleRefresh} className={secondaryButtonClasses}>
            <IconRefresh className="h-3.5 w-3.5" />
            Actualizar OBS
          </button>
        </>
      }
    >
      <div className="mb-4 grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <label className="block rounded-none border border-border bg-white/[0.02] p-4 transition-colors focus-within:border-primary/50">
          <span className="mb-2 block text-xs uppercase tracking-wider text-text-muted">Microfono recomendado</span>
          <select
            value={selectedDeviceId}
            onChange={(event) => setSelectedDeviceId(event.target.value)}
            className="app-select w-full bg-transparent text-base font-medium text-text outline-none"
          >
            {obsAudioSnapshot.devices.length === 0 ? (
              <option value="" className="bg-background text-text">Dispositivo actual de OBS</option>
            ) : (
              obsAudioSnapshot.devices.map((device) => (
                <option key={`${device.id}-${device.name}`} value={device.id} className="bg-background text-text">
                  {device.isRecommended ? 'Recomendado - ' : ''}{device.name}
                </option>
              ))
            )}
          </select>
          <span className="mt-2 block text-xs text-text-faint">
            {selectedDevice?.reason ?? 'OBS no expuso una lista de dispositivos para esta entrada.'}
          </span>
        </label>

        <div className="rounded-none border border-border bg-white/[0.02] p-4">
          <span className="mb-2 block text-xs uppercase tracking-wider text-text-muted">Filtros</span>
          <span className={filtersReady ? 'text-base font-semibold text-primary' : 'text-base font-semibold text-amber-400'}>
            {filtersReady ? 'Listos' : 'Se aplicaran'}
          </span>
        </div>
      </div>

      <div className="mb-4 grid gap-3 text-sm md:grid-cols-3">
        <div className="rounded-none border border-border bg-white/[0.02] px-4 py-3">
          <span className="block font-semibold text-text">Ganancia +10 dB</span>
          <span className="mt-1 block text-xs leading-relaxed text-text-muted">
            Sube el volumen de tu microfono para que tu voz se escuche fuerte y clara sin tener que acercarte ni gritar.
          </span>
        </div>
        <div className="rounded-none border border-border bg-white/[0.02] px-4 py-3">
          <span className="block font-semibold text-text">Compresor 4:1 a -10 dB</span>
          <span className="mt-1 block text-xs leading-relaxed text-text-muted">
            Empareja tu voz: suaviza los picos cuando hablas fuerte y realza las partes bajas, para un volumen constante y profesional.
          </span>
        </div>
        <div className="rounded-none border border-border bg-white/[0.02] px-4 py-3">
          <span className="block font-semibold text-text">Limitador a -1 dB</span>
          <span className="mt-1 block text-xs leading-relaxed text-text-muted">
            Pone un tope de seguridad: evita que un grito o un golpe de sonido sature y se escuche distorsionado en la grabacion.
          </span>
        </div>
      </div>

      <div className="mb-4 rounded-none border border-border bg-white/[0.02] p-4">
        <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-text-muted">Etapa 2</h4>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-start gap-3 rounded-none border border-border p-3 transition-colors hover:border-border">
            <input
              type="checkbox"
              checked={noiseSuppression}
              onChange={(event) => setNoiseSuppression(event.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-semibold text-text">Supresion de ruido</span>
              <span className="block text-xs text-text-muted">Filtro RNNoise para limpiar estatica y ruido de fondo.</span>
            </span>
          </label>

          <label className="block rounded-none border border-border p-3 transition-colors focus-within:border-primary/50">
            <span className="mb-2 block text-sm font-semibold text-text">Monitoreo</span>
            <select
              value={monitorType}
              onChange={(event) => setMonitorType(event.target.value as OBSAudioConfig['monitorType'])}
              className="app-select w-full bg-transparent text-sm text-text outline-none"
            >
              <option value="OBS_MONITORING_TYPE_NONE" className="bg-background text-text">Sin monitoreo</option>
              <option value="OBS_MONITORING_TYPE_MONITOR_ONLY" className="bg-background text-text">Solo monitoreo</option>
              <option value="OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT" className="bg-background text-text">Monitorizar y emitir</option>
            </select>
            <span className="mt-2 block text-xs text-text-muted">
              Usa audifonos conectados a la salida de monitoreo de OBS para escuchar exactamente lo que se transmite y evitar eco.
            </span>
          </label>

          <div className="rounded-none border border-border p-3 transition-colors focus-within:border-primary/50">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-text">Sincronizacion (lip sync)</span>
              <input
                type="number"
                min={-950}
                max={950}
                step={5}
                value={syncOffsetMs}
                onChange={(event) => setSyncOffsetMs(Number(event.target.value))}
                className="w-full rounded-none border border-border bg-background px-3 py-2 text-sm text-text outline-none transition-colors focus:border-primary"
              />
            </label>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-text-muted">Cuadros</span>
              <select
                value=""
                onChange={(event) => {
                  const frames = Number(event.target.value);
                  if (frames > 0) setSyncOffsetMs(Math.round(frames * 1000 / fps));
                }}
                className="app-select rounded-none border border-border bg-background px-2 py-1 text-xs text-text outline-none"
              >
                <option value="" className="bg-background text-text">Elegir</option>
                {syncFrames.map((frames) => (
                  <option key={frames} value={frames} className="bg-background text-text">{frames}</option>
                ))}
              </select>
            </div>
            <span className="mt-2 block text-xs text-text-muted">
              cuadros de desfase x (1000 / FPS) = ms; ej. 3 cuadros a 60 fps = 50 ms.
            </span>
          </div>

          <div className={`rounded-none border border-border p-3 ${obsAudioSnapshot.duckingTargets.length > 0 ? '' : 'opacity-60'}`}>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={duckingEnabled}
                disabled={obsAudioSnapshot.duckingTargets.length === 0}
                onChange={(event) => setDuckingEnabled(event.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold text-text">Bajar la musica al hablar (ducking)</span>
                <span className="block text-xs text-text-muted">
                  {obsAudioSnapshot.duckingTargets.length > 0
                    ? `Aplica un compresor a ${selectedDuckingTarget || obsAudioSnapshot.duckingTargets[0].inputName} que reduce su volumen cuando el microfono detecta voz.`
                    : 'OBSREC no encontro una fuente de musica o audio de escritorio. Agrega una fuente multimedia, VLC o audio de escritorio y pulsa Actualizar OBS.'}
                </span>
              </span>
            </label>
            {obsAudioSnapshot.duckingTargets.length > 0 && (
              <label className="mt-3 block">
                <span className="mb-2 block text-xs text-text-muted">Fuente para ducking</span>
                <select
                  value={selectedDuckingTarget}
                  onChange={(event) => setSelectedDuckingTarget(event.target.value)}
                  className="app-select w-full bg-transparent text-sm text-text outline-none"
                >
                  {obsAudioSnapshot.duckingTargets.map((target) => (
                    <option key={`${target.inputKind}-${target.inputName}`} value={target.inputName} className="bg-background text-text">
                      {target.inputName}{target.duckingConfigured ? ' (configurado)' : ''}
                    </option>
                  ))}
                </select>
                <span className="mt-2 block text-xs text-text-faint">
                  Tipo OBS: {selectedDuckingTargetInfo?.inputKind ?? 'desconocido'}
                </span>
              </label>
            )}
          </div>
        </div>
      </div>

      {(obsAudioSnapshot.warnings.length > 0 || localDeviceStatus) && (
        <div className="mb-4 flex items-start gap-3 rounded-none border border-amber-500/30 bg-black p-4 text-sm text-amber-200">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p>{[localDeviceStatus, ...obsAudioSnapshot.warnings].filter(Boolean).join(' ')}</p>
            {!monoSupported && (
              <p className="mt-3 text-amber-100">
                Para activar Mono: OBS &gt; Propiedades avanzadas de audio &gt; busca este microfono &gt; marca Mono.
              </p>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={isApplying}
        className={`group flex w-full items-center justify-center gap-3 rounded-none px-6 py-4 text-base font-bold lowercase tracking-terminal transition-all duration-200 ${
          isApplying
            ? 'cursor-not-allowed border border-border bg-white/[0.03] text-text-muted'
            : 'bg-primary text-background shadow-[0_0_26px_-8px_rgba(94,255,159,0.6)] hover:bg-primary-hover hover:shadow-[0_0_32px_-6px_rgba(94,255,159,0.75)] active:scale-[0.99]'
        }`}
      >
        {isApplying ? (
          <>
            <Spinner className="h-5 w-5 border-background/80 border-t-transparent" />
            <span>aplicando audio...</span>
          </>
        ) : (
          <>
            <IconMic className="h-5 w-5" />
            <span><span className="opacity-60">./</span>apply --voice obsrec</span>
          </>
        )}
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title="Confirmar configuracion de audio"
        confirmLabel="Aplicar audio"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void handleApply();
        }}
      >
        <p>Aplicar configuracion de voz OBSREC a "{selectedDevice?.name ?? obsAudioSnapshot.selectedDeviceName ?? obsAudioSnapshot.inputName}"?</p>
        <p>
          {obsAudioSnapshot.monoSupported
            ? 'Se activara Mono para esta entrada.'
            : 'OBS WebSocket no expone Mono para esta entrada, asi que OBSREC lo dejara como paso manual en OBS.'}
        </p>
        <p>OBSREC aplicara ganancia de +10 dB, compresor 4:1 a -10 dB y limitador a -1 dB.</p>
        <ul className="list-disc space-y-1 pl-5">
          {stageTwoActions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
      </ConfirmDialog>
    </Section>
  );
}
