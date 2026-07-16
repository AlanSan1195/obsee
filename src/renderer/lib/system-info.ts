import type { SystemInfo } from '../../shared/types';

const HARDWARE_KEY = 'obsrec-hardware';
const HARDWARE_SCHEMA_VERSION = 2;

export interface HardwareOverrides {
  cpuModel?: string;
  cpuCores?: number;
  ramGb?: number;
}

interface StoredHardwareOverrides extends HardwareOverrides {
  version: typeof HARDWARE_SCHEMA_VERSION;
}

function isValidCpuCoreCount(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 1
    && value <= 256;
}

function isValidRamGb(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value > 0
    && value <= 2048;
}

export function loadHardwareOverrides(): HardwareOverrides {
  try {
    const raw = localStorage.getItem(HARDWARE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const version = (parsed as { version?: unknown }).version;
    const cpuModel = (parsed as { cpuModel?: unknown }).cpuModel;
    const cpuCores = (parsed as { cpuCores?: unknown }).cpuCores;
    const ramGb = (parsed as { ramGb?: unknown }).ramGb;
    return {
      cpuModel: typeof cpuModel === 'string' && cpuModel.trim().length > 0 ? cpuModel.trim() : undefined,
      cpuCores: version === HARDWARE_SCHEMA_VERSION && isValidCpuCoreCount(cpuCores) ? cpuCores : undefined,
      // La version anterior pudo guardar navigator.deviceMemory sin confirmacion.
      ramGb: version === HARDWARE_SCHEMA_VERSION && isValidRamGb(ramGb) ? ramGb : undefined,
    };
  } catch {
    return {};
  }
}

export function saveHardwareOverrides(overrides: HardwareOverrides): void {
  try {
    const stored: StoredHardwareOverrides = {
      version: HARDWARE_SCHEMA_VERSION,
      ...overrides,
    };
    localStorage.setItem(HARDWARE_KEY, JSON.stringify(stored));
  } catch {
    // El almacenamiento puede estar deshabilitado o sin espacio; el formulario sigue funcionando.
  }
}

export interface DetectedGpu {
  model: string;
  vendor: string;
  hasNvenc: boolean;
}

export function detectGpu(): DetectedGpu {
  let renderer = 'Unknown';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = String(
        ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      );
    }
  } catch {
    // sin WebGL: se queda 'Unknown' y el usuario ve el fallback en el formulario
  }

  // Formato ANGLE de Chrome: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 ..., D3D11)"
  // En Mac: "ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)"
  const angle = /^ANGLE \((.+)\)$/.exec(renderer);
  let model = renderer;
  if (angle) {
    const parts = angle[1].split(', ');
    model = parts[1] ?? parts[0];
    if (model.includes(': ')) {
      model = model.split(': ').pop() ?? model;
    }
    model = model.replace(/ (Direct3D\d+|OpenGL|Vulkan|Metal).*$/i, '').trim();
  }

  const vendor = /nvidia/i.test(renderer)
    ? 'NVIDIA'
    : /amd|radeon/i.test(renderer)
      ? 'AMD'
      : /intel/i.test(renderer)
        ? 'Intel'
        : /apple/i.test(renderer)
          ? 'Apple'
          : 'Unknown';

  return { model, vendor, hasNvenc: vendor === 'NVIDIA' };
}

function detectOS(): SystemInfo['os'] {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) {
    return { platform: 'win32', distro: 'Windows', release: /Windows NT ([\d.]+)/.exec(ua)?.[1] ?? 'unknown' };
  }
  if (/Macintosh|Mac OS X/i.test(ua)) {
    return { platform: 'darwin', distro: 'macOS', release: /Mac OS X ([\d_.]+)/.exec(ua)?.[1]?.replace(/_/g, '.') ?? 'unknown' };
  }
  if (/Linux/i.test(ua)) {
    return { platform: 'linux', distro: 'Linux', release: 'unknown' };
  }
  return { platform: 'unknown', distro: 'unknown', release: 'unknown' };
}

export function getOsPlatform(): string {
  return detectOS().platform;
}

export interface HardwareHints {
  gpu: DetectedGpu;
  logicalProcessors?: number;
  cpuModelHint?: string;
  ramGbHint?: number;
  os: SystemInfo['os'];
}

export function detectHardwareHints(): HardwareHints {
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const hardwareConcurrency = navigator.hardwareConcurrency;
  const gpu = detectGpu();
  return {
    gpu,
    logicalProcessors: Number.isInteger(hardwareConcurrency) && hardwareConcurrency > 0
      ? hardwareConcurrency
      : undefined,
    // En Apple Silicon el chip es CPU y GPU a la vez: sirve para pre-llenar el modelo de CPU
    cpuModelHint: gpu.vendor === 'Apple' && /Apple M\d/i.test(gpu.model) ? gpu.model : undefined,
    // deviceMemory (solo Chrome) esta topado en 8 GB: sirve como pre-llenado, no como dato final
    ramGbHint: typeof deviceMemory === 'number' && deviceMemory > 0 ? deviceMemory : undefined,
    os: detectOS(),
  };
}

export async function getSystemInfo(): Promise<SystemInfo> {
  const hints = detectHardwareHints();
  const overrides = loadHardwareOverrides();

  if (!overrides.cpuModel || !overrides.cpuCores || !overrides.ramGb) {
    throw new Error('Completa el modelo, los nucleos de CPU y la RAM en el formulario de hardware antes de analizar.');
  }

  return {
    cpu: {
      model: overrides.cpuModel,
      cores: overrides.cpuCores,
    },
    gpu: {
      model: hints.gpu.model,
      vendor: hints.gpu.vendor,
      hasNvenc: hints.gpu.hasNvenc,
    },
    ram: {
      total: overrides.ramGb,
    },
    os: hints.os,
  };
}
