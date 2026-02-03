import { promises as fs } from 'fs';
import path from 'path';

export interface TelegramPreferences {
  outputMode: 'text' | 'voice';
  updatedAt: string;
}

const DEFAULT_PREFERENCES: TelegramPreferences = {
  outputMode: 'text',
  updatedAt: new Date().toISOString(),
};

function getPreferencesPath(): string {
  const basePath = process.env.APP_DIR || '/app';
  return path.join(basePath, 'state', 'telegram-preferences.json');
}

export async function getTelegramPreferences(): Promise<TelegramPreferences> {
  try {
    const content = await fs.readFile(getPreferencesPath(), 'utf-8');
    return JSON.parse(content);
  } catch {
    // File doesn't exist or is invalid, return defaults
    return { ...DEFAULT_PREFERENCES };
  }
}

export async function setTelegramPreferences(
  updates: Partial<TelegramPreferences>
): Promise<TelegramPreferences> {
  const current = await getTelegramPreferences();
  const updated: TelegramPreferences = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  const prefsPath = getPreferencesPath();

  // Ensure state directory exists
  await fs.mkdir(path.dirname(prefsPath), { recursive: true });

  await fs.writeFile(prefsPath, JSON.stringify(updated, null, 2));
  return updated;
}
