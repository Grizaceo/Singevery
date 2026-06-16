// ============================================================================
// main.ts — entry point del proceso main de Electron.
//
// Crea la ventana del widget: transparente, sin bordes, siempre encima,
// arrastrable, no aparece en la barra de tareas.
// Arranca el StateStore que emite el RenderModel al renderer por IPC.
//
// Fase 0: solo muestra el estado inicial ("Esperando música...").
// Fases 2-4 enchufarán reconocimiento + letras en StateStore.
// ============================================================================

import { app, BrowserWindow, ipcMain, shell, session, desktopCapturer } from 'electron';
import * as path from 'path';
import { StateStore } from './core/stateStore';
import { loadDotEnv } from './services/env';
import { identifyFromAudio } from './services/audd';
import { createPersistentOffsetStore, NULL_OFFSET_STORE } from './services/settings';
import type { OffsetStore } from './services/settings';
import type { RecognitionPhase } from './core/stateStore';
import { setupContentSecurityPolicy } from './csp';

const isDev = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL;
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5174';

/** Debe llamarse antes de app.whenReady(). */
function configureElectronRuntime(): void {
  if (process.env.ELECTRON_DISABLE_GPU === '1') {
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-gpu-sandbox');
  }
}

let mainWindow: BrowserWindow | null = null;
let stateStore: StateStore | null = null;

function createWindow(): BrowserWindow {
  // En Linux/WSLg una ventana transparent+frameless con GPU deshabilitada NO
  // compositiona y queda totalmente invisible (aunque el contenido renderice).
  // Por eso en Linux usamos modo "ventana" opaca, con bordes y en la barra de
  // tareas: visible y manejable. En Windows/macOS mantenemos el overlay
  // transparente sin bordes (donde sí funciona). Forzable con ESPEJO_WINDOWED=1.
  const windowed = process.platform === 'linux' || process.env.ESPEJO_WINDOWED === '1';
  const overlay = !windowed;

  const win = new BrowserWindow({
    width: 560,
    height: 420,
    minWidth: 320,
    minHeight: 200,
    title: 'Espejo Teleprompter',
    frame: overlay ? false : true,
    transparent: overlay,
    backgroundColor: overlay ? '#00000000' : '#0e0e12',
    resizable: !overlay, // overlay usa window:setSize por IPC; windowed permite resize nativo
    alwaysOnTop: overlay,
    skipTaskbar: overlay,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Clicks con -webkit-app-region: drag no llegan al renderer; el botón de
  // cierre (×) que vendrá en Fase 5 usará IPC, no problemas de captura aquí.

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  // Abrir links externos en el navegador, no dentro del widget.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL(devServerUrl);
    if (process.env.OPEN_DEVTOOLS === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }

  return win;
}

function setupMediaPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media' || (permission as string) === 'display-capture');
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media' || (permission as string) === 'display-capture';
  });
}

function setupSystemAudioCapture(): void {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen'] })
      .then((sources) => {
        const primary = sources[0];
        if (primary) {
          callback({ video: primary, audio: 'loopback' });
        } else {
          callback({});
        }
      })
      .catch(() => callback({}));
  });
}

