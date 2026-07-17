import { chatWithAI, getAIProvider } from './ai-provider';
import {
  formatUntrustedWebEvidence,
  replaceProfileSources,
  selectTrustedWebEvidence,
  UNTRUSTED_WEB_EVIDENCE_INSTRUCTION,
} from './web-sources';
import type { AIRecommendationExplanationRequest, AIRecommendationRequest, ConsoleProfileRequest, MicProfileRequest } from '../../src/shared/types';

function formatGpuMemory(systemInfo: AIRecommendationRequest['systemInfo']): string {
  if (systemInfo.gpu.vram !== undefined && systemInfo.gpu.vram > 0) {
    return `${systemInfo.gpu.vram}MB VRAM`;
  }

  return systemInfo.gpu.vendor.toLowerCase() === 'apple'
    ? 'memoria unificada (VRAM separada no disponible)'
    : 'VRAM desconocida';
}

export function parseJsonObject(value: string): unknown {
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('AI response did not include JSON.');
  }

  return JSON.parse(match[0]);
}

async function searchWeb(
  query: string,
  includeDomains: string[] = [],
): Promise<{ results: string[]; sources: string[] }> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn('[tavily] TAVILY_API_KEY not configured, skipping web search');
    return { results: [], sources: [] };
  }

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: 8, // Buscar más para filtrar después
        include_answer: false,
        ...(includeDomains.length > 0 ? { include_domains: includeDomains } : {}),
      }),
    });

    if (!response.ok) {
      console.warn(`[tavily] API error: ${response.status}`, await response.text());
      return { results: [], sources: [] };
    }

    const data = await response.json() as { results?: Array<{ content: string; url: string; score?: number }> };
    const allResults = data.results ?? [];
    const { results, sources } = selectTrustedWebEvidence(allResults);

    console.log(`[tavily] Busqueda: "${query}"`);
    console.log(`[tavily] Encontrados: ${allResults.length} totales, ${sources.length} seleccionados`);

    return { results, sources };
  } catch (error) {
    console.warn('[tavily] Web search failed:', error instanceof Error ? error.message : error);
    return { results: [], sources: [] };
  }
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
- GPU: ${systemInfo.gpu.model} ${formatGpuMemory(systemInfo)} (Vendor: ${systemInfo.gpu.vendor})
- RAM: ${systemInfo.ram.total}GB
- OS: ${systemInfo.os.distro} ${systemInfo.os.release}
- Hardware NVENC disponible: ${systemInfo.gpu.hasNvenc ? 'Si' : 'No'}
${baselineSection}
Campos de resolucion:
- "canvas_resolution": lienzo base donde se acomodan las fuentes.
- "resolution": resolucion exclusiva del stream.
- "recording_resolution": resolucion del archivo grabado.
- Si el modo incluye stream y grabacion, separa ambas salidas cuando ayude a conservar calidad de grabacion sin exceder la plataforma de streaming.
- "encoder" y "bitrate" pertenecen exclusivamente al stream.
- "recording_encoder" y "recording_bitrate" pertenecen exclusivamente al archivo local. No reutilices el bitrate limitado del stream para grabar.
- En Apple Silicon, prefiere Apple VT H264 para el stream y Apple VT HEVC para grabacion local. Como referencia, 4K60 HEVC puede usar 40000 kbps; 4K60 H264 requiere aproximadamente 60000 kbps.

La explicacion debe tener un maximo de 90 palabras y lenguaje sencillo. Explica el match entre el hardware detectado y los ajustes, el resultado que obtiene el usuario y por que se separan stream y grabacion cuando aplique. Define cada termino dentro de su consecuencia practica: lienzo = area de trabajo, stream = lo que ve la audiencia, grabacion = archivo local, FPS = fluidez y encoder = quien comprime el video. Resalta los nombres y valores importantes con **doble asterisco**. No menciones el proceso interno, las fuentes ni que eres una IA.

