import type { ResolvedSourceKind, SourceKindFriendly } from '../../shared/types';

// Candidatos de inputKind por categoria amigable, ordenados por preferencia.
// Se filtran contra los kinds reales que reporta OBS (GetInputKindList), igual
// que el fallback de propertyName en obs-manager.getAudioDevices. Asi soportamos
// macOS (av_capture_input / screen_capture) y Windows (dshow_input / monitor_capture)
// sin hardcodear un solo valor.
export const KIND_CANDIDATES: Record<SourceKindFriendly, string[]> = {
  camera: ['av_capture_input_v2', 'av_capture_input', 'dshow_input'],
  // Una consola se conecta mediante una tarjeta de captura, que el sistema expone
  // como un dispositivo de video. Por eso usa el mismo inputKind que la camara.
  game_console: ['av_capture_input_v2', 'av_capture_input', 'dshow_input'],
  // En macOS preferimos display_capture (legacy) sobre screen_capture: enumerar
  // los monitores de screen_capture via WebSocket cuelga OBS y cierra la conexion
  // (ver ENUM_UNSAFE_KINDS). display_capture lista los monitores sin problemas.
  // En Windows el unico kind es monitor_capture.
  display: ['display_capture', 'monitor_capture', 'screen_capture'],
  window: ['window_capture'],
  image: ['image_source'],
};

// Kinds cuyo GetInputPropertiesListPropertyItems cuelga OBS sobre WebSocket. Para
// estos no enumeramos dispositivos (se usa el valor por defecto) y se avisa al
// usuario, evitando que la conexion se caiga.
export const ENUM_UNSAFE_KINDS = new Set<string>(['screen_capture']);

// Propiedades candidatas para enumerar el dispositivo/monitor/ventana de cada
// categoria. Se prueban en orden hasta que OBS devuelva items (los nombres varian
// segun plataforma y version de OBS).
export const DEVICE_PROPERTY_CANDIDATES: Partial<Record<SourceKindFriendly, string[]>> = {
  camera: ['video_device_id', 'device', 'device_id'],
  game_console: ['video_device_id', 'device', 'device_id'],
  // macOS display_capture usa 'display_uuid'; Windows monitor_capture usa
  // 'monitor_id' (moderno) o 'monitor' (antiguo).
  display: ['display_uuid', 'monitor_id', 'monitor', 'display'],
  window: ['window'],
  // 'image' no enumera dispositivos: se usa un selector de archivo.
};

export const ALL_FRIENDLY_KINDS: SourceKindFriendly[] = ['camera', 'display', 'window', 'game_console', 'image'];

// Etiqueta legible (en espanol) para cada categoria amigable.
export const FRIENDLY_LABELS: Record<SourceKindFriendly, string> = {
  camera: 'Camara web',
  display: 'Pantalla completa',
  window: 'Ventana',
  game_console: 'Consola',
  image: 'Imagen',
};

// Resuelve el inputKind real a usar para una categoria amigable, eligiendo el
// primer candidato presente en la lista de kinds disponibles en este OBS.
export function resolveSourceKind(
  friendly: SourceKindFriendly,
  availableKinds: string[],
): ResolvedSourceKind {
  const available = new Set(availableKinds);
  const inputKind = KIND_CANDIDATES[friendly].find((kind) => available.has(kind));
  const propertyCandidates = DEVICE_PROPERTY_CANDIDATES[friendly];

  return {
    friendly,
    inputKind: inputKind ?? '',
    devicePropertyName: propertyCandidates?.[0],
    supportsDeviceEnum: Boolean(propertyCandidates && propertyCandidates.length > 0),
    available: Boolean(inputKind),
  };
}

export function resolveAllSourceKinds(availableKinds: string[]): ResolvedSourceKind[] {
  return ALL_FRIENDLY_KINDS.map((friendly) => resolveSourceKind(friendly, availableKinds));
}

// Mapeo inverso (best-effort) de un inputKind real a la categoria amigable, solo
// para elegir el icono en la lista de fuentes. Las consolas no se pueden distinguir
// de una camara a partir del kind, asi que caen en 'camera'.
export function friendlyKindFromInputKind(inputKind: string | undefined): SourceKindFriendly | undefined {
  if (!inputKind) return undefined;
  if (KIND_CANDIDATES.image.includes(inputKind)) return 'image';
  if (KIND_CANDIDATES.display.includes(inputKind)) return 'display';
  if (KIND_CANDIDATES.window.includes(inputKind)) return 'window';
  if (KIND_CANDIDATES.camera.includes(inputKind)) return 'camera';
  return undefined;
}

// OBS exige que el nombre de cada input sea unico globalmente. Genera un nombre
// libre a partir de una base ("Camara web", "Camara web 2", ...).
export function buildUniqueInputName(base: string, existingNames: string[]): string {
  const taken = new Set(existingNames);
  if (!taken.has(base)) return base;
  let index = 2;
  while (taken.has(`${base} ${index}`)) {
    index += 1;
  }
  return `${base} ${index}`;
}
