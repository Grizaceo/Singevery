// ============================================================================
// micPrefs.ts — preferencias de micrófono del renderer (F4).
// Persistidas en localStorage; las leen capture.ts y usePitchMonitor para
// TODA captura de audio, y SettingsPanel para la viñeta "Micrófono".
// ============================================================================

export interface MicrophonePrefs {
  deviceId?: string;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
}

export const MIC_PREFS_KEY = 'espejo.mic.prefs';

export const DEFAULT_MIC_PREFS: MicrophonePrefs = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
};

export function readMicrophonePrefs(): MicrophonePrefs {
  try {
    const raw = localStorage.getItem(MIC_PREFS_KEY);
    if (raw) return { ...DEFAULT_MIC_PREFS, ...(JSON.parse(raw) as Partial<MicrophonePrefs>) };
  } catch {
    /* almacenamiento bloqueado o JSON corrupto: usar defaults */
  }
  return DEFAULT_MIC_PREFS;
}

export function writeMicrophonePrefs(prefs: MicrophonePrefs): void {
  try {
    localStorage.setItem(MIC_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* almacenamiento bloqueado: la preferencia no persiste, no es fatal */
  }
}
