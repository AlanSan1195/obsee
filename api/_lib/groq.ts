import Groq from 'groq-sdk';
import type { AIRecommendationExplanationRequest, AIRecommendationRequest, AIServiceMessage, ConsoleProfileRequest, MicProfileRequest } from '../../src/shared/types';

let groqInstance: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqInstance) {
    const apiKey = process.env.GROQ_API_KEY || '';
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not configured on the backend.');
    }
    groqInstance = new Groq({ apiKey });
  }
  return groqInstance;
}

// maxTokens: usar null para NO enviar el parametro. Los sistemas agentic
// (groq/compound) rechazan la peticion con "request_too_large" si se reserva
// max_tokens, porque el modelo subyacente + la busqueda web exceden el limite
// por peticion. Para esos casos se omite.
type ChatOptions = { model?: string; temperature?: number; maxTokens?: number | null };

async function chat(messages: AIServiceMessage[], options: ChatOptions = {}): Promise<string> {
  const maxTokens = options.maxTokens === undefined ? 4000 : options.maxTokens;
  const completion = await getGroqClient().chat.completions.create({
    messages,
    model: options.model || process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    temperature: options.temperature ?? 0.7,
    ...(maxTokens === null ? {} : { max_tokens: maxTokens }),
  });

  return completion.choices[0]?.message?.content ?? '';
}

export function parseJsonObject(value: string): unknown {
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('AI response did not include JSON.');
  }

  return JSON.parse(match[0]);
}

export async function getRecommendationFromGroq(request: AIRecommendationRequest): Promise<unknown> {
  const { systemInfo, mode, platform, currentSettings } = request;
  const baselineSection = currentSettings
    ? `
Configuracion que OBS ya tiene (definida en el asistente inicial de OBS segun el hardware y la red del usuario; usala como base y solo cambiala si hay una mejora clara):
- Resolucion: ${currentSettings.resolution}
- FPS: ${currentSettings.fps}
- Encoder: ${currentSettings.encoder}
- Bitrate de video: ${currentSettings.bitrate} kbps
- Calidad de grabacion: ${currentSettings.recordingQuality}
- Servicio de streaming configurado: ${currentSettings.hasStreamService ? 'Si' : 'No'}
`
    : '';
  const prompt = `Eres un experto en configuracion de OBS para streaming y grabacion.
Analiza el hardware del usuario y recomienda la mejor configuracion posible.

Preferencias del usuario:
- Modo: ${mode}
- Plataforma: ${platform}

Hardware disponible:
- CPU: ${systemInfo.cpu.model} (${systemInfo.cpu.cores} cores)
- GPU: ${systemInfo.gpu.model} ${systemInfo.gpu.vram}MB VRAM (Vendor: ${systemInfo.gpu.vendor})
- RAM: ${systemInfo.ram.total}GB
- OS: ${systemInfo.os.distro} ${systemInfo.os.release}
- Hardware NVENC disponible: ${systemInfo.gpu.hasNvenc ? 'Si' : 'No'}
${baselineSection}
Responde en JSON con este formato exacto, sin texto adicional:
{
  "recommendations": {
    "resolution": "1920x1080",
    "fps": 60,
    "encoder": "nvenc",
    "bitrate": 6000,
    "audio_bitrate": 320,
    "recording_format": "mkv",
    "recording_quality": "high"
  },
  "reasoning": "Explicacion de por que esta configuracion es optima para este hardware"
}`;

  const response = await chat([
    { role: 'system', content: 'Eres un experto en configuracion de OBS. Responde solo en JSON valido.' },
    { role: 'user', content: prompt },
  ]);

  return parseJsonObject(response);
}

const MIC_PROFILE_JSON_SHAPE = `Responde SOLO con JSON valido y exactamente con esta forma:
{
  "profile": {
    "identified": true,
    "model": "Marca Modelo",
    "type": "condenser|dynamic|electret|unknown",
    "connection": "usb|xlr|analog|wireless|unknown",
    "hasBuiltinDsp": false,
    "summary": "resumen breve en espanol de las caracteristicas relevantes",
    "sources": ["https://..."]
  },
  "filters": {
    "noiseSuppression": { "enabled": true, "method": "rnnoise", "reason": "..." },
    "noiseGate": { "enabled": true, "closeThresholdDb": -45, "openThresholdDb": -35, "reason": "..." },
    "gain": { "enabled": true, "db": 6, "reason": "..." },
    "compressor": { "enabled": true, "ratio": 3, "thresholdDb": -18, "reason": "..." },
    "limiter": { "enabled": true, "thresholdDb": -1.5, "reason": "..." }
  },
  "reasoning": "explicacion general en espanol"
}`;

