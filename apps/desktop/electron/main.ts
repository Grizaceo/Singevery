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

import { app, BrowserWindow, ipcMain, shell, session, desktopCapturer, globalShortcut, screen } from 'electron';
import * as path from 'path';
import { StateStore } from './core/stateStore';
import { loadDotEnv } from './services/env';
import { identifyFromAudio } from './services/audd';
import { createPersistentSettings, NULL_OFFSET_STORE, NULL_CALIBRATION_STORE } from './services/settings';
import type { OffsetStore, CalibrationStore } from './services/settings';
import { FileLyricsCache } from './services/cache/lyricsCache';
import { LyricsService } from './services/lyrics/lyricsService';
import { SmtcReader } from './services/smtc/smtcReader';
import { resolveSmtcSidecar } from './services/smtc/smtcPath';
import { pillBounds, expandedBounds, PILL_WIDTH, PILL_HEIGHT, type Rect } from './services/windowLayout';
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
let lyricsCache: FileLyricsCache | null = null;
let smtcReader: SmtcReader | null = null;
/** Bounds expandidos guardados al colapsar a pill; se restauran al expandir. */
let savedBounds: Rect | null = null;

/** Tamaño expandido por defecto (coincide con createWindow). */
const EXPANDED_WIDTH = 760;
const EXPANDED_HEIGHT = 560;
/** Acelerador del atajo SING (expandir + reconocer). */
const SING_ACCELERATOR = 'Ctrl+Alt+S';

