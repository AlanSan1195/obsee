// @vitest-environment jsdom

import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIRecommendation, OBSConfig, OBSSettingsSnapshot } from '../shared/types';
import { ImportButton } from './components/ImportButton';
import { useAppAPI } from './hooks/useAppAPI';
import { useAppStore } from './store';

const apiMocks = vi.hoisted(() => ({
  configure: vi.fn(),
  connect: vi.fn(),
  getScenes: vi.fn(),
  getSettingsSnapshot: vi.fn(),
  getSourceKinds: vi.fn(),
}));

vi.mock('./lib/app-api', () => ({
  appAPI: {
    obs: apiMocks,
  },
}));

const currentSnapshot: OBSSettingsSnapshot = {
  streamServer: 'rtmp://live.twitch.tv/app',
  baseResolution: '1280x720',
  outputResolution: '1280x720',
  streamResolution: '1280x720',
  recordingResolution: '1280x720',
  outputMode: 'Simple',
  fps: 30,
  encoder: 'x264',
  bitrate: 2500,
  audioBitrate: 128,
  recordingFormat: 'mp4',
  recordingQuality: 'medium',
};

const recommendation: AIRecommendation = {
  source: 'local',
  reasoning: 'Perfil recomendado para el hardware detectado.',
  recommendations: {
    canvas_resolution: '1920x1080',
    resolution: '1920x1080',
    recording_resolution: '2560x1440',
    fps: 60,
    encoder: 'nvenc',
    bitrate: 6000,
    recording_encoder: 'nvenc',
    recording_bitrate: 40000,
    audio_bitrate: 320,
    recording_format: 'mkv',
    recording_quality: 'high',
  },
};

const appliedSnapshot: OBSSettingsSnapshot = {
  ...currentSnapshot,
  baseResolution: recommendation.recommendations.canvas_resolution,
  outputResolution: recommendation.recommendations.recording_resolution,
  streamResolution: recommendation.recommendations.resolution,
  recordingResolution: recommendation.recommendations.recording_resolution,
  outputMode: 'Advanced',
  fps: recommendation.recommendations.fps,
  encoder: 'obs_nvenc_h264_tex',
  bitrate: recommendation.recommendations.bitrate,
  audioBitrate: recommendation.recommendations.audio_bitrate,
  recordingFormat: recommendation.recommendations.recording_format,
  recordingQuality: 'advanced',
};

function OBSWorkflowHarness() {
  const { connectToOBS } = useAppAPI();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          void connectToOBS({ host: 'localhost', port: 4455, password: '' });
        }}
      >
        Conectar OBS de prueba
      </button>
      <ImportButton />
    </>
  );
}

describe('flujo de deteccion y aplicacion de recomendaciones en OBS', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.connect.mockResolvedValue({ success: true, message: 'Conectado a OBS' });
    apiMocks.getSettingsSnapshot
      .mockResolvedValueOnce({
        success: true,
        message: 'Configuracion de OBS cargada',
        snapshot: currentSnapshot,
      })
      .mockResolvedValueOnce({
        success: true,
        message: 'Configuracion de OBS cargada',
        snapshot: appliedSnapshot,
      });
    apiMocks.getScenes.mockResolvedValue({
      success: true,
      message: 'Escenas cargadas',
      snapshot: { scenes: [] },
    });
    apiMocks.getSourceKinds.mockResolvedValue({
      success: true,
      message: 'Tipos de fuente cargados',
      resolved: [],
    });
    apiMocks.configure.mockResolvedValue({
      success: true,
      message: 'Configuracion aplicada en OBS',
    });

    act(() => {
      useAppStore.setState({
        mode: null,
        platform: null,
        recommendation,
        isApplying: false,
        obsConnected: false,
        obsSettingsSnapshot: null,
        obsAudioSnapshot: null,
        obsMessage: 'Desconectado de OBS',
        error: null,
      });
    });
  });

  it('lee la configuracion actual y aplica la recomendacion al confirmar Aplicar cambios', async () => {
    const user = userEvent.setup();
    render(<OBSWorkflowHarness />);

    await user.click(screen.getByRole('button', { name: 'Conectar OBS de prueba' }));

    await waitFor(() => {
      expect(useAppStore.getState().obsSettingsSnapshot).toEqual(currentSnapshot);
    });
    expect(useAppStore.getState().mode).toBe('stream_record');
    expect(useAppStore.getState().platform).toBe('twitch');
    expect(apiMocks.getSettingsSnapshot).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /importar --a obs/i }));

    const dialog = screen.getByRole('dialog');
    const canvasChange = within(dialog).getByText('Lienzo base').parentElement;
    expect(canvasChange?.textContent).toContain('1280x720');
    expect(canvasChange?.textContent).toContain('1920x1080');
    expect(within(dialog).getByRole('button', { name: 'Aplicar cambios' })).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: 'Aplicar cambios' }));

    const expectedConfig: OBSConfig = {
      mode: 'stream_record',
      platform: 'twitch',
      resolution: '1920x1080',
      canvasResolution: '1920x1080',
      streamResolution: '1920x1080',
      recordingResolution: '2560x1440',
      fps: 60,
      encoder: 'nvenc',
      bitrate: 6000,
      recordingEncoder: 'nvenc',
      recordingBitrate: 40000,
      audioBitrate: 320,
      recordingFormat: 'mkv',
      recordingQuality: 'high',
      audio: undefined,
    };

    await waitFor(() => {
      expect(apiMocks.configure).toHaveBeenCalledWith(expectedConfig);
      expect(useAppStore.getState().obsSettingsSnapshot).toEqual(appliedSnapshot);
    });
    expect(apiMocks.getSettingsSnapshot).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().obsMessage).toBe('Configuracion aplicada en OBS');
  });
});