Responde en JSON con este formato exacto, sin texto adicional:
{
  "recommendations": {
    "canvas_resolution": "1920x1080",
    "resolution": "1920x1080",
    "recording_resolution": "1920x1080",
    "fps": 60,
    "encoder": "nvenc",
    "bitrate": 6000,
    "recording_encoder": "nvenc",
    "recording_bitrate": 16000,
    "audio_bitrate": 320,
    "recording_format": "mkv",
    "recording_quality": "high"
  },
  "reasoning": "Explicacion breve del match entre hardware y configuracion"
}`;

  const response = await chatWithAI([
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

// Hibrido: intenta busqueda web via Tavily si TAVILY_API_KEY esta configurada.
// Si no, usa GROQ_SEARCH_MODEL ('groq/compound') si existe.
// Fallback: conocimiento del modelo (gpt-oss).
export async function getMicProfileFromGroq(request: MicProfileRequest): Promise<unknown> {
  let webContext = '';
  let webSources: string[] = [];

  // Intento 1: Tavily (sin tier especial, funciona en tier gratuito)
  if (process.env.TAVILY_API_KEY) {
    const { results, sources } = await searchWeb(`${request.deviceName} microphone specifications`);
    if (results.length > 0) {
      webContext = formatUntrustedWebEvidence(results);
      webSources = sources;
      console.log('[mic-profile] Web search via Tavily: exitoso');
    }
  }

  // Intento 2: GROQ_SEARCH_MODEL como fallback
  if (!webContext && getAIProvider() === 'groq' && process.env.GROQ_SEARCH_MODEL) {
    try {
      const webPrompt = `Eres un ingeniero de audio experto en OBS. Busca en la web las especificaciones OFICIALES del microfono indicado.
${buildMicContext(request)}

A partir de las caracteristicas reales del producto (tipo, conexion, sensibilidad, nivel de ruido propio, DSP integrado) decide que filtros de OBS conviene aplicar, ajustar u OMITIR para una voz clara y profesional.

${MIC_PROFILE_RULES}
- Incluye "sources" con 1-3 URLs oficiales del fabricante que respalden las specs.

${MIC_PROFILE_JSON_SHAPE}`;

      const response = await chatWithAI(
        [
          { role: 'system', content: 'Eres un ingeniero de audio experto en OBS. Usas busqueda web para confirmar specs y respondes solo en JSON valido.' },
          { role: 'user', content: webPrompt },
        ],
        { model: process.env.GROQ_SEARCH_MODEL, temperature: 0.3, maxTokens: null },
      );
      return replaceProfileSources(parseJsonObject(response), []);
    } catch (error) {
      console.warn('Busqueda web no disponible para el perfil de microfono, usando conocimiento del modelo:', error instanceof Error ? error.message : error);
    }
  }

  // Conocimiento del modelo (rapido, sin web). Funciona en el tier gratuito.
  const knowledgePrompt = `Eres un ingeniero de audio experto en OBS. A partir de tu conocimiento del microfono indicado, recomienda filtros de OBS.
${buildMicContext(request)}

Identifica tipo (condensador/dinamico/electret), conexion (USB/XLR/analogica) y si tiene DSP/cancelacion de ruido integrada, y decide que filtros aplicar, ajustar u OMITIR para una voz clara y profesional.

${MIC_PROFILE_RULES}
${webContext ? `- Contrasta las especificaciones usando solamente los datos delimitados a continuacion:\n${webContext}` : '- No inventes URLs: deja "sources" como [].'}

