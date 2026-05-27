import type { AIRecommendation, AIRecommendationRequest } from './types';

function getEncoder(request: AIRecommendationRequest): string {
  const vendor = request.systemInfo.gpu.vendor.toLowerCase();
  const model = request.systemInfo.gpu.model.toLowerCase();

  if (request.systemInfo.gpu.hasNvenc || vendor.includes('nvidia')) return 'nvenc';
  if (vendor.includes('apple') || model.includes('apple')) return 'apple vt h264';
  if (vendor.includes('intel')) return 'qsv';
  if (vendor.includes('amd')) return 'amd';

  return 'x264';
}

function getVideoProfile(request: AIRecommendationRequest) {
  const { cpu, ram } = request.systemInfo;
  const canUse1080p60 = cpu.cores >= 8 && ram.total >= 16;
  const wantsRecording = request.mode !== 'stream_only';

  if (canUse1080p60) {
    return {
      resolution: '1920x1080',
      fps: 60,
      bitrate: request.platform === 'youtube' && wantsRecording ? 9000 : 6000,
    };
  }

  return {
    resolution: '1280x720',
    fps: 30,
    bitrate: request.platform === 'youtube' ? 4500 : 3500,
  };
}

export function getLocalRecommendation(request: AIRecommendationRequest): AIRecommendation {
  const videoProfile = getVideoProfile(request);
  const encoder = getEncoder(request);
  const recordingQuality = request.mode === 'record_only' ? 'high' : 'stream';

  return {
    recommendations: {
      resolution: videoProfile.resolution,
      fps: videoProfile.fps,
      encoder,
      bitrate: videoProfile.bitrate,
      audio_bitrate: 320,
      recording_format: 'mkv',
      recording_quality: recordingQuality,
    },
    reasoning: 'Local fallback recommendation based on CPU cores, RAM, GPU vendor, selected platform, and OBS mode.',
  };
}
