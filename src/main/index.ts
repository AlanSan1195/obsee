import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { obsManager } from './obs-manager';
import { chatWithAI } from './ai/serviceManager';
import dotenv from 'dotenv';
import type { AIRecommendationRequest } from '../shared/types';
import { getLocalRecommendation } from '../shared/localRecommendation';
import { validateAIRecommendation, validateAIRecommendationRequest, validateOBSAudioConfig, validateOBSConfig, validateOBSConnectionSettings } from '../shared/validation';

dotenv.config();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 800,
    minWidth: 700,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  obsManager.initialize();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('obs:connect', async (_, settings: unknown) => {
  const validation = validateOBSConnectionSettings(settings);
  if (!validation.success) {
    return { success: false, message: validation.message };
  }

  return obsManager.connect(validation.value);
});

ipcMain.handle('obs:disconnect', async () => {
  return obsManager.disconnect();
});

ipcMain.handle('obs:get-status', async () => {
  return obsManager.getStatus();
});

ipcMain.handle('obs:get-settings-snapshot', async () => {
  return obsManager.getSettingsSnapshot();
});

ipcMain.handle('obs:get-audio-snapshot', async () => {
  return obsManager.getAudioSnapshot();
});

ipcMain.handle('obs:configure', async (_, config: unknown) => {
  const validation = validateOBSConfig(config);
  if (!validation.success) {
    return { success: false, message: validation.message };
  }

  return obsManager.configure(validation.value);
});

ipcMain.handle('obs:configure-audio', async (_, config: unknown) => {
  const validation = validateOBSAudioConfig(config);
  if (!validation.success) {
    return { success: false, message: validation.message };
  }

  return obsManager.configureAudio(validation.value);
});

ipcMain.handle('system:get-info', async () => {
  const si = await import('systeminformation');
  const [cpu, gpu, mem, osInfo] = await Promise.all([
    si.cpu(),
    si.graphics(),
    si.mem(),
    si.osInfo(),
  ]);

  const gpuController = gpu.controllers[0];
  const hasNvenc = gpu.controllers.some(c => c.vendor === 'NVIDIA');

  return {
    cpu: {
      model: `${cpu.manufacturer} ${cpu.brand}`,
      cores: cpu.cores,
      speed: cpu.speed,
    },
    gpu: {
      model: gpuController?.model || 'Unknown',
      vram: gpuController?.vram || 0,
      vendor: gpuController?.vendor || 'Unknown',
      hasNvenc,
    },
    ram: {
      total: Math.round(mem.total / (1024 * 1024 * 1024)),
    },
    os: {
      platform: osInfo.platform,
      distro: osInfo.distro,
      release: osInfo.release,
    },
  };
});

ipcMain.handle('ai:get-recommendation', async (_, rawRequest: unknown) => {
  const validation = validateAIRecommendationRequest(rawRequest);
  if (!validation.success) {
    throw new Error(validation.message);
  }

  const request: AIRecommendationRequest = validation.value;
  const { systemInfo, mode, platform } = request;
  const prompt = `Eres un experto en configuración de OBS para streaming y grabación.
Analiza el hardware del usuario y recomienda la mejor configuración posible.

Preferencias del usuario:
- Modo: ${mode}
- Plataforma: ${platform}

Hardware disponible:
- CPU: ${systemInfo.cpu.model} (${systemInfo.cpu.cores} cores)
- GPU: ${systemInfo.gpu.model} ${systemInfo.gpu.vram}MB VRAM (Vendor: ${systemInfo.gpu.vendor})
- RAM: ${systemInfo.ram.total}GB
- OS: ${systemInfo.os.distro} ${systemInfo.os.release}
- Hardware NVENC disponible: ${systemInfo.gpu.hasNvenc ? 'Sí' : 'No'}

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
  "reasoning": "Explicación de por qué esta configuración es óptima para este hardware"
}`;

  try {
    const response = await chatWithAI([
      { role: 'system', content: 'Eres un experto en configuración de OBS. Responde solo en JSON.' },
      { role: 'user', content: prompt }
    ]);

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const recommendation = validateAIRecommendation(parsed);
      if (!recommendation.success) {
        throw new Error(recommendation.message);
      }
      return recommendation.value;
    }
    throw new Error('Respuesta de IA no contenía JSON válido');
  } catch (error) {
    console.error('Error getting AI recommendation:', error);
    return getLocalRecommendation(request);
  }
});