${MIC_PROFILE_JSON_SHAPE}`;

  const response = await chatWithAI(
    [
      { role: 'system', content: `Eres un ingeniero de audio experto en OBS. Respondes solo en JSON valido. ${UNTRUSTED_WEB_EVIDENCE_INSTRUCTION}` },
      { role: 'user', content: knowledgePrompt },
    ],
    { model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b', temperature: 0.3, maxTokens: 2000 },
  );

  return replaceProfileSources(parseJsonObject(response), webSources);
}

const CONSOLE_LABELS: Record<string, string> = {
  ps5: 'PlayStation 5',
  ps5_pro: 'PlayStation 5 Pro',
  xbox_series_x: 'Xbox Series X',
  xbox_series_s: 'Xbox Series S',
  switch: 'Nintendo Switch',
  switch2: 'Nintendo Switch 2',
};

const CONSOLE_OFFICIAL_DOMAINS: Record<string, string[]> = {
  ps5: ['playstation.com'],
  ps5_pro: ['playstation.com'],
  xbox_series_x: ['xbox.com'],
  xbox_series_s: ['xbox.com'],
  switch: ['nintendo.com'],
  switch2: ['nintendo.com'],
};

const HARDWARE_OFFICIAL_DOMAINS: Array<{ pattern: RegExp; domains: string[] }> = [
  { pattern: /elgato/i, domains: ['elgato.com'] },
  { pattern: /avermedia|live gamer/i, domains: ['avermedia.com'] },
  { pattern: /razer|ripsaw/i, domains: ['razer.com'] },
  { pattern: /ugreen/i, domains: ['ugreen.com'] },
  { pattern: /magewell/i, domains: ['magewell.com'] },
  { pattern: /blackmagic/i, domains: ['blackmagicdesign.com'] },
  { pattern: /atomos/i, domains: ['atomos.com'] },
  { pattern: /corsair/i, domains: ['corsair.com'] },
  { pattern: /\blg\b/i, domains: ['lg.com'] },
  { pattern: /samsung/i, domains: ['samsung.com'] },
  { pattern: /asus/i, domains: ['asus.com'] },
  { pattern: /acer/i, domains: ['acer.com'] },
  { pattern: /dell|alienware/i, domains: ['dell.com'] },
  { pattern: /benq/i, domains: ['benq.com'] },
  { pattern: /\bmsi\b/i, domains: ['msi.com'] },
];

function cleanDetectedHardwareName(value: string | undefined): string {
  return (value ?? '')
    .replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getOfficialDomains(value: string | undefined): string[] {
  const match = HARDWARE_OFFICIAL_DOMAINS.find(({ pattern }) => pattern.test(value ?? ''));
  return match?.domains ?? [];
}

function isKnownHardwareName(value: string): boolean {
  return value.length > 2 && !/^(unknown|desconocido|display|monitor|default)/i.test(value);
}

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
    "canvas_resolution": "3840x2160",
    "resolution": "1920x1080",
    "recording_resolution": "3840x2160",
    "fps": 60,
    "encoder": "nvenc",
    "bitrate": 6000,
    "recording_encoder": "nvenc",
    "recording_bitrate": 60000,
    "audio_bitrate": 320,
    "recording_format": "mkv",
    "recording_quality": "high"
  },
  "reasoning": "explicacion general en espanol"
}`;

