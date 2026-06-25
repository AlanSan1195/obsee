import type { ObsBaselineSettings, OBSMode, OBSPlatform, OBSSettingsSnapshot } from './types';

// Detecta si OBS ya tiene un servicio de streaming configurado (lo que el usuario
// definio en el asistente inicial de OBS) a partir del servidor de stream.
export function hasStreamService(streamServer: string | undefined): boolean {
  return typeof streamServer === 'string' && streamServer.trim().length > 0;
}

// Infiere la plataforma a partir del servidor de stream configurado en OBS.
export function inferPlatform(streamServer: string | undefined): OBSPlatform | null {
  const server = (streamServer ?? '').toLowerCase();
  if (!server) return null;
  if (server.includes('twitch')) return 'twitch';
  if (server.includes('youtube') || server.includes('google') || server.includes('ytlive')) return 'youtube';
  return null;
}

// Infiere el modo de uso (igual que el asistente inicial de OBS): si hay un
// servicio de stream configurado, el usuario optimizo para transmision; si no,
// es un uso solo de grabacion.
export function inferMode(streamServer: string | undefined): OBSMode {
  return hasStreamService(streamServer) ? 'stream_record' : 'record_only';
}

export interface InferredObsUsage {
  mode: OBSMode;
  platform: OBSPlatform | null;
}

export function inferObsUsage(snapshot: OBSSettingsSnapshot): InferredObsUsage {
  return {
    mode: inferMode(snapshot.streamServer),
    platform: inferPlatform(snapshot.streamServer),
  };
}

// Extrae la configuracion base de OBS desde el snapshot para enviarla como
// contexto a la recomendacion.
export function extractObsBaseline(snapshot: OBSSettingsSnapshot): ObsBaselineSettings {
  return {
    resolution: snapshot.outputResolution,
    fps: snapshot.fps,
    encoder: snapshot.encoder,
    bitrate: snapshot.bitrate,
    recordingQuality: snapshot.recordingQuality,
    hasStreamService: hasStreamService(snapshot.streamServer),
  };
}
