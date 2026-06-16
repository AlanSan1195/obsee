import { app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const installIdFile = 'install-id';
let cachedInstallId: string | null = null;

export async function getInstallId(): Promise<string> {
  if (cachedInstallId) return cachedInstallId;

  const filePath = path.join(app.getPath('userData'), installIdFile);

  try {
    const existingId = (await fs.readFile(filePath, 'utf8')).trim();
    if (existingId) {
      cachedInstallId = existingId;
      return existingId;
    }
  } catch {
    // A missing install id is expected on first launch.
  }

  const installId = randomUUID();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, installId, 'utf8');
  cachedInstallId = installId;
  return installId;
}
