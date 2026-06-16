import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { obsManager } from './obs-manager';
import dotenv from 'dotenv';
import type { AIRecommendationExplanationRequest, AIRecommendationRequest } from '../shared/types';
import { getLocalRecommendation, getLocalRecommendationExplanation } from '../shared/localRecommendation';
import { validateAIRecommendationExplanationRequest, validateAIRecommendationRequest, validateOBSAudioConfig, validateOBSConfig, validateOBSConnectionSettings } from '../shared/validation';
import { loadBackup } from './backup-store';
import { getRemoteAIUserMessage, getRemoteRecommendation, getRemoteRecommendationExplanation } from './ai/remote';

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
  obsManager.onStatusChange((status) => {
    mainWindow?.webContents.send('obs:connection-changed', status);
  });

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

ipcMain.handle('obs:get-last-backup', async () => {
  const backup = await loadBackup();
  return backup
    ? { success: true, message: 'Respaldo disponible', backup }
    : { success: false, message: 'No hay respaldo guardado' };
});

ipcMain.handle('obs:restore-last-backup', async () => {
  const backup = await loadBackup();
  if (!backup) {
    return { success: false, message: 'No hay respaldo guardado', warnings: [] };
  }
  return obsManager.restoreSnapshot(backup.snapshot);
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
  try {
    return await getRemoteRecommendation(request);
  } catch (error) {
    console.error('Error getting integrated AI recommendation:', error);
    const localRecommendation = getLocalRecommendation(request);
    return {
      ...localRecommendation,
      reasoning: `${localRecommendation.reasoning} IA integrada no disponible: ${getRemoteAIUserMessage(error)}`,
    };
  }
});

ipcMain.handle('ai:explain-recommendation', async (_, rawRequest: unknown) => {
  const validation = validateAIRecommendationExplanationRequest(rawRequest);
  if (!validation.success) {
    throw new Error(validation.message);
  }

  const request: AIRecommendationExplanationRequest = validation.value;
  try {
    return await getRemoteRecommendationExplanation(request);
  } catch (error) {
    console.error('Error explaining integrated AI recommendation:', error);
    const localExplanation = getLocalRecommendationExplanation(request);
    return {
      ...localExplanation,
      reasoning: `${localExplanation.reasoning} IA integrada no disponible: ${getRemoteAIUserMessage(error)}`,
    };
  }
});
