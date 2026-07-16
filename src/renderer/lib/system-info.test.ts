import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectGpu,
  detectHardwareHints,
  getSystemInfo,
  loadHardwareOverrides,
  saveHardwareOverrides,
} from './system-info';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  get length(): number {
    return this.values.size;
  }
}

function stubNavigator(overrides: Partial<Navigator & { deviceMemory: number }> = {}): void {
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5)',
    hardwareConcurrency: 6,
    ...overrides,
  });
}

function stubWebGl(renderer?: string): void {
  const gl = renderer === undefined
    ? null
    : {
        RENDERER: 'renderer',
        getExtension: vi.fn(() => ({ UNMASKED_RENDERER_WEBGL: 'unmasked-renderer' })),
        getParameter: vi.fn(() => renderer),
      };

  vi.stubGlobal('document', {
    createElement: vi.fn(() => ({
      getContext: vi.fn(() => gl),
    })),
  });
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  stubNavigator();
  stubWebGl('ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('detectGpu', () => {
  it('limpia el renderer ANGLE de Apple Silicon', () => {
    expect(detectGpu()).toEqual({
      model: 'Apple M4',
      vendor: 'Apple',
      hasNvenc: false,
    });
  });

  it('devuelve Unknown cuando WebGL no esta disponible', () => {
    stubWebGl();

    expect(detectGpu()).toEqual({
      model: 'Unknown',
      vendor: 'Unknown',
      hasNvenc: false,
    });
  });
});

describe('detectHardwareHints', () => {
  it('mantiene las pistas del navegador separadas del hardware confirmado', () => {
    stubNavigator({ hardwareConcurrency: 6, deviceMemory: 8 });

    expect(detectHardwareHints()).toMatchObject({
      logicalProcessors: 6,
      cpuModelHint: 'Apple M4',
      ramGbHint: 8,
      gpu: { model: 'Apple M4', vendor: 'Apple' },
    });
  });

  it('no inventa un conteo cuando hardwareConcurrency no esta disponible', () => {
    stubNavigator({ hardwareConcurrency: 0 });

    expect(detectHardwareHints().logicalProcessors).toBeUndefined();
  });
});

describe('hardware overrides', () => {
  it('descarta RAM ambigua de la version anterior y conserva el modelo', () => {
    localStorage.setItem('obsrec-hardware', JSON.stringify({
      cpuModel: ' Apple M4 ',
      ramGb: 16,
    }));

    expect(loadHardwareOverrides()).toEqual({
      cpuModel: 'Apple M4',
      cpuCores: undefined,
      ramGb: undefined,
    });
  });

  it('guarda y carga valores confirmados con version de esquema', () => {
    saveHardwareOverrides({ cpuModel: ' Apple M4 ', cpuCores: 10, ramGb: 16 });

    expect(loadHardwareOverrides()).toEqual({
      cpuModel: 'Apple M4',
      cpuCores: 10,
      ramGb: 16,
    });
    expect(JSON.parse(localStorage.getItem('obsrec-hardware') ?? '{}')).toMatchObject({
      version: 2,
      cpuCores: 10,
      ramGb: 16,
    });
  });

  it('rechaza JSON roto y conteos de CPU invalidos', () => {
    localStorage.setItem('obsrec-hardware', '{');
    expect(loadHardwareOverrides()).toEqual({});

    localStorage.setItem('obsrec-hardware', JSON.stringify({
      version: 2,
      cpuModel: 'Apple M4',
      cpuCores: 10.5,
      ramGb: 16,
    }));
    expect(loadHardwareOverrides().cpuCores).toBeUndefined();
  });
});

describe('getSystemInfo', () => {
  it('exige modelo, nucleos y RAM confirmados', async () => {
    await expect(getSystemInfo()).rejects.toThrow('Completa el modelo, los nucleos de CPU y la RAM');
  });

  it('usa 10 nucleos confirmados aunque el navegador reporte 6', async () => {
    saveHardwareOverrides({ cpuModel: 'Apple M4', cpuCores: 10, ramGb: 16 });

    await expect(getSystemInfo()).resolves.toEqual({
      cpu: { model: 'Apple M4', cores: 10 },
      gpu: { model: 'Apple M4', vendor: 'Apple', hasNvenc: false },
      ram: { total: 16 },
      os: { platform: 'darwin', distro: 'macOS', release: '15.5' },
    });
  });
});
