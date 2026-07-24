import type {
  OBSAdvancedEncoderSettings,
  OBSAdvancedOutputControl,
} from '../../shared/types';

type JsonRecord = Record<string, unknown>;

export type OBSAdvancedEncoderPatch = {
  rate_control?: 'CBR' | 'ABR' | 'CRF';
  bitrate?: number;
  quality?: number;
  limit_bitrate?: boolean;
  max_bitrate?: number;
  max_bitrate_window?: number;
  keyint_sec?: number;
  profile?: 'baseline' | 'main' | 'high' | 'main10' | 'main42210';
  bframes?: boolean;
  spatial_aq_mode?: 1 | 2 | 3;
};

export type OBSAdvancedApplyRequest = {
  stream?: OBSAdvancedEncoderPatch;
  recording?: OBSAdvancedEncoderPatch;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(record: JsonRecord, key: string): string {
  return typeof record[key] === 'string' ? record[key] : '';
}

function numberValue(record: JsonRecord, key: string): number {
  return typeof record[key] === 'number' && Number.isFinite(record[key])
    ? record[key]
    : 0;
}

function booleanValue(record: JsonRecord, key: string): boolean {
  return record[key] === true;
}

function parseEncoderSettings(value: unknown): OBSAdvancedEncoderSettings | undefined {
  if (!isRecord(value)) return undefined;

  return {
    available: booleanValue(value, 'available'),
    encoderId: stringValue(value, 'encoderId'),
    active: booleanValue(value, 'active'),
    rateControl: stringValue(value, 'rate_control'),
    bitrate: numberValue(value, 'bitrate'),
    quality: numberValue(value, 'quality'),
    limitBitrate: booleanValue(value, 'limit_bitrate'),
    maxBitrate: numberValue(value, 'max_bitrate'),
    maxBitrateWindow: numberValue(value, 'max_bitrate_window'),
    keyframeInterval: numberValue(value, 'keyint_sec'),
    profile: stringValue(value, 'profile'),
    bFrames: booleanValue(value, 'bframes'),
    spatialAQMode: numberValue(value, 'spatial_aq_mode'),
  };
}

export function parseAdvancedOutputControl(value: unknown): OBSAdvancedOutputControl | undefined {
  if (!isRecord(value) || value.success !== true) return undefined;

  return {
    available: booleanValue(value, 'available'),
    pluginVersion: stringValue(value, 'pluginVersion'),
    outputMode: stringValue(value, 'outputMode'),
    stream: parseEncoderSettings(value.stream),
    recording: parseEncoderSettings(value.recording),
  };
}

export function recordingQualityFromEncoder(quality: number): string {
  if (quality >= 90) return 'lossless';
  if (quality >= 70) return 'high';
  if (quality >= 45) return 'medium';
  return quality > 0 ? 'low' : 'advanced';
}

export function recordingQualityValue(quality?: string): number | undefined {
  switch (quality?.trim().toLowerCase()) {
    case 'lossless':
      return 100;
    case 'high':
    case 'hq':
      return 76;
    case 'medium':
    case 'small':
      return 55;
    case 'low':
      return 35;
    default:
      return undefined;
  }
}

export function encoderPatchFromSnapshot(
  settings: OBSAdvancedEncoderSettings | undefined,
): OBSAdvancedEncoderPatch | undefined {
  if (!settings?.available) return undefined;

  const rateControl = ['CBR', 'ABR', 'CRF'].includes(settings.rateControl)
    ? settings.rateControl as OBSAdvancedEncoderPatch['rate_control']
    : undefined;
  const profile = ['baseline', 'main', 'high', 'main10', 'main42210'].includes(settings.profile)
    ? settings.profile as OBSAdvancedEncoderPatch['profile']
    : undefined;
  const spatialAQMode = [1, 2, 3].includes(settings.spatialAQMode)
    ? settings.spatialAQMode as OBSAdvancedEncoderPatch['spatial_aq_mode']
    : undefined;

  return {
    rate_control: rateControl,
    bitrate: settings.bitrate || undefined,
    quality: settings.quality || undefined,
    limit_bitrate: settings.limitBitrate,
    max_bitrate: settings.maxBitrate || undefined,
    max_bitrate_window: settings.maxBitrateWindow || undefined,
    keyint_sec: settings.keyframeInterval,
    profile,
    bframes: settings.bFrames,
    spatial_aq_mode: spatialAQMode,
  };
}

