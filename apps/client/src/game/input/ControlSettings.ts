export interface ControlSettings {
  readonly mouseSensitivity: number;
  readonly touchSensitivity: number;
  readonly invertY: boolean;
}

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = {
  mouseSensitivity: 0.0025,
  touchSensitivity: 0.004,
  invertY: false,
};

export const CONTROL_SETTINGS_KEY = 'forest-survival.controls.v1';
export interface SettingsStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function sanitizeControlSettings(value: unknown): ControlSettings {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const sensitivity = (key: string, fallback: number) => typeof data[key] === 'number' && Number.isFinite(data[key]) ? Math.max(0.0005, Math.min(0.01, data[key])) : fallback;
  return {
    mouseSensitivity: sensitivity('mouseSensitivity', DEFAULT_CONTROL_SETTINGS.mouseSensitivity),
    touchSensitivity: sensitivity('touchSensitivity', DEFAULT_CONTROL_SETTINGS.touchSensitivity),
    invertY: typeof data.invertY === 'boolean' ? data.invertY : false,
  };
}

export function loadControlSettings(storage: SettingsStorage | undefined): ControlSettings {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(CONTROL_SETTINGS_KEY) ?? 'null');
    if (!saved || typeof saved !== 'object' || (saved as { version?: unknown }).version !== 1) return { ...DEFAULT_CONTROL_SETTINGS };
    return sanitizeControlSettings(saved);
  } catch { return { ...DEFAULT_CONTROL_SETTINGS }; }
}

export function saveControlSettings(storage: SettingsStorage | undefined, settings: ControlSettings): boolean {
  if (!storage) return false;
  try { storage.setItem(CONTROL_SETTINGS_KEY, JSON.stringify({ version: 1, ...sanitizeControlSettings(settings) })); return true; }
  catch { return false; }
}
