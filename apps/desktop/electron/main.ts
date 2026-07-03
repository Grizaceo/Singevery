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
import {
  createPersistentSettings,
  NULL_OFFSET_STORE,
  NULL_CALIBRATION_STORE,
  NULL_DISPLAY_STORE,
  NULL_RECOGNITION_PROVIDER_STORE,
  NULL_TRANSLATION_STORE,
  NULL_READING_STORE,
  type AppSettings,
  type OffsetStore,
  type CalibrationStore,
  type DisplayStore,
  type RecognitionProviderStore,
  type TranslationStore,
  type ReadingStore,
} from './services/settings';
import { RecognitionService } from './services/recognition/recognitionService';
import { FileLyricsCache } from './services/cache/lyricsCache';
import { LyricsService } from './services/lyrics/lyricsService';
import { SmtcReader } from './services/smtc/smtcReader';
import { resolveSmtcSidecar } from './services/smtc/smtcPath';
import { WakeWordReader } from './services/wakeword/wakeWordReader';
import {
  pillBounds,
  expandedBounds,
  resolveInitialWindowBounds,
  isWindowBoundsVisible,
  PILL_WIDTH,
  PILL_HEIGHT,
  type Rect,
} from './services/windowLayout';
import type { RecognitionPhase } from './core/stateStore';
import { setupContentSecurityPolicy } from './csp';
import { createRemoteServer, type RemoteServer } from './services/remote/remoteServer';
import { AutoContrastService } from './services/autoContrast';

const isDev = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL;
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';

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
let wakeWordReader: WakeWordReader | null = null;
let recognitionService: RecognitionService | null = null;
let remoteServer: RemoteServer | null = null;
let autoContrast: AutoContrastService | null = null;
let appSettings: AppSettings | null = null;
/** Bounds expandidos guardados al colapsar a pill; se restauran al expandir. */
let savedBounds: Rect | null = null;
let boundsSaveTimer: NodeJS.Timeout | null = null;

/** Tamaño expandido por defecto (coincide con createWindow). */
const EXPANDED_WIDTH = 760;
const EXPANDED_HEIGHT = 560;
/** Acelerador del atajo SING (expandir + reconocer). */
const SING_ACCELERATOR = 'Ctrl+Alt+S';

function createWindow(): BrowserWindow {
  const windowed = process.platform === 'linux' || process.env.ESPEJO_WINDOWED === '1';
  const overlay = !windowed;

  const saved = appSettings?.windowBoundsStore.get() ?? null;
  const primary = screen.getPrimaryDisplay();
  const displays = screen.getAllDisplays().map((d) => d.bounds);
  const initialBounds = resolveInitialWindowBounds(
    saved,
    displays,
    primary.workArea,
    EXPANDED_WIDTH,
    EXPANDED_HEIGHT,
    isDev,
  );

  if (saved && !isWindowBoundsVisible(saved, displays)) {
    appSettings?.windowBoundsStore.set(null);
    if (isDev) {
      console.warn('[main] windowBounds guardados fuera de pantalla; reseteados:', saved);
    }
  } else if (isDev && saved) {
    console.log('[main] Dev: ignorando windowBounds guardados, centrando en monitor primario');
  }

  if (isDev) {
    console.log(`[main] Ventana en x=${initialBounds.x} y=${initialBounds.y} ${initialBounds.width}x${initialBounds.height}`);
  }

  const win = new BrowserWindow({
    x: initialBounds.x,
    y: initialBounds.y,
    width: initialBounds.width,
    height: initialBounds.height,
    minWidth: 320,
    minHeight: 200,
    title: 'Singevery',
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

  const showFallback = setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) {
      console.warn('[main] ready-to-show no disparó; forzando show()');
      win.show();
      win.focus();
    }
  }, 3000);

  win.once('ready-to-show', () => {
    clearTimeout(showFallback);
    win.show();
    win.focus();
  });
  win.once('closed', () => clearTimeout(showFallback));

  // Abrir links externos en el navegador, no dentro del widget.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL(devServerUrl);
    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      console.error(
        `[main] No se pudo cargar ${devServerUrl} (${errorCode}: ${errorDescription}). ` +
          '¿Vite está corriendo? Prueba npm run dev:kill && npm run dev:electron',
      );
    });
    if (process.env.OPEN_DEVTOOLS === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }

  attachWindowBoundsPersistence(win);

  return win;
}

