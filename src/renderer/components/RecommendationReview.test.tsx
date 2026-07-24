// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedGoal } from '../../shared/goalParser';
import type { AIRecommendation, OBSSettingsSnapshot, SystemInfo } from '../../shared/types';
import { useAppStore } from '../store';
import { RecommendationReview } from './RecommendationReview';

const apiMocks = vi.hoisted(() => ({
  applyConfig: vi.fn(),
  getLastBackup: vi.fn(),
  restoreLastBackup: vi.fn(),
}));

vi.mock('../hooks/useAppAPI', () => ({
  useAppAPI: () => ({
    applyConfig: apiMocks.applyConfig,
    restoreLastBackup: apiMocks.restoreLastBackup,
  }),
}));

vi.mock('../lib/app-api', () => ({
  appAPI: {
    obs: {
      getLastBackup: apiMocks.getLastBackup,
    },
  },
}));

const systemInfo: SystemInfo = {
  cpu: { model: 'Apple M4', cores: 10 },
  gpu: { model: 'Apple M4', vendor: 'Apple', hasNvenc: false },
  ram: { total: 16 },
  os: { platform: 'darwin', distro: 'macOS', release: '15' },
};

const recommendation: AIRecommendation = {
  source: 'local',
  reasoning: 'Configuración recomendada para YouTube.',
  recommendations: {
    canvas_resolution: '1920x1080',
    resolution: '1920x1080',
    recording_resolution: '1920x1080',
    fps: 60,
    encoder: 'apple vt h264',
    bitrate: 9000,
    recording_encoder: 'apple vt hevc',
    recording_bitrate: 12000,
    audio_bitrate: 320,
    recording_format: 'mkv',
    recording_quality: 'high',
  },
};

const snapshot: OBSSettingsSnapshot = {
  streamServer: 'rtmps://live-upload.youtube.com/live2',
  baseResolution: '1920x1080',
  outputResolution: '1920x1080',
  streamResolution: '1920x1080',
  recordingResolution: '1920x1080',
  outputMode: 'Advanced',
  advancedOutput: {
    streamEncoder: 'com.apple.videotoolbox.videoencoder.ave.avc',
    recordingEncoder: 'com.apple.videotoolbox.videoencoder.ave.hevc',
    streamRescaleResolution: '1920x1080',
    recordingRescaleResolution: '1920x1080',
    streamRescaleFilter: '0',
    recordingRescaleFilter: '0',
    recordingFormat: 'mkv',
  },
  fps: 60,
  encoder: 'com.apple.videotoolbox.videoencoder.ave.avc',
  bitrate: 0,
  audioBitrate: 320,
  recordingFormat: 'mkv',
  recordingQuality: 'advanced',
};

const goal: ParsedGoal = {
  mode: 'stream_record',
  platform: 'youtube',
  preferences: {
    description: 'Transmitir y grabar en YouTube a 1080p60',
    source: 'computer',
  },
  consoleModel: null,
  hardware: {},
};

describe('RecommendationReview con salida avanzada', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getLastBackup.mockResolvedValue({
      success: false,
      message: 'No hay respaldo guardado',
    });

    act(() => {
      useAppStore.setState({
        mode: 'stream_record',
        platform: 'youtube',
        recommendation,
        systemInfo,
        obsConnected: true,
        obsSettingsSnapshot: snapshot,
        obsAudioSnapshot: null,
        consoleProfile: null,
        isApplying: false,
        error: null,
      });
    });
  });

  it('muestra encoders legibles y marca como manuales los bitrates que OBS no expone', () => {
    render(<RecommendationReview goal={goal} onNewGoal={vi.fn()} onRefineGoal={vi.fn()} />);

    expect(screen.getAllByText('Apple VT H.264 (hardware)')).toHaveLength(2);
    expect(screen.getAllByText('Apple VT HEVC (hardware)')).toHaveLength(2);
    expect(screen.getAllByText('No disponible por WebSocket')).toHaveLength(2);
    expect(screen.getAllByText('Manual')).toHaveLength(3);
    expect(screen.getAllByText('0 automáticos · 3 manuales')).toHaveLength(2);
    expect(screen.queryByText('6,000 kbps')).toBeNull();
    expect(screen.getAllByText('320 kbps')).toHaveLength(2);
  });

  it('bloquea aplicar cuando la recomendacion contradice una resolucion pedida', () => {
    const goalWith4KRecording: ParsedGoal = {
      ...goal,
      preferences: {
        ...goal.preferences,
        recordingResolution: '3840x2160',
      },
    };

    render(
      <RecommendationReview
        goal={goalWith4KRecording}
        onNewGoal={vi.fn()}
        onRefineGoal={vi.fn()}
      />,
    );

    expect(screen.getByText('La recomendación no coincide con una instrucción explícita')).toBeTruthy();
    expect(screen.getAllByText('3840x2160').length).toBeGreaterThan(0);
    const applyButton = screen.getByRole('button', { name: 'Revisar antes de aplicar' });
    expect((applyButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Aceptar este resultado' }));
    expect((screen.getByRole('button', { name: 'Aplicar 0 cambios' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('permite aclarar el objetivo y recalcular desde la revision', async () => {
    const onRefineGoal = vi.fn().mockResolvedValue(true);
    render(
      <RecommendationReview
        goal={goal}
        onNewGoal={vi.fn()}
        onRefineGoal={onRefineGoal}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar recomendación' }));
    fireEvent.change(screen.getByLabelText('Aclara el detalle inesperado'), {
      target: { value: 'Mantén el stream a 1080p y graba localmente en 4K60.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar recomendación' }));

    await waitFor(() => expect(onRefineGoal).toHaveBeenCalledTimes(1));
    const refinedGoal = onRefineGoal.mock.calls[0][0] as ParsedGoal;
    expect(refinedGoal.preferences).toMatchObject({
      streamResolution: '1920x1080',
      recordingResolution: '3840x2160',
      fps: 60,
    });
  });

  it('permite priorizar la solicitud explicita aunque la deteccion haya limitado la salida', () => {
    const goalWith4KRecording: ParsedGoal = {
      ...goal,
      preferences: {
        ...goal.preferences,
        streamResolution: '1920x1080',
        recordingResolution: '3840x2160',
        fps: 60,
      },
    };

    render(
      <RecommendationReview
        goal={goalWith4KRecording}
        onNewGoal={vi.fn()}
        onRefineGoal={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Usar lo que pedí' }));

    expect(screen.getByRole('heading', {
      name: 'Stream 1920x1080 + grabación 3840x2160',
    })).toBeTruthy();
    expect(screen.queryByText('La recomendación no coincide con una instrucción explícita')).toBeNull();
    expect(screen.getAllByText('40,000 kbps').length).toBeGreaterThan(0);
  });
});