function registerIpcHandlers(): void {
  // Window controls
  ipcMain.handle('window:minimize', (): { ok: boolean } => {
    mainWindow?.minimize();
    return { ok: true };
  });

  ipcMain.handle('window:close', (): { ok: boolean } => {
    mainWindow?.close();
    return { ok: true };
  });

  ipcMain.handle(
    'window:setSize',
    (_event, width: number, height: number): { ok: boolean } => {
      if (mainWindow) {
        const [minW, minH] = mainWindow.getMinimumSize();
        const safeWidth = Math.max(width, minW);
        const safeHeight = Math.max(height, minH);
        mainWindow.setSize(safeWidth, safeHeight);
      }
      return { ok: true };
    },
  );

  ipcMain.handle('window:getSize', (): { ok: boolean; width: number; height: number } => {
    if (mainWindow) {
      const [width, height] = mainWindow.getSize();
      return { ok: true, width, height };
    }
    return { ok: false, width: 0, height: 0 };
  });

  ipcMain.handle(
    'lyrics:load',
    async (_event, title: string, artist: string): Promise<{ ok: boolean; error?: string }> => {
      if (!stateStore) {
        return { ok: false, error: 'StateStore no inicializado' };
      }
      try {
        await stateStore.loadLyricsByMetadata(title, artist);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.handle(
    'recognition:setPhase',
    (_event, phase: RecognitionPhase): { ok: boolean } => {
      stateStore?.setRecognitionPhase(phase);
      return { ok: true };
    },
  );

  ipcMain.handle(
    'recognition:identify',
    async (
      _event,
      audio: ArrayBuffer,
      mimeType: string,
      recordStartedAt: number,
    ): Promise<{ ok: boolean; matched: boolean; error?: string }> => {
      if (!stateStore) {
        return { ok: false, matched: false, error: 'StateStore no inicializado' };
      }

      try {
        stateStore.setRecognitionPhase('IDENTIFYING');
        const match = await identifyFromAudio(Buffer.from(audio), mimeType);
        if (!match) {
          stateStore.setRecognitionPhase('LISTENING');
          return { ok: true, matched: false };
        }

        // applyMatch deja el estado en DISPLAYING/NO_LYRICS por su cuenta. NO
        // re-forzamos 'LISTENING' aquí: taparía la letra recién cargada (el
        // seguimiento continuo ya no llama a stopRecognition para limpiarlo).
        await stateStore.applyMatch(match, recordStartedAt);
        return { ok: true, matched: true };
      } catch (err) {
        stateStore.setRecognitionPhase(null);
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return { ok: false, matched: false, error: message };
      }
    },
  );

  // Corrección silenciosa de deriva: re-identifica sin tocar el overlay de
  // estado (la letra sigue visible). Si la canción cambió, recarga la letra.
  ipcMain.handle(
    'recognition:correct',
    async (
      _event,
      audio: ArrayBuffer,
      mimeType: string,
      recordStartedAt: number,
    ): Promise<{ ok: boolean; matched: boolean; changed?: boolean; error?: string }> => {
      if (!stateStore) {
        return { ok: false, matched: false, error: 'StateStore no inicializado' };
      }
      try {
        const match = await identifyFromAudio(Buffer.from(audio), mimeType);
        if (!match) return { ok: true, matched: false };
        const changed = await stateStore.applyMatch(match, recordStartedAt);
        return { ok: true, matched: true, changed };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return { ok: false, matched: false, error: message };
      }
    },
  );

  ipcMain.handle('recognition:stop', (): { ok: boolean } => {
    stateStore?.clearRecognition();
    return { ok: true };
  });

  // Sync: seek manual + offset crónico
  ipcMain.handle('sync:nudge', (_event, deltaMs: number): { ok: boolean } => {
    stateStore?.nudgePosition(deltaMs);
    return { ok: true };
  });

  ipcMain.handle('sync:seekLine', (_event, direction: -1 | 1): { ok: boolean } => {
    stateStore?.seekToLine(direction);
    return { ok: true };
  });

  ipcMain.handle('sync:adjustOffset', (_event, deltaMs: number): { ok: boolean; offsetMs: number } => {
    if (stateStore) {
      stateStore.adjustSyncOffset(deltaMs);
      return { ok: true, offsetMs: stateStore.getSyncOffsetMs() };
    }
    return { ok: false, offsetMs: 0 };
  });

  ipcMain.handle('sync:getOffset', (): { ok: boolean; offsetMs: number } => {
    return { ok: true, offsetMs: stateStore?.getSyncOffsetMs() ?? 0 };
  });
}

function bootstrap(): void {
  loadDotEnv();
  setupContentSecurityPolicy(session.defaultSession);
  setupMediaPermissions();
  setupSystemAudioCapture();
  mainWindow = createWindow();

  let offsetStore: OffsetStore = NULL_OFFSET_STORE;
  try {
    offsetStore = createPersistentOffsetStore();
  } catch (err) {
    console.error('[settings ERROR] No se pudo inicializar el offset persistente:', err);
  }

  stateStore = new StateStore(mainWindow, offsetStore);
  stateStore.start(100); // 10 Hz
  registerIpcHandlers();
}

// Solo se permite una instancia del widget.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  configureElectronRuntime();

  // Si se lanza una segunda instancia (p. ej. `npm run dev:electron` otra vez),
  // ésta se cierra por el single-instance lock y aquí resucitamos la ventana
  // existente. En WSLg una ventana transparente/always-on-top puede quedar
  // "perdida" (invisible/sin foco), así que la mostramos, centramos y subimos.
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.center();
      mainWindow.setAlwaysOnTop(true);
      mainWindow.focus();
    }
  });

  process.on('uncaughtException', (err) => {
    console.error('[main ERROR] uncaughtException:', err);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[main ERROR] unhandledRejection:', reason);
  });

  app.on('render-process-gone', (_event, details) => {
    console.error('[main ERROR] render-process-gone:', details);
  });

  app.on('child-process-gone', (_event, details) => {
    console.error('[main ERROR] child-process-gone:', details);
  });

  app.whenReady().then(bootstrap).catch((err) => {
    console.error('[main ERROR] bootstrap failed:', err);
  });

  app.on('window-all-closed', () => {
    stateStore?.stop();
    app.quit();
  });

  app.on('before-quit', () => {
    stateStore?.stop();
  });
}
