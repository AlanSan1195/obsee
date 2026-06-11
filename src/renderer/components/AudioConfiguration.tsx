import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { useElectronAPI } from '../hooks/useElectronAPI';
import type { OBSAudioConfig, OBSAudioDevice } from '../../shared/types';

const defaultFilters = {
  gainDb: 10,
  compressorRatio: 4,
  compressorThresholdDb: -10,
  limiterThresholdDb: -1,
};

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
    isApplying,
    setError,
    setObsMessage,
  } = useAppStore();
  const { refreshAudioSnapshot, applyAudioConfig } = useElectronAPI();
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [localDeviceStatus, setLocalDeviceStatus] = useState('Permiso de microfono local no solicitado');
  const [detectionMessage, setDetectionMessage] = useState('');
  const [autoDetectTried, setAutoDetectTried] = useState(false);

  useEffect(() => {
    if (obsAudioSnapshot) {
      setSelectedDeviceId(getDefaultDeviceId(obsAudioSnapshot.devices, obsAudioSnapshot.selectedDeviceId));
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

    const config = createDefaultAudioConfig(obsAudioSnapshot.inputName, selectedDevice);
    const deviceLabel = selectedDevice?.name ?? obsAudioSnapshot.selectedDeviceName ?? obsAudioSnapshot.inputName;
    const monoMessage = obsAudioSnapshot.monoSupported
      ? 'Se activara Mono para esta entrada.'
      : 'OBS WebSocket no expone Mono para esta entrada, asi que OBSREC lo dejara como paso manual en OBS.';
    const confirmed = window.confirm(`Aplicar configuracion de voz OBSREC a "${deviceLabel}"?\n\n${monoMessage}\n\nOBSREC aplicara ganancia de +10 dB, compresor 4:1 a -10 dB y limitador a -1 dB.`);
    if (!confirmed) return;

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
      <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Audio Setup
          </h3>
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            Detectar audio
          </button>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-black p-4">
          <p className="text-sm text-zinc-300">
            {obsConnected
              ? 'OBSREC esta buscando un dispositivo Mic/Aux o una fuente Audio Input Capture para aplicar la configuracion de voz.'
              : 'Conecta OBS para detectar tu microfono y aplicar la configuracion de voz de OBSREC.'}
          </p>
          {detectionMessage && (
            <p className="mt-3 text-sm text-yellow-300">{detectionMessage}</p>
          )}
        </div>
      </div>
    );
  }

  const filtersReady = obsAudioSnapshot.obsrecFiltersConfigured;
  const monoReady = obsAudioSnapshot.monoConfigured;
  const monoSupported = obsAudioSnapshot.monoSupported;

  return (
    <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Audio Setup
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            Objetivo: <span className="text-zinc-300">{obsAudioSnapshot.inputName}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleLocalDeviceScan}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            Buscar micro local
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            Actualizar OBS
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <label className="block rounded-lg bg-black p-4">
          <span className="mb-2 block text-xs text-zinc-500">Microfono recomendado</span>
          <select
            value={selectedDeviceId}
            onChange={(event) => setSelectedDeviceId(event.target.value)}
            className="w-full bg-transparent text-base font-medium text-white outline-none"
          >
            {obsAudioSnapshot.devices.length === 0 ? (
              <option value="" className="bg-zinc-950 text-white">Dispositivo actual de OBS</option>
            ) : (
              obsAudioSnapshot.devices.map((device) => (
                <option key={`${device.id}-${device.name}`} value={device.id} className="bg-zinc-950 text-white">
                  {device.isRecommended ? 'Recomendado - ' : ''}{device.name}
                </option>
              ))
            )}
          </select>
          <span className="mt-2 block text-xs text-zinc-600">
            {selectedDevice?.reason ?? 'OBS no expuso una lista de dispositivos para esta entrada.'}
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-black p-4">
            <span className="mb-2 block text-xs text-zinc-500">Mono</span>
            <span className={monoReady ? 'text-lg font-semibold text-green-400' : monoSupported ? 'text-lg font-semibold text-yellow-400' : 'text-lg font-semibold text-zinc-400'}>
              {monoReady ? 'Listo' : monoSupported ? 'Se puede aplicar' : 'Manual en OBS'}
            </span>
          </div>
          <div className="rounded-lg bg-black p-4">
            <span className="mb-2 block text-xs text-zinc-500">Filters</span>
            <span className={filtersReady ? 'text-lg font-semibold text-green-400' : 'text-lg font-semibold text-yellow-400'}>
              {filtersReady ? 'Listos' : 'Se aplicaran'}
            </span>
          </div>
        </div>
      </div>

      <div className="mb-4 grid gap-3 text-sm md:grid-cols-3">
        <div className="rounded-lg border border-zinc-800 bg-black px-4 py-3 text-zinc-300">OBSREC - Gain +10 dB</div>
        <div className="rounded-lg border border-zinc-800 bg-black px-4 py-3 text-zinc-300">OBSREC - Compressor 4:1 at -10 dB</div>
        <div className="rounded-lg border border-zinc-800 bg-black px-4 py-3 text-zinc-300">OBSREC - Limiter at -1 dB</div>
      </div>

      {(obsAudioSnapshot.warnings.length > 0 || localDeviceStatus) && (
        <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-200">
          <p>{[localDeviceStatus, ...obsAudioSnapshot.warnings].filter(Boolean).join(' ')}</p>
          {!monoSupported && (
            <p className="mt-3 text-yellow-100">
              Para activar Mono: OBS &gt; Propiedades avanzadas de audio &gt; busca este microfono &gt; marca Mono.
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleApply}
        disabled={isApplying}
        className="w-full rounded-xl bg-indigo-600 px-6 py-4 text-lg font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
      >
        {isApplying ? 'Aplicando audio...' : 'APLICAR CONFIGURACION DE VOZ OBSREC'}
      </button>
    </div>
  );
}