/** Persiste posición/tamaño expandido (debounced) al mover o redimensionar. */
function attachWindowBoundsPersistence(win: BrowserWindow): void {
  const scheduleSave = (): void => {
    if (boundsSaveTimer) clearTimeout(boundsSaveTimer);
    boundsSaveTimer = setTimeout(() => {
      if (!appSettings || win.isDestroyed()) return;
      const b = win.getBounds();
      if (b.width === PILL_WIDTH && b.height === PILL_HEIGHT) return;
      appSettings.windowBoundsStore.set(b);
    }, 400);
  };

  win.on('move', scheduleSave);
  win.on('resize', scheduleSave);
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

  ipcMain.handle('window:getPosition', (): { ok: boolean; x: number; y: number } => {
    if (mainWindow) {
      const [x, y] = mainWindow.getPosition();
      return { ok: true, x, y };
    }
    return { ok: false, x: 0, y: 0 };
  });

  ipcMain.handle(
    'window:setPosition',
    (_event, x: number, y: number): { ok: boolean } => {
      if (mainWindow) {
        mainWindow.setPosition(Math.round(x), Math.round(y));
      }
      return { ok: true };
    },
  );

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
          const cur = mainWindow.getBounds();
          const wa = screen.getDisplayMatching(cur).workArea;
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
        const match = await recognitionService!.identify(Buffer.from(audio), mimeType);
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
        const match = await recognitionService!.identify(Buffer.from(audio), mimeType);
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

  ipcMain.handle('settings:getDisplay', (): { ok: boolean; display: ReturnType<DisplayStore['get']> } => {
    const display = appSettings?.displayStore.get() ?? NULL_DISPLAY_STORE.get();
    return { ok: true, display };
  });

  ipcMain.handle(
    'settings:setDisplay',
    (_event, partial: Partial<ReturnType<DisplayStore['get']>>): { ok: boolean; display: ReturnType<DisplayStore['get']> } => {
      if (!appSettings) return { ok: false, display: NULL_DISPLAY_STORE.get() };
      appSettings.displayStore.set(partial);
      stateStore?.applyDisplaySettings();
      autoContrast?.sync();
      return { ok: true, display: appSettings.displayStore.get() };
    },
  );

  ipcMain.handle('settings:getRecognitionProvider', (): { ok: boolean; provider: ReturnType<RecognitionProviderStore['get']> } => {
    const provider = appSettings?.recognitionProviderStore.get() ?? NULL_RECOGNITION_PROVIDER_STORE.get();
    return { ok: true, provider };
  });

  ipcMain.handle(
    'settings:setRecognitionProvider',
    (_event, provider: ReturnType<RecognitionProviderStore['get']>): { ok: boolean; provider: ReturnType<RecognitionProviderStore['get']> } => {
      if (!appSettings) return { ok: false, provider: NULL_RECOGNITION_PROVIDER_STORE.get() };
      appSettings.recognitionProviderStore.set(provider);
      return { ok: true, provider: appSettings.recognitionProviderStore.get() };
    },
  );

  ipcMain.handle('settings:getTranslation', (): { ok: boolean; translation: ReturnType<TranslationStore['get']> } => {
    const translation = appSettings?.translationStore.get() ?? NULL_TRANSLATION_STORE.get();
    return { ok: true, translation };
  });

  ipcMain.handle(
    'settings:setTranslation',
    (_event, partial: Partial<ReturnType<TranslationStore['get']>>): { ok: boolean; translation: ReturnType<TranslationStore['get']> } => {
      if (!appSettings) return { ok: false, translation: NULL_TRANSLATION_STORE.get() };
      appSettings.translationStore.set(partial);
      return { ok: true, translation: appSettings.translationStore.get() };
    },
  );

  ipcMain.handle('settings:getReading', (): { ok: boolean; reading: ReturnType<ReadingStore['get']> } => {
    const reading = appSettings?.readingStore.get() ?? NULL_READING_STORE.get();
    return { ok: true, reading };
  });

  ipcMain.handle(
    'settings:setReading',
    (_event, partial: Partial<ReturnType<ReadingStore['get']>>): { ok: boolean; reading: ReturnType<ReadingStore['get']> } => {
      if (!appSettings) return { ok: false, reading: NULL_READING_STORE.get() };
      appSettings.readingStore.set(partial);
      stateStore?.applyReadingSettings();
      return { ok: true, reading: appSettings.readingStore.get() };
    },
  );

  ipcMain.handle('lyrics:translate', async (): Promise<{ ok: boolean; error?: string }> => {
    if (!stateStore) return { ok: false, error: 'App no inicializada' };
    return stateStore.requestTranslation();
  });

  ipcMain.handle('remote:getStatus', (): {
    ok: boolean;
    enabled: boolean;
    running: boolean;
    micConnected: boolean;
    tvUrl: string;
    micUrl: string;
    ip: string;
    port: number;
  } => {
    const enabled = appSettings?.remoteSettingsStore.get().enabled ?? false;
    const info = remoteServer?.getInfo();
    return {
      ok: true,
      enabled,
      running: remoteServer?.isRunning() ?? false,
      micConnected: remoteServer?.isMicConnected() ?? false,
      tvUrl: info?.tvUrl ?? '',
      micUrl: info?.micUrl ?? '',
      ip: info?.ip ?? '',
      port: info?.port ?? 5175,
    };
  });

  ipcMain.handle(
    'remote:setEnabled',
    async (_event, enabled: boolean): Promise<{ ok: boolean; error?: string; status: ReturnType<typeof getRemoteStatusPayload> }> => {
      if (!appSettings) {
        return { ok: false, error: 'Ajustes no inicializados', status: getRemoteStatusPayload() };
      }
      appSettings.remoteSettingsStore.set({ enabled });
      try {
        await syncRemoteServer();
        notifyRemoteStatus();
        return { ok: true, status: getRemoteStatusPayload() };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo iniciar el servidor remoto';
        appSettings.remoteSettingsStore.set({ enabled: false });
        return { ok: false, error: message, status: getRemoteStatusPayload() };
      }
    },
  );
}

