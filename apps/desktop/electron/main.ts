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

import { app, BrowserWindow, dialog, ipcMain, shell, session, globalShortcut, screen } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'path';
import { pathToFileURL } from 'node:url';
import { StateStore } from './core/stateStore';
import { MatchLog, recognitionLogFields } from './core/matchLog';
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
import { AutoContrastService } from './services/autoContrast';
import { getLogFilePath, initAppLogger, readRecentLog } from './services/appLogger';
import { parseImportedLyrics } from './services/importLyrics';
import {
  resolveDiagnosticsPort,
  startDiagnosticsServer,
  type DiagnosticsServerHandle,
} from './services/diagnostics/diagnosticsServer';
import {
  ReferenceStore,
  buildReferenceFile,
  parseReferenceFile,
  suggestedFileName,
  toMeta,
  type SaveReferenceInput,
} from './services/references/referenceStore';
import {
  MAX_REFERENCE_FILE_BYTES,
  REFERENCE_FILE_EXTENSION,
  type ReferenceMelody,
  type ReferenceMeta,
} from './services/references/referenceTypes';
import { romanizeTimedLyrics } from './services/romanize';
import {
  buildSupportIssueUrl,
  buildSupportTicketFile,
  createSupportTicketId,
  validateSupportTicketDraft,
} from './services/supportTicket';
import type { SupportTicketDraft } from '../src/types';

const isDev = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL;
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';
/** URL exacta de la UI empaquetada (producción): única navegación permitida. */
const appIndexUrl = pathToFileURL(path.join(__dirname, '..', '..', 'dist', 'index.html')).href;

/** S3: destinos externos permitidos para openExternal (https únicamente). */
const ALLOWED_EXTERNAL_HOSTS = new Set(['github.com', 'www.tofugu.com']);

/**
 * S3: abre URLs externas SOLO si son https a destinos permitidos. Cualquier
 * otro protocolo (file:, ms-*, etc.) u host se bloquea: un window.open o un
 * enlace manipulado no debe poder escapar del widget.
 * Rechaza (no resuelve) cuando bloquea: el llamador debe saber que el enlace
 * no se abrió (BAJA 9 del audit Opus).
 */
function openExternalSafe(url: string): Promise<void> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname)) {
      return shell.openExternal(url);
    }
  } catch {
    /* URL inválida */
  }
  console.warn(`[main] openExternal bloqueado (destino no permitido): ${url}`);
  return Promise.reject(new Error(`Destino no permitido: ${url}`));
}

/** S2: la ventana solo navega a su propia UI. Comparación exacta, no prefijo
 *  (MEDIA 8 del audit Opus): startsWith('file://') permitía cualquier ruta
 *  local y startsWith(devServerUrl) aceptaba localhost:5173.evil.com. */
function isAllowedNavigation(url: string): boolean {
  try {
    if (isDev) {
      return new URL(url).origin === new URL(devServerUrl).origin;
    }
    return url.split('#')[0].split('?')[0] === appIndexUrl;
  } catch {
    return false;
  }
}

/** BAJA 12: defensa en profundidad — solo el frame principal de la ventana
 *  puede invocar IPC que muta estado o abre URLs. Con sandbox +
 *  contextIsolation no hay camino práctico para un webContents ajeno, pero
 *  si la navegación restringida fallara, esto sigue cerrando la puerta. */
function isTrustedSender(event: Electron.IpcMainInvokeEvent): boolean {
  return !!mainWindow && !mainWindow.isDestroyed() && event.senderFrame === mainWindow.webContents.mainFrame;
}

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
let matchLog: MatchLog | null = null;
let lyricsCache: FileLyricsCache | null = null;
let smtcReader: SmtcReader | null = null;
let wakeWordReader: WakeWordReader | null = null;
let recognitionService: RecognitionService | null = null;
let autoContrast: AutoContrastService | null = null;
let appSettings: AppSettings | null = null;
/** Endpoint HTTP de diagnóstico (solo si SINGEVERY_DEBUG_PORT está puesto). */
let diagnosticsServer: DiagnosticsServerHandle | null = null;
/** Melodías de referencia grabadas por el profesor (solo curva, solo local). */
let referenceStore: ReferenceStore | null = null;
/** Arranque del proceso: base del uptime que reporta /debug. */
const processStartedAt = Date.now();
/** Bounds expandidos guardados al colapsar a pill; se restauran al expandir. */
let savedBounds: Rect | null = null;
let boundsSaveTimer: NodeJS.Timeout | null = null;
/** Época de reconocimiento: se incrementa al detener; invalida identificaciones en vuelo (F2). */
let recognitionEpoch = 0;