const CONSOLE_PROFILE_RULES = `Reglas:
- La capturadora suele ser el cuello de botella: distingue su resolucion/fps de CAPTURA (lo que graba OBS) de su PASSTHROUGH (lo que pasa al monitor). Muchas baratas pasan 4K pero capturan 1080p30/60.
- "captureResolution"/"captureFps" = lo maximo que conviene capturar = el MENOR techo entre consola y capturadora.
- "canvas_resolution" es el lienzo base de OBS y debe preservar la resolucion nativa de captura cuando el hardware pueda procesarla.
- "resolution" es EXCLUSIVAMENTE la salida del stream. Ajustala a la plataforma; en Twitch normalmente 1920x1080 aunque se capture y grabe en 4K.
- "recording_resolution" es la resolucion del archivo grabado. Si el modo incluye grabacion y la capturadora entrega 4K60, conserva 3840x2160 cuando el hardware de la PC pueda codificarlo.
- "encoder"/"bitrate" son solo para emision; "recording_encoder"/"recording_bitrate" son solo para el archivo local y deben recomendarse por separado.
- En una Mac Apple Silicon, usa Apple VT H264 para el stream y Apple VT HEVC para la grabacion. Para grabacion 4K60 usa 40000 kbps con HEVC; con H264 usa alrededor de 60000 kbps. Nunca reduzcas la grabacion al bitrate del stream.
- En modo "stream_record", lienzo/grabacion y stream pueden ser distintos: por ejemplo 3840x2160 para lienzo y grabacion, 1920x1080 para Twitch.
- "recommendations" son los ajustes de OBS en la PC: usa el hardware de la PC para "encoder"/"bitrate" y nunca superes el techo real de la capturadora.
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

// Hibrido: intenta busqueda web via Tavily si TAVILY_API_KEY esta configurada.
// Si no, usa GROQ_SEARCH_MODEL ('groq/compound') si existe.
// Fallback: conocimiento del modelo (gpt-oss).
export async function getConsoleProfileFromGroq(request: ConsoleProfileRequest): Promise<unknown> {
  let webContext = '';
  let webSources: string[] = [];
  const webEvidence: string[] = [];

  // Intento 1: Tavily (sin tier especial, funciona en tier gratuito)
  if (process.env.TAVILY_API_KEY) {
    const consoleName = CONSOLE_LABELS[request.console] ?? request.console;
    const captureName = cleanDetectedHardwareName(request.captureCard);
    const monitorName = cleanDetectedHardwareName(request.monitor);
    const searchQueries = [
      {
        query: `"${consoleName}" technical specifications resolution fps`,
        domains: CONSOLE_OFFICIAL_DOMAINS[request.console] ?? [],
      },
      {
        query: `"${captureName}" technical specifications capture resolution fps`,
        domains: getOfficialDomains(captureName),
      },
      ...(isKnownHardwareName(monitorName) ? [{
        query: `"${monitorName}" technical specifications resolution refresh rate HDR`,
        domains: getOfficialDomains(monitorName),
      }] : []),
    ];

    const searches = await Promise.all(searchQueries.map(async ({ query, domains }) => ({
      query,
      ...await searchWeb(query, domains),
    })));

    for (const { query, results, sources } of searches) {
      if (results.length > 0) {
        webEvidence.push(`${query}:\n${results.join('\n')}`);
        // Reserva espacio para ambas piezas de la cadena; evita que cuatro
        // resultados de la consola oculten todas las fuentes de la capturadora.
        webSources = [...webSources, ...sources.slice(0, 2)];
      }
    }

    webContext = formatUntrustedWebEvidence(webEvidence);

    if (webContext) {
      console.log('[console-profile] Web search via Tavily: exitoso');
    }
  }

  // Intento 2: GROQ_SEARCH_MODEL como fallback
  if (!webContext && getAIProvider() === 'groq' && process.env.GROQ_SEARCH_MODEL) {
    try {
      const webPrompt = `Eres un experto en streaming de consolas con OBS. Busca en la web las especificaciones OFICIALES de la consola, la capturadora y el monitor indicados, y haz "match" de la cadena consola -> capturadora -> monitor.
${buildConsoleContext(request)}

${CONSOLE_PROFILE_RULES}
- Incluye "sources" con 1-3 URLs oficiales que respalden las specs.

${CONSOLE_PROFILE_JSON_SHAPE}`;

      const response = await chatWithAI(
        [
          { role: 'system', content: 'Eres un experto en streaming de consolas con OBS. Usas busqueda web para confirmar specs y respondes solo en JSON valido.' },
          { role: 'user', content: webPrompt },
        ],
        { model: process.env.GROQ_SEARCH_MODEL, temperature: 0.3, maxTokens: null },
      );
      return replaceProfileSources(parseJsonObject(response), []);
    } catch (error) {
      console.warn('Busqueda web no disponible para el perfil de consola, usando conocimiento del modelo:', error instanceof Error ? error.message : error);
    }
  }

  const knowledgePrompt = `Eres un experto en streaming de consolas con OBS. A partir de tu conocimiento de la consola, la capturadora y el monitor indicados, haz "match" de la cadena consola -> capturadora -> monitor.
${buildConsoleContext(request)}

${CONSOLE_PROFILE_RULES}
${webContext ? `- Contrasta las especificaciones usando solamente los datos delimitados a continuacion:\n${webContext}` : '- No inventes URLs: deja "sources" como [].'}