function getRemoteStatusPayload(): {
  enabled: boolean;
  running: boolean;
  micConnected: boolean;
  tvUrl: string;
  micUrl: string;
  ip: string;
  port: number;
} {
  const enabled = appSettings?.remoteSettingsStore.get().enabled ?? false;
  const info = remoteServer?.getInfo();
  return {
    enabled,
    running: remoteServer?.isRunning() ?? false,
    micConnected: remoteServer?.isMicConnected() ?? false,
    tvUrl: info?.tvUrl ?? '',
    micUrl: info?.micUrl ?? '',
    ip: info?.ip ?? '',
    port: info?.port ?? 5175,
  };
}

function notifyRemoteStatus(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('remote:status', getRemoteStatusPayload());
}

function buildRemoteServer(): RemoteServer {
  const staticDir = path.join(app.getAppPath(), 'dist');
  const certDir = path.join(app.getPath('userData'), 'remote-tls');
  const devProxyOrigin = isDev ? devServerUrl : undefined;

  return createRemoteServer({
    staticDir,
    certDir,
    devProxyOrigin,
    micHandlers: {
      onLevel: (level) => stateStore?.reportAudioLevel(level),
      onPhase: (phase) => stateStore?.setRecognitionPhase(phase),
      onMicConnected: (connected) => {
        notifyRemoteStatus();
        if (connected && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('remote:mic-active');
        }
      },
      onIdentify: async (audio, mimeType, recordStartedAt) => {
        if (!stateStore || !recognitionService) {
          return { ok: false, matched: false, error: 'App no inicializada' };
        }
        try {
          stateStore.setRecognitionPhase('IDENTIFYING');
          const match = await recognitionService.identify(audio, mimeType);
          if (!match) {
            stateStore.setRecognitionPhase('LISTENING');
            return { ok: true, matched: false };
          }
          await stateStore.applyMatch(match, recordStartedAt);
          return { ok: true, matched: true };
        } catch (err) {
          stateStore.setRecognitionPhase(null);
          const message = err instanceof Error ? err.message : 'Error desconocido';
          return { ok: false, matched: false, error: message };
        }
      },
      onCorrect: async (audio, mimeType, recordStartedAt) => {
        if (!stateStore || !recognitionService) {
          return { ok: false, matched: false, error: 'App no inicializada' };
        }
        try {
          const match = await recognitionService.identify(audio, mimeType);
          if (!match) return { ok: true, matched: false };
          const changed = await stateStore.applyMatch(match, recordStartedAt);
          return { ok: true, matched: true, changed };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error desconocido';
          return { ok: false, matched: false, error: message };
        }
      },
    },
  });
}

async function syncRemoteServer(): Promise<void> {
  const enabled = appSettings?.remoteSettingsStore.get().enabled ?? false;
  if (!enabled) {
    stateStore?.setRemoteBroadcast(null);
    remoteServer?.stop();
    return;
  }

  if (!remoteServer) {
    remoteServer = buildRemoteServer();
  }

  if (!remoteServer.isRunning()) {
    await remoteServer.start();
  }

  stateStore?.setRemoteBroadcast((model) => remoteServer?.broadcastModel(model));
}

