import { describe, expect, it } from 'vitest';
import {
  buildUniqueInputName,
  friendlyKindFromInputKind,
  resolveAllSourceKinds,
  resolveSourceKind,
} from './scene-helpers';

describe('resolveSourceKind', () => {
  it('elige el primer candidato disponible para camara en macOS', () => {
    const resolved = resolveSourceKind('camera', ['av_capture_input', 'screen_capture']);
    expect(resolved.available).toBe(true);
    expect(resolved.inputKind).toBe('av_capture_input');
    expect(resolved.supportsDeviceEnum).toBe(true);
    expect(resolved.devicePropertyName).toBe('video_device_id');
  });

  it('prefiere av_capture_input_v2 si esta disponible', () => {
    const resolved = resolveSourceKind('camera', ['av_capture_input', 'av_capture_input_v2']);
    expect(resolved.inputKind).toBe('av_capture_input_v2');
  });

  it('elige dshow_input para camara en Windows', () => {
    const resolved = resolveSourceKind('camera', ['dshow_input', 'monitor_capture']);
    expect(resolved.inputKind).toBe('dshow_input');
  });

  it('camera y game_console resuelven al mismo inputKind', () => {
    const kinds = ['dshow_input'];
    expect(resolveSourceKind('camera', kinds).inputKind).toBe(resolveSourceKind('game_console', kinds).inputKind);
  });

  it('marca available:false cuando ningun candidato existe', () => {
    const resolved = resolveSourceKind('display', ['dshow_input']);
    expect(resolved.available).toBe(false);
    expect(resolved.inputKind).toBe('');
  });

  it('image no soporta enumeracion de dispositivos', () => {
    const resolved = resolveSourceKind('image', ['image_source']);
    expect(resolved.available).toBe(true);
    expect(resolved.supportsDeviceEnum).toBe(false);
  });
});

describe('resolveAllSourceKinds', () => {
  it('devuelve una entrada por cada categoria amigable', () => {
    const resolved = resolveAllSourceKinds(['av_capture_input', 'screen_capture', 'window_capture', 'image_source']);
    expect(resolved).toHaveLength(5);
    expect(resolved.filter((kind) => kind.available)).toHaveLength(5);
  });
});

describe('friendlyKindFromInputKind', () => {
  it('mapea kinds conocidos a su categoria', () => {
    expect(friendlyKindFromInputKind('screen_capture')).toBe('display');
    expect(friendlyKindFromInputKind('window_capture')).toBe('window');
    expect(friendlyKindFromInputKind('image_source')).toBe('image');
    expect(friendlyKindFromInputKind('dshow_input')).toBe('camera');
  });

  it('devuelve undefined para kinds desconocidos o vacios', () => {
    expect(friendlyKindFromInputKind('ffmpeg_source')).toBeUndefined();
    expect(friendlyKindFromInputKind(undefined)).toBeUndefined();
  });
});

describe('buildUniqueInputName', () => {
  it('usa la base si esta libre', () => {
    expect(buildUniqueInputName('Camara web', [])).toBe('Camara web');
  });

  it('agrega un sufijo numerico cuando hay colision', () => {
    expect(buildUniqueInputName('Camara web', ['Camara web'])).toBe('Camara web 2');
    expect(buildUniqueInputName('Camara web', ['Camara web', 'Camara web 2'])).toBe('Camara web 3');
  });
});