function createWindow(): BrowserWindow {
  // En Linux/WSLg una ventana transparent+frameless con GPU deshabilitada NO
  // compositiona y queda totalmente invisible (aunque el contenido renderice).
  // Por eso en Linux usamos modo "ventana" opaca, con bordes y en la barra de
  // tareas: visible y manejable. En Windows/macOS mantenemos el overlay
  // transparente sin bordes (donde sí funciona). Forzable con ESPEJO_WINDOWED=1.
  const windowed = process.platform === 'linux' || process.env.ESPEJO_WINDOWED === '1';
  const overlay = !windowed;

  const win = new BrowserWindow({
    width: 760,
    height: 560,
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

  // Click-through: mientras se muestra la letra, el widget puede volverse
  // "intangible" para que los clics pasen a la app de detrás (un juego, etc.).
  // forward:true mantiene los eventos de movimiento llegando al renderer, así
  // el handle puede detectar el hover y reactivar la interacción.
  ipcMain.handle(
    'window:setClickThrough',
    (_event, ignore: boolean): { ok: boolean } => {
      if (mainWindow) {
        if (ignore) {
          mainWindow.setIgnoreMouseEvents(true, { forward: true });
        } else {
          mainWindow.setIgnoreMouseEvents(false);
        }
      }
      return { ok: true };
    },
  );

  // Modo widget: colapsar la ventana a la viñeta (pill) centrada arriba, o
  // restaurar los bounds expandidos guardados. El renderer es la fuente de
  // verdad del estado `collapsed` y lo comunica por IPC.
  ipcMain.handle(
    'window:setCollapsed',
    (_event, collapsed: boolean): { ok: boolean; collapsed: boolean } => {
      if (!mainWindow) return { ok: false, collapsed };
      if (collapsed) {
        const cur = mainWindow.getBounds();
        // Solo guardamos si no es ya la pill (evita pisar con bounds pill).
        if (cur.width !== PILL_WIDTH || cur.height !== PILL_HEIGHT) {
          savedBounds = cur;
        }
        const workArea = screen.getDisplayMatching(cur).workArea;
        mainWindow.setMinimumSize(PILL_WIDTH, PILL_HEIGHT);
        mainWindow.setBounds(pillBounds(workArea));
        mainWindow.setAlwaysOnTop(true);
      } else {
        mainWindow.setMinimumSize(320, 200);
        if (savedBounds) {
          mainWindow.setBounds(savedBounds);
          savedBounds = null;
        } else {
          // Sin bounds guardados (expand sin colapsar previo): centrar tamaño por defecto.
          const wa = screen.getPrimaryDisplay().workArea;
          mainWindow.setBounds(expandedBounds(wa, EXPANDED_WIDTH, EXPANDED_HEIGHT));
        }
      }
      return { ok: true, collapsed };
    },
  );

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

  // Nivel de audio capturado (0..1): alimenta la pausa del reloj por silencio.
  ipcMain.handle('recognition:level', (_event, level: number): { ok: boolean } => {
    stateStore?.reportAudioLevel(level);
    return { ok: true };
  });

  // Caché de letras: estadísticas y limpieza (para un futuro panel de settings).
  ipcMain.handle('cache:stats', (): { ok: boolean; entries: number; negatives: number; bytes: number } => {
    const s = lyricsCache?.stats() ?? { entries: 0, negatives: 0, bytes: 0 };
    return { ok: true, ...s };
  });

  ipcMain.handle('cache:clear', (): { ok: boolean } => {
    lyricsCache?.clear();
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

  // Calibración global de latencia (SYNC_OFFSET_MS persistido, P2.8).
  ipcMain.handle('sync:adjustCalibration', (_event, deltaMs: number): { ok: boolean; offsetMs: number } => {
    if (!stateStore) return { ok: false, offsetMs: 0 };
    stateStore.adjustCalibrationOffset(deltaMs);
    return { ok: true, offsetMs: stateStore.getCalibrationOffsetMs() };
  });

  ipcMain.handle('sync:getCalibration', (): { ok: boolean; offsetMs: number } => {
    return { ok: true, offsetMs: stateStore?.getCalibrationOffsetMs() ?? 0 };
  });
}

function bootstrap(): void {
  loadDotEnv();
  setupContentSecurityPolicy(session.defaultSession);
  setupMediaPermissions();
  setupSystemAudioCapture();
  mainWindow = createWindow();

  let offsetStore: OffsetStore = NULL_OFFSET_STORE;
  let calibrationStore: CalibrationStore = NULL_CALIBRATION_STORE;
  try {
    const settings = createPersistentSettings();
    offsetStore = settings.offsetStore;
    calibrationStore = settings.calibrationStore;
  } catch (err) {
    console.error('[settings ERROR] No se pudo inicializar el ajuste persistente:', err);
  }

  // Caché local de letras (cache-first): acelera re-escuchas y evita re-romanizar.
  // Si falla, LyricsService sigue funcionando sin caché (NULL_LYRICS_CACHE).
  let lyricsService: LyricsService;
  try {
    lyricsCache = new FileLyricsCache(path.join(app.getPath('userData'), 'cache'));
    lyricsService = new LyricsService(lyricsCache);
  } catch (err) {
    console.error('[cache ERROR] No se pudo inicializar la caché de letras:', err);
    lyricsService = new LyricsService();
  }

  stateStore = new StateStore(mainWindow, offsetStore, lyricsService, calibrationStore);
  stateStore.start(100); // 10 Hz
  registerIpcHandlers();
  registerSingShortcut();

  // Capa b: reproductor del SO (SMTC) como reloj maestro. No-op si no hay
  // sidecar ni Windows; AudD sigue como fallback. Ruta del sidecar:
  //   1. SMTC_SIDECAR (env) explícita; 2. autodetección native/smtc/dist.
  const smtcExe = resolveSmtcSidecar(process.env.SMTC_SIDECAR, smtcSidecarRoots());
  smtcReader = new SmtcReader(stateStore, smtcExe);
  smtcReader.start();
}

/**
 * Registra el atajo global Ctrl+Alt+S → emite 'command:sing' al renderer
 * (que expande la pill e inicia el reconocimiento). No-op si falla el registro
 * (p. ej. el acelerador ya está tomado por otra app).
 */
function registerSingShortcut(): void {
  const ok = globalShortcut.register(SING_ACCELERATOR, () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.webContents.send('command:sing');
    mainWindow.focus();
  });
  if (!ok) {
    console.warn(`[main] no se pudo registrar el atajo ${SING_ACCELERATOR} (quizá ya esté en uso).`);
  }
}

/**
 * Raíces candidatas donde buscar native/smtc/dist/espejo-smtc.exe.
 * Cubre dev (repo root desde __dirname y cwd) y empaquetado (resources).
 */
function smtcSidecarRoots(): string[] {
  // __dirname en dev compilado = dist-electron/electron → repo root = ../../../../
  const fromDirname = path.join(__dirname, '..', '..', '..', '..');
  return [
    process.cwd(),
    app.getAppPath(),
    fromDirname,
    // Recursos empaquetados (extraResources copia native/smtc/dist al root).
    process.resourcesPath,
  ].filter((r): r is string => typeof r === 'string' && r.length > 0);
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
    smtcReader?.stop();
    stateStore?.stop();
    globalShortcut.unregisterAll();
    app.quit();
  });

  app.on('before-quit', () => {
    smtcReader?.stop();
    stateStore?.stop();
    globalShortcut.unregisterAll();
  });
}