function bootstrap(): void {
  loadDotEnv();
  setupContentSecurityPolicy(session.defaultSession);
  setupMediaPermissions();
  setupSystemAudioCapture();

  let offsetStore: OffsetStore = NULL_OFFSET_STORE;
  let calibrationStore: CalibrationStore = NULL_CALIBRATION_STORE;
  let displayStore: DisplayStore = NULL_DISPLAY_STORE;
  try {
    appSettings = createPersistentSettings();
    offsetStore = appSettings.offsetStore;
    calibrationStore = appSettings.calibrationStore;
    displayStore = appSettings.displayStore;
    recognitionService = new RecognitionService({
      getProviderMode: () => appSettings!.recognitionProviderStore.get(),
    });
  } catch (err) {
    console.error('[settings ERROR] No se pudo inicializar el ajuste persistente:', err);
    recognitionService = new RecognitionService({
      getProviderMode: () => NULL_RECOGNITION_PROVIDER_STORE.get(),
    });
  }

  mainWindow = createWindow();

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

  stateStore = new StateStore(
    mainWindow,
    offsetStore,
    lyricsService,
    calibrationStore,
    displayStore,
    appSettings?.translationStore ?? NULL_TRANSLATION_STORE,
    appSettings?.readingStore ?? NULL_READING_STORE,
  );
  stateStore.applyReadingSettings();
  stateStore.start(100); // 10 Hz

  if (appSettings) {
    autoContrast = new AutoContrastService(
      () => mainWindow,
      appSettings.displayStore,
      stateStore,
    );
    autoContrast.sync();
  }

  registerIpcHandlers();
  registerSingShortcut();

  // Capa b: reproductor del SO (SMTC) como reloj maestro. No-op si no hay
  // sidecar ni Windows; AudD sigue como fallback. Ruta del sidecar:
  //   1. SMTC_SIDECAR (env) explícita; 2. autodetección native/smtc/dist.
  const smtcExe = resolveSmtcSidecar(process.env.SMTC_SIDECAR, smtcSidecarRoots());
  smtcReader = new SmtcReader(stateStore, smtcExe);
  smtcReader.start();

  // Palabra wake opt-in (P3.9): si WAKEWORD_SIDECAR apunta a un ejecutable que
  // existe, lo lanza y dispara command:sing al detectar la palabra. Sin esa
  // env, es no-op (SING queda vía hotkey y pill).
  const wakeExe = process.env.WAKEWORD_SIDECAR?.trim() ?? '';
  wakeWordReader = new WakeWordReader(() => triggerSing(), wakeExe);
  wakeWordReader.start();

  void syncRemoteServer().then(() => notifyRemoteStatus()).catch((err) => {
    console.error('[remote ERROR] No se pudo iniciar el servidor LAN:', err);
    appSettings?.remoteSettingsStore.set({ enabled: false });
  });
}

/**
 * Dispara el comando SING: emite 'command:sing' al renderer (que expande la
 * pill e inicia el reconocimiento) y trae la ventana al frente. Lo usan el
 * atajo global Ctrl+Alt+S y la palabra wake (sidecar opt-in).
 */
function triggerSing(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.webContents.send('command:sing');
  mainWindow.focus();
}

/**
 * Registra el atajo global Ctrl+Alt+S → command:sing. No-op si falla el
 * registro (p. ej. el acelerador ya está tomado por otra app).
 */
function registerSingShortcut(): void {
  const ok = globalShortcut.register(SING_ACCELERATOR, () => {
    triggerSing();
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

// Solo una instancia en producción. En dev omitimos el lock (reinicios tras Ctrl+C).
const gotLock = isDev ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  console.error(
    '[main] Singevery ya está en ejecución. Cierra la otra ventana o ejecuta: npm run dev:kill',
  );
  app.quit();
} else {
  configureElectronRuntime();

  if (!isDev) {
    app.on('second-instance', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.center();
        mainWindow.setAlwaysOnTop(true);
        mainWindow.focus();
      }
    });
  }

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
    wakeWordReader?.stop();
    remoteServer?.stop();
    autoContrast?.dispose();
    stateStore?.stop();
    globalShortcut.unregisterAll();
    app.quit();
  });

  app.on('before-quit', () => {
    smtcReader?.stop();
    wakeWordReader?.stop();
    remoteServer?.stop();
    stateStore?.stop();
    globalShortcut.unregisterAll();
  });
}