/** Tamaño expandido por defecto (coincide con createWindow). */
const EXPANDED_WIDTH = 760;
const SUPPORT_ISSUES_URL = 'https://github.com/Grizaceo/Singevery/issues/new';
const EXPANDED_HEIGHT = 560;
/** Acelerador del atajo SING (expandir + reconocer). */
const SING_ACCELERATOR = 'Ctrl+Alt+S';
/** Fuerza el modo tangible (agarrar el widget sin depender del hover). */
const TANGIBLE_ACCELERATOR = 'Ctrl+Alt+T';
/** Píxeles que se mueve el widget con cada pulsación de flecha. */
const MOVE_STEP_PX = 40;
/** Límite defensivo para documentos de letra abiertos desde disco. */
const MAX_IMPORTED_LYRICS_BYTES = 2 * 1024 * 1024;

/**
 * Modo tangible forzado.
 *
 * Normalmente el widget alterna click-through según el hover del handle. Eso
 * falla cuando hay un juego a pantalla completa: el juego captura el mouse, el
 * overlay nunca recibe el hover y por tanto NUNCA se vuelve agarrable — no hay
 * forma de moverlo si estorba. Este bloqueo se activa por atajo de teclado (no
 * necesita mouse) y mientras esté puesto el widget ignora las peticiones de
 * click-through del renderer: manda el teclado.
 */
let tangibleLock = false;

function collectDiagnostics(includeRecentLog = true): Record<string, unknown> {
  const cache = lyricsCache?.stats() ?? { entries: 0, negatives: 0, bytes: 0 };
  return {
    generatedAt: new Date().toISOString(),
    app: {
      name: app.getName(),
      version: app.getVersion(),
      packaged: app.isPackaged,
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
    configuration: {
      recognitionProvider:
        appSettings?.recognitionProviderStore.get() ?? NULL_RECOGNITION_PROVIDER_STORE.get(),
      translationProvider:
        appSettings?.translationStore.get().provider ?? NULL_TRANSLATION_STORE.get().provider,
      reading: appSettings?.readingStore.get() ?? NULL_READING_STORE.get(),
      hasAuddToken: Boolean(process.env.AUDD_API_TOKEN),
      smtcSidecarConfigured: Boolean(process.env.SMTC_SIDECAR),
    },
    cache,
    logFile: includeRecentLog && getLogFilePath() ? path.basename(getLogFilePath()!) : null,
    recentLog: includeRecentLog ? readRecentLog() : null,
  };
}

async function openBundledDocument(filename: string): Promise<{ ok: boolean; error?: string }> {
  const candidates = [
    path.join(path.dirname(app.getPath('exe')), filename),
    path.join(app.getAppPath(), filename),
    path.join(process.cwd(), filename),
  ];
  const documentPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!documentPath) return { ok: false, error: `No se encontró ${filename}` };
  const error = await shell.openPath(documentPath);
  return error ? { ok: false, error } : { ok: true };
}

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
      sandbox: true, // S2: renderer aislado; el preload solo usa contextBridge/ipcRenderer
    },
  });

  // Nivel de "siempre encima" más alto que el normal: sin esto el widget queda
  // POR DEBAJO de los juegos en pantalla completa sin bordes (el modo habitual
  // hoy). No ayuda con pantalla completa exclusiva, donde el juego se adueña
  // del display y ninguna ventana puede dibujarse encima.
  if (overlay) win.setAlwaysOnTop(true, 'screen-saver');

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

  // Abrir links externos en el navegador, no dentro del widget. S3: solo
  // https a destinos permitidos; file: y protocolos arbitrarios se bloquean.
  win.webContents.setWindowOpenHandler(({ url }) => {
    // openExternalSafe rechaza cuando bloquea (BAJA 9): el rechazo es
    // esperado aquí — el enlace no se abre y el usuario no ve nada.
    void openExternalSafe(url).catch(() => {});
    return { action: 'deny' };
  });

  // S2: la ventana solo navega a su propia UI (dev server en desarrollo,
  // file:// local en producción). Comparación EXACTA, no prefijo (MEDIA 8 del
  // audit Opus): startsWith('file://') permitía cualquier ruta local y
  // startsWith(devServerUrl) aceptaba localhost:5173.evil.com.
  // (will-frame-navigate no existe en los typings de Electron 43; will-navigate
  // cubre la navegación del frame principal, que es la única que puede salir
  // de la UI local.)
  const blockNavigation = (event: { preventDefault(): void }, url: string): void => {
    if (!isAllowedNavigation(url)) {
      console.warn(`[main] Navegación bloqueada: ${url}`);
      event.preventDefault();
    }
  };
  win.webContents.on('will-navigate', blockNavigation);

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
  // S2: solo la ventana principal de la app puede pedir permisos de captura.
  // Un frame ajeno (ventana emergente, contenido inyectado) no recibe nada.
  const isTrustedFrame = (wc: Electron.WebContents | null): boolean => {
    if (!wc || wc.isDestroyed()) return false;
    return mainWindow !== null && !mainWindow.isDestroyed() && wc === mainWindow.webContents;
  };

  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    if (!isTrustedFrame(wc)) {
      callback(false);
      return;
    }
    callback(permission === 'media' || (permission as string) === 'display-capture');
  });

  session.defaultSession.setPermissionCheckHandler((wc, permission) => {
    if (!isTrustedFrame(wc)) return false;
    return permission === 'media' || (permission as string) === 'display-capture';
  });
}

