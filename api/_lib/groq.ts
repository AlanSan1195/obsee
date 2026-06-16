import Groq from 'groq-sdk';
import type { AIRecommendationExplanationRequest, AIRecommendationRequest, AIServiceMessage } from '../../src/shared/types';

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

async function chat(messages: AIServiceMessage[]): Promise<string> {
  const completion = await getGroqClient().chat.completions.create({
    messages,
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    temperature: 0.7,
    max_tokens: 4000,
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
  const { systemInfo, mode, platform } = request;
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
