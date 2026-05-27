import React, { useState } from 'react';
import { useAppStore } from '../store';
import { useElectronAPI } from '../hooks/useElectronAPI';

export function ImportButton() {
  const [showPassword, setShowPassword] = useState(false);
  const {
    mode,
    platform,
    recommendation,
    obsConnectionSettings,
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
      });

      if (result.success) {
        setObsMessage('Configuration applied successfully!');
      } else {
        setError(result.message);
      }
    } catch {
      setError('Failed to apply configuration');
    }
  };

  const handleConnect = async () => {
    setError(null);
    try {
      const result = await connectToOBS(obsConnectionSettings);
      if (!result.success) {
        setError(result.message);
      }
    } catch {
      setError('Failed to connect to OBS');
    }
  };

  return (
    <div className="mb-8">
      {!obsConnected ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px_1.5fr]">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                OBS Host
              </span>
              <input
                value={obsConnectionSettings.host}
                onChange={(event) => setObsConnectionSettings({ host: event.target.value })}
                className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-zinc-100 outline-none transition-colors focus:border-indigo-500"
                spellCheck={false}
              />
              <span className="mt-2 block text-xs text-zinc-600">Usually localhost.</span>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                OBS Port
              </span>
              <input
                type="number"
                min={1}
                max={65535}
                value={obsConnectionSettings.port}
                onChange={(event) => setObsConnectionSettings({ port: Number(event.target.value) })}
                className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-zinc-100 outline-none transition-colors focus:border-indigo-500"
              />
              <span className="mt-2 block text-xs text-zinc-600">Usually 4455, not 5173.</span>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                WebSocket Password
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
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <span className="mt-2 block text-xs text-zinc-600">Leave blank only if OBS authentication is disabled.</span>
            </label>
          </div>
          <button
            onClick={handleConnect}
            className="w-full py-3 px-6 rounded-xl font-semibold text-lg
              bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-300
              transition-all duration-200 flex items-center justify-center gap-2"
          >
            <span>🔌</span>
            <span>Connect to OBS</span>
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
              <span>Applying...</span>
            </>
          ) : (
            <>
              <span>⬆️</span>
              <span>IMPORT TO OBS</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
