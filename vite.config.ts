import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { localApiPlugin } from './scripts/local-api-plugin';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Estas variables solo viven en el proceso Node de Vite; no se exponen al
  // frontend porque no llevan el prefijo VITE_. Tavily permite que Ollama use
  // especificaciones web reales durante las pruebas locales.
  const serverEnvironment = [
    'AI_PROVIDER',
    'OLLAMA_BASE_URL',
    'OLLAMA_MODEL',
    'OLLAMA_TIMEOUT_MS',
    'TAVILY_API_KEY',
  ] as const;

  for (const name of serverEnvironment) {
    if (!process.env[name] && env[name]) {
      process.env[name] = env[name];
    }
  }

  const useLocalApi = process.env.AI_PROVIDER?.trim().toLowerCase() === 'ollama';

  return {
    plugins: [react(), useLocalApi && localApiPlugin()],
    root: '.',
    base: './',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // Sin inline de assets: las fuentes Doto (~4KB) se incrustaban como data:
      // URIs y el CSP (font-src ausente -> default-src 'self') las bloqueaba.
      assetsInlineLimit: 0,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@shared': path.resolve(__dirname, 'src/shared'),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      // Solo el modo remoto usa produccion. El modo Ollama atiende /api dentro de Vite.
      ...(useLocalApi ? {} : {
        proxy: {
          '/api': {
            target: 'https://obsee.vercel.app',
            changeOrigin: true,
          },
        },
      }),
    },
  };
});
