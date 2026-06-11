import React, { useState } from 'react';
import { useAppStore } from '../store';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { createDefaultAudioConfig } from './AudioConfiguration';

export function ImportButton() {
  const [showPassword, setShowPassword] = useState(false);
  const {
    mode,
    platform,
    recommendation,
    obsConnectionSettings,
    obsAudioSnapshot,
    obsConnected,
    setObsConnectionSettings,
    setObsMessage,
    setError,
    isApplying,
  } = useAppStore();
  const { connectToOBS, applyConfig } = useElectronAPI();

  const canImport = mode && platform && recommendation && obsConnected;

  const handleImport = async () => {
    if (!canImport || !recommendation) return;

    try {
      const result = await applyConfig({
        mode,
        platform,
        resolution: recommendation.recommendations.resolution,
        fps: recommendation.recommendations.fps,
        encoder: recommendation.recommendations.encoder,
        bitrate: recommendation.recommendations.bitrate,
        audioBitrate: recommendation.recommendations.audio_bitrate,
        recordingFormat: recommendation.recommendations.recording_format,
        recordingQuality: recommendation.recommendations.recording_quality,
        audio: obsAudioSnapshot
          ? createDefaultAudioConfig(
            obsAudioSnapshot.inputName,
            obsAudioSnapshot.recommendedDevice ?? obsAudioSnapshot.devices.find((device) => device.id === obsAudioSnapshot.selectedDeviceId),
          )
          : undefined,
      });

      if (result.success) {
        setObsMessage('Configuration applied successfully!');
      } else {
        setError(result.message);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo aplicar la configuracion');
    }
  };

  const handleConnect = async () => {
    setError(null);
    try {
      const result = await connectToOBS(obsConnectionSettings);
      if (!result.success) {
        setError(result.message);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo conectar con OBS');
    }
  };

  return (
    <div className="mb-8">
      {!obsConnected ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px_1.5fr]">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Host de OBS
              </span>
              <input
                value={obsConnectionSettings.host}
                onChange={(event) => setObsConnectionSettings({ host: event.target.value })}
                className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-zinc-100 outline-none transition-colors focus:border-indigo-500"
                spellCheck={false}
              />
              <span className="mt-2 block text-xs text-zinc-600">Normalmente localhost.</span>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Puerto de OBS
              </span>
              <input
                type="number"
                min={1}
                max={65535}
                value={obsConnectionSettings.port}
                onChange={(event) => setObsConnectionSettings({ port: Number(event.target.value) })}
                className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-zinc-100 outline-none transition-colors focus:border-indigo-500"
              />
              <span className="mt-2 block text-xs text-zinc-600">Normalmente 4455, no 5173.</span>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Password de WebSocket
              </span>
              <div className="flex rounded-lg border border-zinc-700 bg-black focus-within:border-indigo-500">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={obsConnectionSettings.password}
                  onChange={(event) => setObsConnectionSettings({ password: event.target.value })}
                  className="min-w-0 flex-1 rounded-l-lg bg-transparent px-4 py-3 text-zinc-100 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="shrink-0 rounded-r-lg border-l border-zinc-700 px-4 text-sm font-semibold text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              <span className="mt-2 block text-xs text-zinc-600">Dejalo vacio solo si la autenticacion de OBS esta desactivada.</span>
            </label>
          </div>
          <button
            onClick={handleConnect}
            className="w-full py-3 px-6 rounded-xl font-semibold text-lg
              bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-300
              transition-all duration-200 flex items-center justify-center gap-2"
          >
            <span>🔌</span>
            <span>Conectar con OBS</span>
          </button>
        </div>
      ) : (
        <button
          onClick={handleImport}
          disabled={!canImport || isApplying}
          className={`
            w-full py-4 px-6 rounded-xl font-semibold text-lg
            transition-all duration-200 flex items-center justify-center gap-3
            ${canImport && !isApplying
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }
          `}
        >
          {isApplying ? (
            <>
              <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              <span>Aplicando...</span>
            </>
          ) : (
            <>
              <span>⬆️</span>
              <span>IMPORTAR A OBS</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
