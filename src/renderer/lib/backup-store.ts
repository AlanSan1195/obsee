import type { OBSBackup, OBSSettingsSnapshot } from '../../shared/types';
import { validateOBSBackup } from '../../shared/validation';

const BACKUP_KEY = 'obsrec-backup';

function sanitizeSnapshot(snapshot: OBSSettingsSnapshot): OBSSettingsSnapshot {
  return {
    streamServer: snapshot.streamServer,
    baseResolution: snapshot.baseResolution,
    outputResolution: snapshot.outputResolution,
    fps: snapshot.fps,
    encoder: snapshot.encoder,
    bitrate: snapshot.bitrate,
    audioBitrate: snapshot.audioBitrate,
    recordingFormat: snapshot.recordingFormat,
    recordingQuality: snapshot.recordingQuality,
    audio: snapshot.audio,
  };
}

export async function saveBackup(snapshot: OBSSettingsSnapshot): Promise<void> {
  const backup: OBSBackup = {
    createdAt: new Date().toISOString(),
    appliedByObsrec: true,
    snapshot: sanitizeSnapshot(snapshot),
  };

  localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
}

export async function loadBackup(): Promise<OBSBackup | null> {
  try {
    const content = localStorage.getItem(BACKUP_KEY);
    if (!content) return null;
    const parsed: unknown = JSON.parse(content);
    const validation = validateOBSBackup(parsed);
    return validation.success ? validation.value : null;
  } catch {
    return null;
  }
}