${CONSOLE_PROFILE_JSON_SHAPE}`;

  const response = await chatWithAI(
    [
      { role: 'system', content: `Eres un experto en streaming de consolas con OBS. Respondes solo en JSON valido. ${UNTRUSTED_WEB_EVIDENCE_INSTRUCTION}` },
      { role: 'user', content: knowledgePrompt },
    ],
    { model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b', temperature: 0.3, maxTokens: 2500 },
  );

  return replaceProfileSources(parseJsonObject(response), webSources);
}

export async function getExplanationFromGroq(request: AIRecommendationExplanationRequest): Promise<unknown> {
  const { systemInfo, mode, platform, originalRecommendations, currentRecommendations, changedFields } = request;
  const prompt = `Eres un experto en configuracion de OBS para streaming y grabacion.
El usuario cambio manualmente una configuracion recomendada. Explica el probable resultado de estos cambios con lenguaje claro y util.

Contexto:
- Modo: ${mode}
- Plataforma: ${platform}
- CPU: ${systemInfo.cpu.model} (${systemInfo.cpu.cores} cores)
- GPU: ${systemInfo.gpu.model} ${formatGpuMemory(systemInfo)} (Vendor: ${systemInfo.gpu.vendor})
- RAM: ${systemInfo.ram.total}GB
- Hardware NVENC disponible: ${systemInfo.gpu.hasNvenc ? 'Si' : 'No'}

Configuracion original:
- Lienzo base: ${originalRecommendations.canvas_resolution}
- Resolucion del stream: ${originalRecommendations.resolution}
- Resolucion de grabacion: ${originalRecommendations.recording_resolution}
- FPS: ${originalRecommendations.fps}
- Encoder del stream: ${originalRecommendations.encoder}
- Bitrate del stream: ${originalRecommendations.bitrate} kbps
- Encoder de grabacion: ${originalRecommendations.recording_encoder}
- Bitrate de grabacion: ${originalRecommendations.recording_bitrate} kbps
- Bitrate de audio: ${originalRecommendations.audio_bitrate} kbps
- Formato de grabacion: ${originalRecommendations.recording_format}
- Calidad de grabacion: ${originalRecommendations.recording_quality}

Configuracion actual modificada:
- Lienzo base: ${currentRecommendations.canvas_resolution}
- Resolucion del stream: ${currentRecommendations.resolution}
- Resolucion de grabacion: ${currentRecommendations.recording_resolution}
- FPS: ${currentRecommendations.fps}
- Encoder del stream: ${currentRecommendations.encoder}
- Bitrate del stream: ${currentRecommendations.bitrate} kbps
- Encoder de grabacion: ${currentRecommendations.recording_encoder}
- Bitrate de grabacion: ${currentRecommendations.recording_bitrate} kbps
- Bitrate de audio: ${currentRecommendations.audio_bitrate} kbps
- Formato de grabacion: ${currentRecommendations.recording_format}
- Calidad de grabacion: ${currentRecommendations.recording_quality}

Campos modificados: ${changedFields.join(', ')}

Escribe un maximo de 90 palabras. Empieza indicando que ajuste cambio, de que valor a cual, y resalta con **doble asterisco** el nombre del ajuste y sus valores. Despues explica el resultado concreto: calidad visible, fluidez, estabilidad, carga de CPU/GPU, consumo de red o tamano de archivo segun corresponda. Compara contra la recomendacion original y termina con un riesgo o beneficio claro. No repitas toda la configuracion ni menciones que eres una IA.
Reglas tecnicas obligatorias: x264 codifica con el CPU y aumenta su carga frente a un encoder por hardware. NVENC, Apple VT, QSV y AMD usan hardware dedicado y normalmente reducen la carga del CPU. Nunca afirmes lo contrario. Cambiar el encoder del stream no cambia directamente la calidad de la grabacion si esta usa su propio recording_encoder.

Responde en JSON con este formato exacto, sin texto adicional:
{
  "reasoning": "Explicacion breve en espanol: menciona calidad esperada, estabilidad probable, carga de CPU/GPU/red y cualquier riesgo concreto del cambio."
}`;

  const response = await chatWithAI([
    { role: 'system', content: 'Eres un experto en configuracion de OBS. Responde solo en JSON valido.' },
    { role: 'user', content: prompt },
  ]);

  return parseJsonObject(response);
}
