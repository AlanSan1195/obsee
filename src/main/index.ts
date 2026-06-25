import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'path';
import { obsManager } from './obs-manager';
import dotenv from 'dotenv';
import type { AIRecommendationExplanationRequest, AIRecommendationRequest } from '../shared/types';
import { getLocalRecommendation, getLocalRecommendationExplanation } from '../shared/localRecommendation';
import {
  validateAIRecommendationExplanationRequest,
  validateAIRecommendationRequest,
  validateApplyGuidedSourceDevice,
  validateBeginGuidedSource,
  validateCreateGuidedSourceConfig,
  validateInputName,
  validateOBSAudioConfig,
  validateOBSConfig,
  validateOBSConnectionSettings,
  validateSceneName,
  validateSetCameraLayout,
} from '../shared/validation';
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

ipcMain.handle('obs:get-scenes', async () => {
  return obsManager.getScenesSnapshot();
});

ipcMain.handle('obs:create-scene', async (_, name: unknown) => {
  const validation = validateSceneName(name);
  if (!validation.success) {
    return { success: false, message: validation.message };
  }
  return obsManager.createScene(validation.value);
});

ipcMain.handle('obs:set-current-scene', async (_, name: unknown) => {
  const validation = validateSceneName(name);
  if (!validation.success) {
    return { success: false, message: validation.message };
  }
  return obsManager.setCurrentScene(validation.value);
});

ipcMain.handle('obs:remove-scene', async (_, name: unknown) => {
  const validation = validateSceneName(name);
  if (!validation.success) {
    return { success: false, message: validation.message };
  }
  return obsManager.removeScene(validation.value);
});

ipcMain.handle('obs:get-source-kinds', async () => {
  return obsManager.getAvailableSourceKinds();
});

ipcMain.handle('obs:get-scene-sources', async (_, name: unknown) => {
  const validation = validateSceneName(name);
  if (!validation.success) {
    return { success: false, message: validation.message };
  }
  return obsManager.getSceneSources(validation.value);
});

ipcMain.handle('obs:begin-guided-source', async (_, arg: unknown) => {
  const validation = validateBeginGuidedSource(arg);
  if (!validation.success) {
    return { success: false, message: validation.message, warnings: [] };
  }
  return obsManager.beginGuidedSource(validation.value.sceneName, validation.value.friendly);
});

ipcMain.handle('obs:apply-guided-source-device', async (_, arg: unknown) => {
  const validation = validateApplyGuidedSourceDevice(arg);
  if (!validation.success) {
    return { success: false, message: validation.message, warnings: [] };
  }
  return obsManager.applyGuidedSourceDevice(validation.value);
});

ipcMain.handle('obs:cancel-guided-source', async (_, name: unknown) => {
  const validation = validateInputName(name);
  if (!validation.success) {
    return { success: false, message: validation.message };
  }
  return obsManager.cancelGuidedSource(validation.value);
});

ipcMain.handle('obs:create-guided-source', async (_, arg: unknown) => {
  const validation = validateCreateGuidedSourceConfig(arg);
  if (!validation.success) {
    return { success: false, message: validation.message, warnings: [] };
  }
  return obsManager.createGuidedSource(validation.value);
});

ipcMain.handle('obs:remove-source', async (_, name: unknown) => {
  const validation = validateInputName(name);
  if (!validation.success) {
    return { success: false, message: validation.message };
  }
  return obsManager.removeInput(validation.value);
});

ipcMain.handle('obs:set-camera-layout', async (_, arg: unknown) => {
  const validation = validateSetCameraLayout(arg);
  if (!validation.success) {
    return { success: false, message: validation.message, warnings: [] };
  }
  return obsManager.setCameraLayout(validation.value.sceneName, validation.value.sceneItemId, validation.value.layout);
});

ipcMain.handle('obs:create-camera-scene', async (_, arg: unknown) => {
  if (typeof arg !== 'object' || arg === null) {
    return { success: false, message: 'Solicitud de escena de camara invalida.', warnings: [] };
  }
  const a = arg as { sceneName?: unknown; inputName?: unknown; deviceId?: unknown; propertyName?: unknown };
  const sceneName = validateSceneName(a.sceneName);
  if (!sceneName.success) return { success: false, message: sceneName.message, warnings: [] };
  const inputName = validateInputName(a.inputName);
  if (!inputName.success) return { success: false, message: inputName.message, warnings: [] };
  if (typeof a.deviceId !== 'string' || a.deviceId.trim().length === 0) {
    return { success: false, message: 'Selecciona una camara valida.', warnings: [] };
  }
  if (typeof a.propertyName !== 'string' || a.propertyName.trim().length === 0) {
    return { success: false, message: 'Falta la propiedad del dispositivo.', warnings: [] };
  }
  return obsManager.createCameraScene(sceneName.value, inputName.value, a.deviceId.trim(), a.propertyName.trim());
});

ipcMain.handle('obs:set-source-to-bottom', async (_, arg: unknown) => {
  if (
    typeof arg !== 'object' || arg === null
    || typeof (arg as { sceneName?: unknown }).sceneName !== 'string'
    || typeof (arg as { sceneItemId?: unknown }).sceneItemId !== 'number'
  ) {
    return { success: false, message: 'Solicitud de reordenado invalida.' };
  }
  const { sceneName, sceneItemId } = arg as { sceneName: string; sceneItemId: number };
  return obsManager.setSourceToBottom(sceneName, sceneItemId);
});

ipcMain.handle('obs:rename-source', async (_, arg: unknown) => {
  if (typeof arg !== 'object' || arg === null) {
    return { success: false, message: 'Solicitud de renombrado invalida.' };
  }
  const current = validateInputName((arg as { inputName?: unknown }).inputName);
  if (!current.success) return { success: false, message: current.message };
  const next = validateInputName((arg as { newInputName?: unknown }).newInputName);
  if (!next.success) return { success: false, message: next.message };
  return obsManager.renameInput(current.value, next.value);
});

ipcMain.handle('obs:set-source-enabled', async (_, arg: unknown) => {
  if (
    typeof arg !== 'object' || arg === null
    || typeof (arg as { sceneName?: unknown }).sceneName !== 'string'
    || typeof (arg as { sceneItemId?: unknown }).sceneItemId !== 'number'
    || typeof (arg as { enabled?: unknown }).enabled !== 'boolean'
  ) {
    return { success: false, message: 'Solicitud de visibilidad invalida.' };
  }
  const { sceneName, sceneItemId, enabled } = arg as { sceneName: string; sceneItemId: number; enabled: boolean };
  return obsManager.setSceneItemEnabled(sceneName, sceneItemId, enabled);
});

ipcMain.handle('obs:source-screenshot', async (_, arg: unknown) => {
  const sourceName = typeof arg === 'object' && arg !== null ? (arg as { sourceName?: unknown }).sourceName : undefined;
  const maxWidth = typeof arg === 'object' && arg !== null ? (arg as { maxWidth?: unknown }).maxWidth : undefined;
  if (typeof sourceName !== 'string' || sourceName.trim().length === 0) {
    return { success: false, message: 'Falta el nombre de la fuente.' };
  }
  return obsManager.getSourceScreenshot(sourceName, typeof maxWidth === 'number' ? maxWidth : undefined);
});

ipcMain.handle('obs:pick-image-file', async () => {
  if (!mainWindow) {
    return { canceled: true, filePath: undefined };
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecciona una imagen',
    filters: [{ name: 'Imagenes', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
    properties: ['openFile'],
  });
  return { canceled: result.canceled, filePath: result.filePaths[0] };
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
