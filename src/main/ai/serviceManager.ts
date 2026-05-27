import { groqService } from './groq';
import type { AIService, AIServiceMessage } from './types';

const services: AIService[] = [
  groqService,
];

let currentServiceIndex = 0;

function getNextService(): AIService {
  const service = services[currentServiceIndex];
  currentServiceIndex = (currentServiceIndex + 1) % services.length;
  return service;
}

export async function chatWithAI(messages: AIServiceMessage[]): Promise<string> {
  let lastError: Error | null = null;

  for (let i = 0; i < services.length; i++) {
    const service = getNextService();

    try {
      console.log(`[AI] Usando servicio: ${service.name}`);
      const stream = await service.chat(messages);

      let fullResponse = '';
      for await (const chunk of stream) {
        fullResponse += chunk;
      }

      return fullResponse;
    } catch (error) {
      console.error(`[AI] Error con ${service.name}:`, error);
      lastError = error as Error;
    }
  }

  throw lastError || new Error('Todos los servicios de IA fallaron');
}