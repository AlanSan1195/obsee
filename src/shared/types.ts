export interface AIServiceMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIService {
  name: string;
  chat(messages: AIServiceMessage[]): Promise<AsyncGenerator<string>>;
}

export type OBSMode = 'stream_record' | 'stream_only' | 'record_only';
export type OBSPlatform = 'twitch' | 'youtube';

export interface OBSConnectionSettings {
  host: string;
  port: number;
  password: string;
}

export interface OBSConfig {
  mode: OBSMode;
  platform: OBSPlatform;
  resolution: string;
  fps: number;
  encoder: string;
  bitrate: number;
  audioBitrate: number;
  recordingFormat: string;
  recordingQuality?: string;
  streamKey?: string;
}

export interface SystemInfo {
  cpu: {
    model: string;
    cores: number;
    speed: number;
  };
  gpu: {
    model: string;
    vram: number;
    vendor: string;
    hasNvenc: boolean;
  };
  ram: {
    total: number;
  };
  os: {
    platform: string;
    distro: string;
    release: string;
  };
}

export interface AIRecommendationRequest {
  systemInfo: SystemInfo;
  mode: OBSMode;
  platform: OBSPlatform;
}

export interface AIRecommendation {
  recommendations: {
    resolution: string;
    fps: number;
    encoder: string;
    bitrate: number;
    audio_bitrate: number;
    recording_format: string;
    recording_quality: string;
  };
  reasoning: string;
}
