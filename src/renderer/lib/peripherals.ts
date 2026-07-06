import type { PeripheralsSnapshot } from '../../shared/types';

const CAPTURE_KEYWORDS = ['capture', 'hdmi', 'elgato', 'avermedia', 'ripsaw', 'ugreen', 'macrosilicon', 'cam link', 'live gamer', 'game capture', 'video grabber'];

export async function getPeripherals(): Promise<PeripheralsSnapshot> {
  // Sin permiso de camara, enumerateDevices devuelve labels vacios:
  // pedimos acceso una vez y soltamos el stream de inmediato.
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    // permiso denegado o sin camara: seguimos con lo que haya
  }

  let devices: MediaDeviceInfo[];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch {
    devices = [];
  }

  const captureDevices = devices
    .filter((device) => device.kind === 'videoinput')
    .map((device) => ({ name: device.label.trim() }))
    .filter((device) => device.name.length > 0 && CAPTURE_KEYWORDS.some((keyword) => device.name.toLowerCase().includes(keyword)));

  // El navegador solo ve el monitor actual (en pixeles fisicos), sin modelo ni Hz;
  // el flujo de consola conserva el input manual de monitor.
  const displays = [{
    model: 'Monitor actual',
    main: true,
    width: Math.round(window.screen.width * window.devicePixelRatio),
    height: Math.round(window.screen.height * window.devicePixelRatio),
    refreshRate: 0,
  }];

  if (import.meta.env.DEV) {
    console.log('[peripherals] === Deteccion web (mediaDevices) ===');
    console.log(`[peripherals] videoinput: ${devices.filter((d) => d.kind === 'videoinput').length} dispositivos`);
    console.log(`[peripherals] Capturadoras (filtradas por keyword): ${captureDevices.length}`, captureDevices);
  }

  return { displays, captureDevices };
}
