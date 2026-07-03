// ============================================================================
// preload.ts — bridge seguro entre el renderer y el proceso main.
//
// Expone `window.api.onRenderModel(cb)` al renderer. El callback recibe el
// RenderModel cada vez que el StateStore emite una actualización (~10 Hz).
// Devuelve una función para desuscribirse (limpieza en useEffect).
// ============================================================================

import { contextBridge, ipcRenderer } from 'electron';
import type { RenderModel, DesktopApi } from '../src/types';

const api = {
  onRenderModel: (cb: (model: RenderModel) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, model: RenderModel): void => {
      cb(model);
    };
    ipcRenderer.on('render:model', listener);
    return () => {
      ipcRenderer.removeListener('render:model', listener);
    };
  },

  onSingCommand: (cb: () => void): (() => void) => {
    const listener = (): void => cb();
    ipcRenderer.on('command:sing', listener);
    return () => {
      ipcRenderer.removeListener('command:sing', listener);
    };
  },

  // Window controls
  close: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('window:close'),
  setSize: (width: number, height: number): Promise<{ ok: boolean }> => ipcRenderer.invoke('window:setSize', width, height),
  getSize: (): Promise<{ ok: boolean; width: number; height: number }> => ipcRenderer.invoke('window:getSize'),
  getPosition: (): Promise<{ ok: boolean; x: number; y: number }> => ipcRenderer.invoke('window:getPosition'),
  setPosition: (x: number, y: number): Promise<{ ok: boolean }> => ipcRenderer.invoke('window:setPosition', x, y),
  setClickThrough: (ignore: boolean): Promise<{ ok: boolean }> => ipcRenderer.invoke('window:setClickThrough', ignore),
  setCollapsed: (collapsed: boolean): Promise<{ ok: boolean; collapsed: boolean }> => ipcRenderer.invoke('window:setCollapsed', collapsed),

  loadLyrics: (title: string, artist: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('lyrics:load', title, artist),

  setRecognitionPhase: (phase: 'LISTENING' | 'IDENTIFYING' | null): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('recognition:setPhase', phase),

  identifyAudio: (
    audio: ArrayBuffer,
    mimeType: string,
    recordStartedAt: number,
  ): Promise<{ ok: boolean; matched: boolean; error?: string }> =>
    ipcRenderer.invoke('recognition:identify', audio, mimeType, recordStartedAt),

  correctAudio: (
    audio: ArrayBuffer,
    mimeType: string,
    recordStartedAt: number,
  ): Promise<{ ok: boolean; matched: boolean; changed?: boolean; error?: string }> =>
    ipcRenderer.invoke('recognition:correct', audio, mimeType, recordStartedAt),

  stopRecognition: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('recognition:stop'),

  reportLevel: (level: number): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('recognition:level', level),

  // Caché de letras
  cacheStats: (): Promise<{ ok: boolean; entries: number; negatives: number; bytes: number }> =>
    ipcRenderer.invoke('cache:stats'),
  cacheClear: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('cache:clear'),

  // Sync: seek manual + offset crónico por pista
  nudgeSync: (deltaMs: number): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('sync:nudge', deltaMs),
  seekLine: (direction: -1 | 1): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('sync:seekLine', direction),
  adjustSyncOffset: (deltaMs: number): Promise<{ ok: boolean; offsetMs: number }> =>
    ipcRenderer.invoke('sync:adjustOffset', deltaMs),
  getSyncOffset: (): Promise<{ ok: boolean; offsetMs: number }> =>
    ipcRenderer.invoke('sync:getOffset'),

  // Calibración global de latencia (SYNC_OFFSET_MS persistido, P2.8)
  adjustSyncCalibration: (deltaMs: number): Promise<{ ok: boolean; offsetMs: number }> =>
    ipcRenderer.invoke('sync:adjustCalibration', deltaMs),
  getSyncCalibration: (): Promise<{ ok: boolean; offsetMs: number }> =>
    ipcRenderer.invoke('sync:getCalibration'),

  getDisplaySettings: (): Promise<{ ok: boolean; display: import('../src/types').DisplaySettings }> =>
    ipcRenderer.invoke('settings:getDisplay'),

  setDisplaySettings: (
    partial: Partial<import('../src/types').DisplaySettings>,
  ): Promise<{ ok: boolean; display: import('../src/types').DisplaySettings }> =>
    ipcRenderer.invoke('settings:setDisplay', partial),

  getRecognitionProvider: (): Promise<{ ok: boolean; provider: import('../src/types').RecognitionProviderMode }> =>
    ipcRenderer.invoke('settings:getRecognitionProvider'),

  setRecognitionProvider: (
    provider: import('../src/types').RecognitionProviderMode,
  ): Promise<{ ok: boolean; provider: import('../src/types').RecognitionProviderMode }> =>
    ipcRenderer.invoke('settings:setRecognitionProvider', provider),
};

contextBridge.exposeInMainWorld('api', api);

export type { DesktopApi };
export type PreloadApi = typeof api;