function setupSystemAudioCapture(): void {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    // Video = el PROPIO frame del widget (transparente) + audio loopback.
    //
    // Por qué NO pantalla completa: capturar la pantalla hace que Windows
    // notifique la captura y Spotify (contenido protegido) pausa la
    // reproducción al reconocer música.
    //
    // Por qué NO solo audio: el loopback de Electron necesita un track de
    // video activo para enviar audio (comentario original de capture.ts e
    // issue electron #49607). Capturar request.frame (la propia app, que es
    // transparente y no muestra contenido ajeno) da ese track sin capturar
    // nada que dispare protección de contenido.
    if (request.frame) {
      callback({ video: request.frame, audio: 'loopback' });
    } else {
      // Frame no disponible (raro): caer a solo audio; si el loopback llega
      // en silencio, es preferible a no capturar nada.
      callback({ audio: 'loopback' });
    }
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
        // Con el modo tangible forzado por teclado, el renderer no puede
        // volver a hacer el widget intangible (si no, sobre un juego a
        // pantalla completa quedaría inagarrable otra vez).
        if (tangibleLock) {
          mainWindow.setIgnoreMouseEvents(false);
        } else if (ignore) {
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
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
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
        matchLog?.log({ type: 'load', source: 'manual', outcome: 'loaded', track: { title, artist } });
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        matchLog?.log({ type: 'load', source: 'manual', outcome: 'error', track: { title, artist }, error: message });
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.handle(
    'lyrics:retry',
    async (_event, title: string, artist: string): Promise<{ ok: boolean; error?: string }> => {
      if (!stateStore) {
        return { ok: false, error: 'StateStore no inicializado' };
      }
      try {
        // retrySearch limpia la caché (incluida la negativa) y preserva la
        // posición/pausa actuales (antes el retry manual reiniciaba a 0:00).
        await stateStore.retrySearch(title, artist);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.handle(
    'lyrics:import',
    async (): Promise<{
      ok: boolean;
      canceled?: boolean;
      title?: string;
      artist?: string;
      synced?: boolean;
      lineCount?: number;
      error?: string;
    }> => {
      if (!stateStore || !mainWindow) {
        return { ok: false, error: 'La ventana todavía no está lista' };
      }

      try {
        const selection = await dialog.showOpenDialog(mainWindow, {
          title: 'Importar letra propia o autorizada',
          properties: ['openFile'],
          filters: [
            { name: 'Letras LRC o texto', extensions: ['lrc', 'txt'] },
            { name: 'Todos los archivos', extensions: ['*'] },
          ],
        });
        if (selection.canceled || selection.filePaths.length === 0) {
          return { ok: false, canceled: true };
        }

        const filePath = selection.filePaths[0];
        const stats = await fs.promises.stat(filePath);
        if (!stats.isFile()) return { ok: false, error: 'La selección no es un archivo' };
        if (stats.size > MAX_IMPORTED_LYRICS_BYTES) {
          return { ok: false, error: 'El archivo supera el máximo permitido de 2 MB' };
        }

        const content = await fs.promises.readFile(filePath, 'utf8');
        const imported = parseImportedLyrics(content, path.basename(filePath));
        const annotatedLyrics = await romanizeTimedLyrics(imported.lyrics);
        stateStore.setImportedLyrics(annotatedLyrics, imported.title, imported.artist);
        return {
          ok: true,
          title: imported.title,
          artist: imported.artist,
          synced: imported.lyrics.synced,
          lineCount: imported.lyrics.lines.length,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo importar la letra';
        console.warn('lyrics:import failed', message);
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

  // -------------------------------------------------------------------------
  // Melodías de referencia del profesor.
  //
  // Todo local: se guarda la CURVA DE TONO, nunca el audio, bajo userData.
  // Compartir con el alumno = exportar un archivo que el profesor manda por
  // donde quiera. Ninguno de estos handlers abre una conexión de red.
  // -------------------------------------------------------------------------

  ipcMain.handle(
    'references:list',
    (_event, trackKey?: string): { ok: boolean; items: ReferenceMeta[] } => {
      return { ok: true, items: referenceStore?.list(trackKey) ?? [] };
    },
  );

  ipcMain.handle(
    'references:getForTrack',
    (_event, trackKey: string): { ok: boolean; reference: ReferenceMelody | null } => {
      if (!referenceStore || typeof trackKey !== 'string' || !trackKey) {
        return { ok: true, reference: null };
      }
      return { ok: true, reference: referenceStore.getForTrack(trackKey) };
    },
  );

  ipcMain.handle(
    'references:save',
    (
      event,
      input: SaveReferenceInput,
    ): { ok: boolean; reference?: ReferenceMeta; error?: string } => {
      if (!isTrustedSender(event)) return { ok: false, error: 'Origen no autorizado' };
      if (!referenceStore) return { ok: false, error: 'El almacén no está disponible' };
      try {
        const saved = referenceStore.save({ ...input, appVersion: app.getVersion() });
        return { ok: true, reference: toMeta(saved) };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Error al guardar' };
      }
    },
  );

  ipcMain.handle('references:delete', (event, id: string): { ok: boolean } => {
    if (!isTrustedSender(event)) return { ok: false };
    return { ok: referenceStore?.remove(id) ?? false };
  });

  // Abre en el explorador la carpeta donde se guardan las melodías de
  // referencia (profesor + karaoke automático). Todo local, sin red.
  ipcMain.handle('references:openFolder', async (event): Promise<{ ok: boolean; error?: string }> => {
    if (!isTrustedSender(event)) return { ok: false, error: 'Origen no autorizado' };
    if (!referenceStore) return { ok: false, error: 'El almacén no está disponible' };
    try {
      const dir = referenceStore.directory();
      await fs.promises.mkdir(dir, { recursive: true });
      const err = await shell.openPath(dir);
      return err ? { ok: false, error: err } : { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'No se pudo abrir la carpeta' };
    }
  });

  ipcMain.handle(
    'references:export',
    async (event, id: string): Promise<{ ok: boolean; canceled?: boolean; error?: string }> => {
      if (!isTrustedSender(event)) return { ok: false, error: 'Origen no autorizado' };
      if (!referenceStore) return { ok: false, error: 'El almacén no está disponible' };
      const reference = referenceStore.get(id);
      if (!reference) return { ok: false, error: 'La referencia ya no existe' };
      try {
        const options = {
          title: 'Exportar melodía de referencia',
          defaultPath: suggestedFileName(reference),
          filters: [{ name: 'Referencia de Singevery', extensions: [REFERENCE_FILE_EXTENSION] }],
        };
        const result = mainWindow
          ? await dialog.showSaveDialog(mainWindow, options)
          : await dialog.showSaveDialog(options);
        if (result.canceled || !result.filePath) return { ok: false, canceled: true };
        fs.writeFileSync(result.filePath, buildReferenceFile(reference), 'utf8');
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Error al exportar' };
      }
    },
  );

  ipcMain.handle(
    'references:import',
    async (): Promise<{
      ok: boolean;
      canceled?: boolean;
      reference?: ReferenceMeta;
      error?: string;
    }> => {
      if (!referenceStore) return { ok: false, error: 'El almacén no está disponible' };
      try {
        const options = {
          title: 'Importar melodía de referencia',
          properties: ['openFile' as const],
          filters: [{ name: 'Referencia de Singevery', extensions: [REFERENCE_FILE_EXTENSION] }],
        };
        const selection = mainWindow
          ? await dialog.showOpenDialog(mainWindow, options)
          : await dialog.showOpenDialog(options);
        if (selection.canceled || selection.filePaths.length === 0) {
          return { ok: false, canceled: true };
        }

        const filePath = selection.filePaths[0];
        // El archivo viene de fuera (WhatsApp, pendrive): se acota el tamaño
        // ANTES de leerlo y parseReferenceFile valida todo lo demás.
        const size = fs.statSync(filePath).size;
        if (size > MAX_REFERENCE_FILE_BYTES) {
          return { ok: false, error: 'El archivo es demasiado grande para ser una referencia' };
        }
        const parsed = parseReferenceFile(fs.readFileSync(filePath, 'utf8'));
        return { ok: true, reference: toMeta(referenceStore.save(parsed)) };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Error al importar' };
      }
    },
  );

  ipcMain.handle(
    'practice:exportCsv',
    async (_event, csv: string): Promise<{ ok: boolean; canceled?: boolean; error?: string }> => {
      if (typeof csv !== 'string' || Buffer.byteLength(csv, 'utf8') > 1024 * 1024) {
        return { ok: false, error: 'La colección de repaso no es válida' };
      }
      try {
        const options = {
          title: 'Exportar líneas de repaso',
          defaultPath: `singevery-repaso-${new Date().toISOString().slice(0, 10)}.csv`,
          filters: [{ name: 'Archivo CSV', extensions: ['csv'] }],
        };
        const result = mainWindow
          ? await dialog.showSaveDialog(mainWindow, options)
          : await dialog.showSaveDialog(options);
        if (result.canceled || !result.filePath) return { ok: false, canceled: true };
        await fs.promises.writeFile(result.filePath, csv, 'utf8');
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo exportar el repaso';
        console.warn('practice:exportCsv failed', message);
        return { ok: false, error: message };
      }
    },
  );

  // Fuente de reconocimiento activa. En modo micrófono el audio es externo al
  // PC → SMTC suprimido por completo. En modo system, AudD manda en la
  // identidad de la pista y SMTC solo colabora si su sesión coincide
  // (arbitraje anti-loop de YouTube). null devuelve el mando a SMTC.
  ipcMain.handle(
    'recognition:setSource',
    (event, source: 'microphone' | 'system' | null): { ok: boolean } => {
      if (!isTrustedSender(event)) return { ok: false };
      stateStore?.setRecognitionSource(source);
      return { ok: true };
    },
  );

  ipcMain.handle(
    'recognition:identify',
    async (
      event,
      audio: ArrayBuffer,
      mimeType: string,
      recordStartedAt: number,
    ): Promise<{ ok: boolean; matched: boolean; error?: string }> => {
      if (!isTrustedSender(event)) {
        return { ok: false, matched: false, error: 'Origen no autorizado' };
      }
      if (!stateStore) {
        return { ok: false, matched: false, error: 'StateStore no inicializado' };
      }

      try {
        const epoch = recognitionEpoch;
        stateStore.setRecognitionPhase('IDENTIFYING');
        const startedAt = Date.now();
        const match = await recognitionService!.identify(Buffer.from(audio), mimeType);
        // F2: si se detuvo el reconocimiento mientras identificaba, descartar
        // el resultado: un match tardío no debe recargar letras ni cambiar
        // estado después de pulsar detener.
        if (epoch !== recognitionEpoch) {
          return { ok: false, matched: false, error: 'Reconocimiento detenido' };
        }
        const durationMs = Date.now() - startedAt;
        if (!match) {
          stateStore.setRecognitionPhase('LISTENING');
          matchLog?.log({ type: 'identify', ...recognitionLogFields(match, recordStartedAt, appSettings?.recognitionProviderStore.get() ?? 'auto'), outcome: 'no_match', durationMs });
          return { ok: true, matched: false };
        }
        matchLog?.log({
          type: 'identify',
          ...recognitionLogFields(match, recordStartedAt, appSettings?.recognitionProviderStore.get() ?? 'auto'),
          outcome: 'matched',
          durationMs,
          confidence: match.confidence,
          track: { title: match.track.title, artist: match.track.artist },
        });

        // applyMatch deja el estado en DISPLAYING/NO_LYRICS por su cuenta. NO
        // re-forzamos 'LISTENING' aquí: taparía la letra recién cargada (el
        // seguimiento continuo ya no llama a stopRecognition para limpiarlo).
        await stateStore.applyMatch(match, recordStartedAt);
        // F2: re-comprobar la época DESPUÉS del await. applyMatch es la parte
        // más lenta (fetch de letras por red): si el usuario pulsó detener
        // mientras cargaba, deshacer lo que dejó puesto y no propagar el
        // match tardío (un stop no debe terminar pintando letras).
        if (epoch !== recognitionEpoch) {
          stateStore.clearRecognition();
          return { ok: false, matched: false, error: 'Reconocimiento detenido' };
        }
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
      event,
      audio: ArrayBuffer,
      mimeType: string,
      recordStartedAt: number,
    ): Promise<{
      ok: boolean;
      matched: boolean;
      changed?: boolean;
      suspected?: boolean;
      error?: string;
    }> => {
      if (!isTrustedSender(event)) {
        return { ok: false, matched: false, error: 'Origen no autorizado' };
      }
      if (!stateStore) {
        return { ok: false, matched: false, error: 'StateStore no inicializado' };
      }
      try {
        const epoch = recognitionEpoch;
        const startedAt = Date.now();
        const match = await recognitionService!.identify(Buffer.from(audio), mimeType);
        // F2: mismo descarte que en identify — detener invalida la corrección
        // en vuelo.
        if (epoch !== recognitionEpoch) {
          return { ok: false, matched: false, error: 'Reconocimiento detenido' };
        }
        const durationMs = Date.now() - startedAt;
        if (!match) {
          matchLog?.log({ type: 'correct', ...recognitionLogFields(match, recordStartedAt, appSettings?.recognitionProviderStore.get() ?? 'auto'), outcome: 'no_match', durationMs });
          return { ok: true, matched: false, suspected: stateStore.isChangeSuspected() };
        }
        const changed = await stateStore.applyMatch(match, recordStartedAt);
        // F2: re-comprobar la época tras el await (applyMatch incluye el fetch
        // de letras por red). Si se detuvo mientras cargaba, deshacer y no
        // propagar el match tardío.
        if (epoch !== recognitionEpoch) {
          stateStore.clearRecognition();
          return { ok: false, matched: false, error: 'Reconocimiento detenido' };
        }
        // El mismo chunk sirve para medir el desfase de la letra por energía
        // vocal: ya está grabado y ya se sabe a qué posición corresponde.
        // No aplica nada salvo que SINGEVERY_ENERGY_SYNC esté encendido.
        if (!changed) {
          try {
            stateStore.reportAudioWindow(audio, recordStartedAt);
          } catch (err) {
            console.warn('[energía] la correlación falló (se ignora):', err);
          }
        }
        matchLog?.log({
          type: 'correct',
          ...recognitionLogFields(match, recordStartedAt, appSettings?.recognitionProviderStore.get() ?? 'auto'),
          outcome: 'matched',
          changed,
          durationMs,
          confidence: match.confidence,
          track: { title: match.track.title, artist: match.track.artist },
        });
        // `suspected` = el fingerprint vio otra canción y la histéresis aún no
        // la confirma. El renderer encadena el ciclo siguiente sin pausa para
        // cerrar la confirmación en ~7s en vez de ~20s.
        return { ok: true, matched: true, changed, suspected: stateStore.isChangeSuspected() };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        matchLog?.log({ type: 'correct', ...recognitionLogFields(null, recordStartedAt, appSettings?.recognitionProviderStore.get() ?? 'auto'), outcome: 'error', error: message });
        return { ok: false, matched: false, error: message };
      }
    },
  );

  // Corte de pista detectado localmente por el monitor de audio del renderer
  // (hueco de silencio entre canciones o cambio brusco de timbre). Señal
  // independiente del fingerprint y del reproductor del SO: sirve para
  // confirmar un cambio de canción sin gastar otro ciclo de histéresis.
  ipcMain.handle(
    'recognition:boundary',
    (event, kind: 'gap' | 'novelty'): { ok: boolean } => {
      if (!isTrustedSender(event)) return { ok: false };
      if (kind !== 'gap' && kind !== 'novelty') return { ok: false };
      stateStore?.noteAudioBoundary(kind);
      return { ok: true };
    },
  );

  ipcMain.handle('recognition:stop', (event): { ok: boolean } => {
    if (!isTrustedSender(event)) return { ok: false };
    recognitionEpoch += 1; // F2: invalida cualquier identificación en vuelo.
    stateStore?.clearRecognition();
    return { ok: true };
  });

  // Feedback del usuario sobre la identificación (loop de mejora). 'wrong'
  // dispara una re-identificación inmediata del audio en curso (recalibra sin
  // tocar la letra); el evento queda en la bitácora para el análisis offline.
  ipcMain.handle(
    'matchlog:feedback',
    async (_event, correct: boolean): Promise<{ ok: boolean; resynced?: boolean; error?: string }> => {
      if (!matchLog || !stateStore || !mainWindow || mainWindow.isDestroyed()) {
        return { ok: false, error: 'La ventana todavía no está lista' };
      }
      const model = stateStore.getLastModel();
      matchLog.log({
        type: 'feedback',
        source: 'unknown',
        outcome: correct ? 'correct' : 'wrong',
        track: model ? { title: model.track_title ?? 'desconocida', artist: model.track_artist ?? 'desconocido' } : undefined,
      });
      if (!correct) {
        mainWindow.webContents.send('command:resync');
        return { ok: true, resynced: true };
      }
      return { ok: true };
    },
  );

  // Estadísticas agregadas de aciertos para la sección de Precisión.
  ipcMain.handle('matchlog:stats', (): { ok: boolean; stats: import('./core/matchLog').MatchStats | null } => {
    return { ok: true, stats: matchLog?.getStats() ?? null };
  });

  // Nivel de audio capturado (0..1): alimenta la pausa del reloj por silencio.
  ipcMain.handle('recognition:level', (event, level: number): { ok: boolean } => {
    if (!isTrustedSender(event)) return { ok: false };
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

  // "Este desfase pasa en todas las canciones": mueve el ajuste de la pista
  // actual a la calibración global, para que las próximas ya nazcan bien.
  ipcMain.handle(
    'sync:applyOffsetToAll',
    (): { ok: boolean; calibrationMs: number; offsetMs: number } => {
      if (!stateStore) return { ok: false, calibrationMs: 0, offsetMs: 0 };
      const calibrationMs = stateStore.applyOffsetToAllTracks();
      return { ok: true, calibrationMs, offsetMs: stateStore.getSyncOffsetMs() };
    },
  );

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

  ipcMain.handle(
    'diagnostics:export',
    async (): Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }> => {
      const options = {
        title: 'Exportar diagnóstico de Singevery',
        defaultPath: `Singevery-diagnostico-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'Diagnóstico JSON', extensions: ['json'] }],
      };
      const result = mainWindow
        ? await dialog.showSaveDialog(mainWindow, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { ok: false, canceled: true };

      const report = collectDiagnostics();
      try {
        fs.writeFileSync(result.filePath, JSON.stringify(report, null, 2), 'utf8');
        return { ok: true, path: result.filePath };
      } catch (err) {
        console.error('[diagnostics ERROR] No se pudo exportar:', err);
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'No se pudo guardar el diagnóstico',
        };
      }
    },
  );

  ipcMain.handle(
    'support:createTicket',
    async (
      event,
      input: SupportTicketDraft,
    ): Promise<{
      ok: boolean;
      canceled?: boolean;
      path?: string;
      ticketId?: string;
      issueOpened?: boolean;
      warning?: string;
      error?: string;
    }> => {
      if (!isTrustedSender(event)) {
        return { ok: false, error: 'Origen no autorizado' };
      }
      const validation = validateSupportTicketDraft(input);
      if (!validation.ok) return { ok: false, error: validation.error };

      const draft = validation.value;
      const now = new Date();
      const ticketId = createSupportTicketId(now);
      const filename = `Singevery-ticket-${ticketId}.json`;
      const options = {
        title: 'Guardar ticket de Singevery',
        defaultPath: filename,
        filters: [{ name: 'Ticket JSON', extensions: ['json'] }],
      };
      const result = mainWindow
        ? await dialog.showSaveDialog(mainWindow, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { ok: false, canceled: true };

      const diagnostics = draft.includeDiagnostics ? collectDiagnostics() : null;
      const ticket = buildSupportTicketFile(draft, ticketId, now.toISOString(), diagnostics);
      try {
        await fs.promises.writeFile(result.filePath, JSON.stringify(ticket, null, 2), 'utf8');
      } catch (err) {
        console.error('[support ERROR] No se pudo guardar el ticket:', err);
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'No se pudo guardar el ticket',
        };
      }

      const platformLabel = `${process.platform} ${process.arch} ${os.release()}`;
      const issueUrl = buildSupportIssueUrl(
        SUPPORT_ISSUES_URL,
        draft,
        ticketId,
        app.getVersion(),
        platformLabel,
      );
      let issueOpened = false;
      let warning: string | undefined;
      try {
        await openExternalSafe(issueUrl);
        issueOpened = true;
      } catch (err) {
        warning = err instanceof Error ? err.message : 'No se pudo abrir el portal de soporte';
        console.warn('[support] Ticket guardado, pero no se pudo abrir el portal:', warning);
      }
      shell.showItemInFolder(result.filePath);
      return { ok: true, path: result.filePath, ticketId, issueOpened, warning };
    },
  );

  ipcMain.handle('help:openBetaGuide', async (): Promise<{ ok: boolean; error?: string }> =>
    openBundledDocument('GUIA_BETA_PROFESORES.md'),
  );

  ipcMain.handle(
    'legal:openPrivacy',
    async (): Promise<{ ok: boolean; error?: string }> => {
      return openBundledDocument('PRIVACIDAD_Y_DATOS.md');
    },
  );

}

function bootstrap(): void {
  initAppLogger(path.join(app.getPath('userData'), 'logs'), app.getVersion());
  loadDotEnv();
  setupContentSecurityPolicy(session.defaultSession);
  setupMediaPermissions();
  setupSystemAudioCapture();
  // Bitácora de aciertos del reconocimiento (loop de mejora). Nunca lanza:
  // si el disco falla, la app sigue funcionando sin log.
  try {
    matchLog = new MatchLog(path.join(app.getPath('userData'), 'logs'));
  } catch (err) {
    console.error('[matchlog ERROR] No se pudo inicializar la bitácora:', err);
    matchLog = null;
  }

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

  // Melodías de referencia del profesor. Si falla, la app funciona igual: la
  // referencia automática (extraída de la propia canción) sigue disponible.
  try {
    referenceStore = new ReferenceStore(path.join(app.getPath('userData'), 'references'));
  } catch (err) {
    console.error('[referencias ERROR] No se pudo inicializar el almacén:', err);
    referenceStore = null;
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
  // Corrección de sincronía por energía vocal: mide siempre (queda en /debug),
  // corrige solo si se enciende a propósito. Ver docs/DIAGNOSTICO.md.
  stateStore.setEnergySyncEnabled(process.env.SINGEVERY_ENERGY_SYNC === '1');
  // Cambio de pista detectado por el SO pero no confirmable por metadata:
  // pedirle al renderer que re-identifique por audio de inmediato.
  stateStore.setResyncRequester(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('command:resync');
    }
  });
  stateStore.start(100); // 10 Hz

  // Endpoint de diagnóstico: APAGADO salvo que SINGEVERY_DEBUG_PORT esté
  // puesto (entorno o .env junto al ejecutable). Ver diagnosticsServer.ts.
  const debugPort = resolveDiagnosticsPort();
  if (debugPort != null) {
    const serviceForDebug = lyricsService;
    void startDiagnosticsServer(
      {
        appName: app.getName(),
        appVersion: app.getVersion(),
        startedAt: processStartedAt,
        getState: () => stateStore!.getDiagnostics(),
        getCachedTrack: (key) => serviceForDebug.describeCachedTrack(key),
        getProviderNames: () => serviceForDebug.getProviderNames(),
        getRecentAttempts: (limit) => matchLog?.recent(limit) ?? [],
      },
      debugPort,
    ).then((handle) => {
      diagnosticsServer = handle;
    });
  }

  if (appSettings) {
    autoContrast = new AutoContrastService(
      () => mainWindow,
      appSettings.displayStore,
      stateStore,
    );
    autoContrast.sync();
  }

  registerIpcHandlers();
  registerGlobalShortcuts();

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
 * Activa/desactiva el modo tangible forzado. Se maneja en el proceso main (y
 * no en el renderer) para que funcione aunque el overlay no esté recibiendo
 * eventos de mouse, que es justo el caso con un juego en primer plano.
 */
function setTangibleLock(next: boolean): void {
  tangibleLock = next;
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (next) {
    mainWindow.setIgnoreMouseEvents(false);
    // 'screen-saver' es el nivel más alto: gana a las ventanas en pantalla
    // completa sin bordes (el modo por defecto de casi todos los juegos).
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    if (!mainWindow.isVisible()) mainWindow.show();
    // Sin foco, el clic se lo queda el juego que está debajo.
    mainWindow.focus();
  }
  mainWindow.webContents.send('command:tangible', next);
}

/** Mueve el widget con el teclado (no depende del mouse ni del hover). */
function nudgeWindow(dx: number, dy: number): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const [x, y] = mainWindow.getPosition();
  mainWindow.setPosition(x + dx, y + dy);
}

/**
 * Atajos globales. Cada registro puede fallar si otra app ya se quedó con el
 * acelerador; se avisa por consola y el resto sigue funcionando.
 */
function registerGlobalShortcuts(): void {
  const shortcuts: Array<[string, () => void]> = [
    [SING_ACCELERATOR, () => triggerSing()],
    [TANGIBLE_ACCELERATOR, () => setTangibleLock(!tangibleLock)],
    ['Ctrl+Alt+Left', () => nudgeWindow(-MOVE_STEP_PX, 0)],
    ['Ctrl+Alt+Right', () => nudgeWindow(MOVE_STEP_PX, 0)],
    ['Ctrl+Alt+Up', () => nudgeWindow(0, -MOVE_STEP_PX)],
    ['Ctrl+Alt+Down', () => nudgeWindow(0, MOVE_STEP_PX)],
  ];

  for (const [accelerator, handler] of shortcuts) {
    try {
      if (!globalShortcut.register(accelerator, handler)) {
        console.warn(`[main] no se pudo registrar el atajo ${accelerator} (quizá ya esté en uso).`);
      }
    } catch (err) {
      console.warn(`[main] error registrando ${accelerator}:`, err);
    }
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
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
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
    autoContrast?.dispose();
    void diagnosticsServer?.close();
    diagnosticsServer = null;
    stateStore?.stop();
    lyricsCache?.flush(); // escribe el índice pendiente (persist debounced)
    globalShortcut.unregisterAll();
    app.quit();
    // Garantía anti-zombie: si quit() no completa (IO nativa colgada), forzar
    // la salida. El flush de lyricsCache ya corrió síncronamente arriba.
    setTimeout(() => app.exit(0), 1500).unref?.();
  });

  app.on('before-quit', () => {
    smtcReader?.stop();
    wakeWordReader?.stop();
    void diagnosticsServer?.close();
    diagnosticsServer = null;
    stateStore?.stop();
    lyricsCache?.flush();
    globalShortcut.unregisterAll();
  });
}