const MIC_PROFILE_RULES = `Reglas:
- Si el nombre es generico (ej. "Default", "Microphone", "Built-in") y no puedes identificar un modelo real, marca "identified": false y da valores conservadores.
- Si el microfono YA tiene DSP/cancelacion de ruido integrada, omite o suaviza la supresion de ruido de OBS.
- Un condensador sensible suele necesitar noise gate y menos ganancia; un dinamico de baja salida (ej. SM7B) necesita mas ganancia.
- "method": usa "rnnoise" salvo que recomiendes especificamente "speex" o "nvafx".
- En cada filtro incluye "enabled" (false = omitir) y un "reason" breve en espanol.`;

function buildMicContext(request: MicProfileRequest): string {
  return `Microfono detectado: "${request.deviceName}". Contexto: sistema operativo ${request.os ?? 'desconocido'}, tipo de entrada OBS "${request.inputKind ?? 'desconocido'}", uso "${request.mode}".`;
}

// Hibrido: si GROQ_SEARCH_MODEL esta configurado (ej. 'groq/compound' en un tier
// que lo permita), intenta busqueda web real; si falla (en el tier gratuito de
// Groq excede el limite por peticion: "request_too_large") cae al conocimiento
// del modelo (gpt-oss). Por defecto, sin esa env var, va directo a gpt-oss para
// no pagar ~7s de espera inutil en cada analisis.
export async function getMicProfileFromGroq(request: MicProfileRequest): Promise<unknown> {
  const searchModel = process.env.GROQ_SEARCH_MODEL;

  if (searchModel) {
    try {
      const webPrompt = `Eres un ingeniero de audio experto en OBS. Busca en la web las especificaciones OFICIALES del microfono indicado.
${buildMicContext(request)}

A partir de las caracteristicas reales del producto (tipo, conexion, sensibilidad, nivel de ruido propio, DSP integrado) decide que filtros de OBS conviene aplicar, ajustar u OMITIR para una voz clara y profesional.

${MIC_PROFILE_RULES}
- Incluye "sources" con 1-3 URLs oficiales del fabricante que respalden las specs.

${MIC_PROFILE_JSON_SHAPE}`;

      // Sin max_tokens: groq/compound lo rechaza ("request_too_large").
      const response = await chat(
        [
          { role: 'system', content: 'Eres un ingeniero de audio experto en OBS. Usas busqueda web para confirmar specs y respondes solo en JSON valido.' },
          { role: 'user', content: webPrompt },
        ],
        { model: searchModel, temperature: 0.3, maxTokens: null },
      );
      return parseJsonObject(response);
    } catch (error) {
      console.warn('Busqueda web no disponible para el perfil de microfono, usando conocimiento del modelo:', error instanceof Error ? error.message : error);
    }
  }

  // Conocimiento del modelo (rapido, sin web). Funciona en el tier gratuito.
  const knowledgePrompt = `Eres un ingeniero de audio experto en OBS. A partir de tu conocimiento del microfono indicado, recomienda filtros de OBS.
${buildMicContext(request)}

Identifica tipo (condensador/dinamico/electret), conexion (USB/XLR/analogica) y si tiene DSP/cancelacion de ruido integrada, y decide que filtros aplicar, ajustar u OMITIR para una voz clara y profesional.

${MIC_PROFILE_RULES}
- No inventes URLs: deja "sources" como [].

${MIC_PROFILE_JSON_SHAPE}`;

  const response = await chat(
    [
      { role: 'system', content: 'Eres un ingeniero de audio experto en OBS. Respondes solo en JSON valido.' },
      { role: 'user', content: knowledgePrompt },
    ],
    { model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b', temperature: 0.3, maxTokens: 2000 },
  );

  return parseJsonObject(response);
}

const CONSOLE_LABELS: Record<string, string> = {
  ps5: 'PlayStation 5',
  ps5_pro: 'PlayStation 5 Pro',
  xbox_series_x: 'Xbox Series X',
  xbox_series_s: 'Xbox Series S',
  switch: 'Nintendo Switch',
  switch2: 'Nintendo Switch 2',
};

const CONSOLE_PROFILE_JSON_SHAPE = `Responde SOLO con JSON valido y exactamente con esta forma:
{
  "profile": {
    "console":     { "name": "", "identified": true, "summary": "", "maxResolution": "3840x2160", "maxFps": 120, "hdr": true, "vrr": true, "notes": "" },
    "captureCard": { "name": "", "identified": true, "summary": "", "maxResolution": "1920x1080", "maxFps": 60,  "hdr": false, "vrr": false, "notes": "captura vs passthrough" },
    "monitor":     { "name": "", "identified": true, "summary": "", "maxResolution": "3840x2160", "maxFps": 60,  "hdr": true, "vrr": false, "notes": "" },
    "bottleneck": "explica que componente limita la cadena y por que",
    "captureResolution": "1920x1080",
    "captureFps": 60,
    "consoleSettings": ["paso 1 en la consola", "paso 2", "..."],
    "sources": ["https://..."]
  },
  "recommendations": {
    "resolution": "1920x1080",
    "fps": 60,
    "encoder": "nvenc",
    "bitrate": 6000,
    "audio_bitrate": 320,
    "recording_format": "mkv",
    "recording_quality": "high"
  },
  "reasoning": "explicacion general en espanol"
}`;

const CONSOLE_PROFILE_RULES = `Reglas:
- La capturadora suele ser el cuello de botella: distingue su resolucion/fps de CAPTURA (lo que graba OBS) de su PASSTHROUGH (lo que pasa al monitor). Muchas baratas pasan 4K pero capturan 1080p30/60.
- "captureResolution"/"captureFps" = lo maximo que conviene capturar = el MENOR techo entre consola y capturadora.
- "recommendations" son los ajustes de OBS en la PC: usa el hardware de la PC para "encoder"/"bitrate", pero limita "resolution"/"fps" al techo de captura. Nunca superes lo que la capturadora puede capturar.
- "consoleSettings": pasos concretos para ajustar la salida de video de la consola (resolucion, fps, HDR/RGB) de forma compatible con la capturadora.
- Si no identificas un componente, marca "identified": false y usa valores conservadores.
- En cada filtro/campo se honesto sobre limitaciones reales del hardware.`;

function buildConsoleContext(request: ConsoleProfileRequest): string {
  const c = request.systemInfo.cpu;
  const g = request.systemInfo.gpu;
  const realCaps = request.captureMaxResolution
    ? `\nIMPORTANTE: OBS leyo las capacidades REALES de la capturadora: captura hasta ${request.captureMaxResolution}${request.captureMaxFps ? ` a ${request.captureMaxFps}fps` : ''}. Usa esto como techo de captura verificado (no lo superes); este dato es mas confiable que el nombre.`
    : '';
  return `Consola: ${CONSOLE_LABELS[request.console] ?? request.console}.
Capturadora detectada: "${request.captureCard ?? 'desconocida'}".
Monitor detectado: "${request.monitor ?? 'desconocido'}"${request.monitorRefreshRate ? ` a ${request.monitorRefreshRate}Hz` : ''}.
PC que corre OBS: CPU ${c.model} (${c.cores} nucleos), GPU ${g.model} (vendor ${g.vendor}, NVENC ${g.hasNvenc ? 'si' : 'no'}), ${request.systemInfo.ram.total}GB RAM, OS ${request.os ?? request.systemInfo.os.distro}.
Uso: ${request.mode} en ${request.platform}.${realCaps}`;
}

// Hibrido (mismo criterio que el perfil de microfono): web opcional via
// GROQ_SEARCH_MODEL, por defecto conocimiento del modelo (gpt-oss).
export async function getConsoleProfileFromGroq(request: ConsoleProfileRequest): Promise<unknown> {
  const searchModel = process.env.GROQ_SEARCH_MODEL;

  if (searchModel) {
    try {
      const webPrompt = `Eres un experto en streaming de consolas con OBS. Busca en la web las especificaciones OFICIALES de la consola, la capturadora y el monitor indicados, y haz "match" de la cadena consola -> capturadora -> monitor.
${buildConsoleContext(request)}

${CONSOLE_PROFILE_RULES}
- Incluye "sources" con 1-3 URLs oficiales que respalden las specs.

${CONSOLE_PROFILE_JSON_SHAPE}`;

      const response = await chat(
        [
          { role: 'system', content: 'Eres un experto en streaming de consolas con OBS. Usas busqueda web para confirmar specs y respondes solo en JSON valido.' },
          { role: 'user', content: webPrompt },
        ],
        { model: searchModel, temperature: 0.3, maxTokens: null },
      );
      return parseJsonObject(response);
    } catch (error) {
      console.warn('Busqueda web no disponible para el perfil de consola, usando conocimiento del modelo:', error instanceof Error ? error.message : error);
    }
  }

  const knowledgePrompt = `Eres un experto en streaming de consolas con OBS. A partir de tu conocimiento de la consola, la capturadora y el monitor indicados, haz "match" de la cadena consola -> capturadora -> monitor.
${buildConsoleContext(request)}

${CONSOLE_PROFILE_RULES}
- No inventes URLs: deja "sources" como [].

${CONSOLE_PROFILE_JSON_SHAPE}`;

  const response = await chat(
    [
      { role: 'system', content: 'Eres un experto en streaming de consolas con OBS. Respondes solo en JSON valido.' },
      { role: 'user', content: knowledgePrompt },
    ],
    { model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b', temperature: 0.3, maxTokens: 2500 },
  );

  return parseJsonObject(response);
}

export async function getExplanationFromGroq(request: AIRecommendationExplanationRequest): Promise<unknown> {
  const { systemInfo, mode, platform, originalRecommendations, currentRecommendations, changedFields } = request;
  const prompt = `Eres un experto en configuracion de OBS para streaming y grabacion.
El usuario cambio manualmente una configuracion recomendada. Explica el probable resultado de estos cambios con lenguaje claro y util.

Contexto:
- Modo: ${mode}
- Plataforma: ${platform}
- CPU: ${systemInfo.cpu.model} (${systemInfo.cpu.cores} cores)
- GPU: ${systemInfo.gpu.model} ${systemInfo.gpu.vram}MB VRAM (Vendor: ${systemInfo.gpu.vendor})
- RAM: ${systemInfo.ram.total}GB
- Hardware NVENC disponible: ${systemInfo.gpu.hasNvenc ? 'Si' : 'No'}

Configuracion original:
- Resolucion: ${originalRecommendations.resolution}
- FPS: ${originalRecommendations.fps}
- Encoder: ${originalRecommendations.encoder}
- Bitrate de video: ${originalRecommendations.bitrate} kbps
- Bitrate de audio: ${originalRecommendations.audio_bitrate} kbps
- Formato de grabacion: ${originalRecommendations.recording_format}
- Calidad de grabacion: ${originalRecommendations.recording_quality}

Configuracion actual modificada:
- Resolucion: ${currentRecommendations.resolution}
- FPS: ${currentRecommendations.fps}
- Encoder: ${currentRecommendations.encoder}
- Bitrate de video: ${currentRecommendations.bitrate} kbps
- Bitrate de audio: ${currentRecommendations.audio_bitrate} kbps
- Formato de grabacion: ${currentRecommendations.recording_format}
- Calidad de grabacion: ${currentRecommendations.recording_quality}

Campos modificados: ${changedFields.join(', ')}

Responde en JSON con este formato exacto, sin texto adicional:
{
  "reasoning": "Explicacion breve en espanol: menciona calidad esperada, estabilidad probable, carga de CPU/GPU/red y cualquier riesgo concreto del cambio."
}`;

  const response = await chat([
    { role: 'system', content: 'Eres un experto en configuracion de OBS. Responde solo en JSON valido.' },
    { role: 'user', content: prompt },
  ]);

  return parseJsonObject(response);
}
