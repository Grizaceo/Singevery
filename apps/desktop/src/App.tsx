import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Teleprompter } from './teleprompter/Teleprompter';
import { ChromeTopBar } from './ChromeTopBar';
import { ChromeBottomBar } from './ChromeBottomBar';
import { SettingsPanel } from './SettingsPanel';
import { BetaWelcome } from './BetaWelcome';
import { Pill } from './Pill';
import { WidgetHandle } from './WidgetHandle';
import { useReadingMode } from './useReadingMode';
import { useTranslationView } from './useTranslationToggle';
import { useAutoStart } from './useAutoStart';
import { useRecognition } from './useRecognition';
import { usePitchMonitor } from './usePitchMonitor';
import { useMelodyReference } from './useMelodyReference';
import { useTeacherReference } from './useTeacherReference';
import { ManualSearch } from './ManualSearch';
import { SyncHoldBadge } from './SyncHoldBadge';
import { IpaGuide } from './IpaGuide';
import { matchWindow } from './audio/compare';
import { RenderModelProvider, useRenderModel } from './renderModelContext';
import {
  AutoGhostTimer,
  autoGhostEligible,
  isHudActivity,
  autoOpenAction,
  readAutoGhostPrefs,
  type AutoGhostPrefs,
  type GhostNoticeReason,
} from './autoGhost';
import { GUARDED_POINTER_EVENTS, withinExpandGuard } from './expandGuard';
import { detectScriptFromLines } from './scriptDetect';
import { useT } from './i18n/useT';
import './App.css';

declare global {
  interface Window {
    api?: import('./types').DesktopApi;
  }
}

const CHROME_IDLE_MS = 2800;
const BETA_WELCOME_KEY = 'singevery:beta-welcome:v1';

function shouldShowBetaWelcome(): boolean {
  try {
    return window.localStorage.getItem(BETA_WELCOME_KEY) !== 'seen';
  } catch {
    return true;
  }
}

function AppContent() {
  const t = useT();
  const model = useRenderModel();
  const [readingMode, setReadingMode] = useReadingMode();
  const [translationView, setTranslationView, translationState] = useTranslationView();
  const [chromeVisible, setChromeVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Búsqueda manual de canción: se abre SOLO cuando el usuario la pide (no
  // reconoce bien la canción actual o quiere forzar una). Nunca visible por defecto.
  const [manualSearchOpen, setManualSearchOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(shouldShowBetaWelcome);
  const [recallHidden, setRecallHidden] = useState(false);
  const [collapsed, setCollapsed] = useState(() => !welcomeOpen);
  const [ghost, setGhost] = useState(false);
  const [handleHovered, setHandleHovered] = useState(false);
  // Modo tangible forzado por atajo global (Ctrl+Alt+T). Es la vía de escape
  // cuando hay un juego en primer plano: el overlay no recibe el hover del
  // mouse, así que sin teclado no habría forma de agarrarlo para moverlo.
  const [tangible, setTangible] = useState(false);
  // Guía de símbolos IPA: se abre con el botón "?" de los controles de lectura.
  const [ipaGuideOpen, setIpaGuideOpen] = useState(false);
  const hideTimerRef = useRef<number | undefined>(undefined);
  // Intangible automático por inactividad (autoGhost.ts). Las prefs se releen
  // al cerrar Ajustes para que el cambio aplique sin reiniciar la app.
  const [autoGhostPrefs, setAutoGhostPrefs] = useState<AutoGhostPrefs>(readAutoGhostPrefs);
  const [autoGhostNotice, setAutoGhostNotice] = useState<GhostNoticeReason | null>(null);
  const autoGhostTimerRef = useRef<AutoGhostTimer | null>(null);
  const autoGhostNoticeTimerRef = useRef<number | undefined>(undefined);
  const showGhostNotice = useCallback((reason: GhostNoticeReason) => {
    setAutoGhostNotice(reason);
    window.clearTimeout(autoGhostNoticeTimerRef.current);
    autoGhostNoticeTimerRef.current = window.setTimeout(() => setAutoGhostNotice(null), 6000);
  }, []);
  // Instante en que la pastilla se expandió (expandGuard.ts).
  const expandedAtRef = useRef<number | null>(null);
  const prevCollapsedRef = useRef<boolean | null>(null);
  // Último clickThrough calculado: lo usa isHudActivity para decidir si un
  // mousemove es el usuario tocando el HUD o solo el cursor pasando de largo.
  const clickThroughRef = useRef(false);
  const prevTrackRef = useRef<string | undefined>(undefined);
  const autoStartedRef = useRef(false);
  const [autoStart, setAutoStart] = useAutoStart();

  // Clave de pista para la referencia melódica del pitch (P1): solo cuando hay
  // canción identificada y en pantalla. Declarada con los demás hooks (nunca
  // después de un return condicional).
  const trackKey = useMemo(() => {
    if (model.status !== 'DISPLAYING' || !model.track_title) return null;
    const artist = (model.track_artist ?? '').trim().toLowerCase();
    const title = model.track_title.trim().toLowerCase();
    if (!title) return null;
    return artist ? `${artist}__${title}` : title;
  }, [model.status, model.track_title, model.track_artist]);

  const recognition = useRecognition();
  const pitchMonitor = usePitchMonitor();
  // Posición actual de la canción para anclar la melodía de referencia
  // (el ref se actualiza en un effect; el hook de melodía lo lee al capturar).
  const positionRef = useRef<number | null>(null);
  useEffect(() => {
    positionRef.current = model.position_ms ?? null;
  }, [model.position_ms]);
  const getPositionMs = useCallback(() => positionRef.current, []);
  // La referencia del PROFESOR manda sobre la automática: la automática es una
  // heurística que se degrada en arreglos densos; la grabada es correcta por
  // definición. Además, si ya existe, no se gastan 24 s de loopback capturando
  // una referencia que igual se iba a descartar.
  const teacherRef = useTeacherReference(trackKey, getPositionMs);
  const melodyRef = useMelodyReference(
    trackKey,
    pitchMonitor.active && teacherRef.points == null,
    getPositionMs,
  );
  const activeMelody = teacherRef.points ?? melodyRef.reference;

  // Score contra la referencia (P2): ventana de pitch del usuario vs melodía.
  // Se calcula AQUÍ (App) para compartirlo entre el badge de la barra inferior
  // y la columna de entonación junto a la letra: así la puntuación persiste en
  // modo karaoke aunque la chrome se oculte (el badge de abajo desaparece al
  // dejar de mover el mouse).
  const pitchMatch = useMemo(() => {
    if (!pitchMonitor.active || !activeMelody || pitchMonitor.window.length < 5) return null;
    return matchWindow(pitchMonitor.window, activeMelody, { toleranceCents: 50, maxOffsetMs: 20000 });
  }, [pitchMonitor.active, pitchMonitor.window, activeMelody]);
  const pitchScore = pitchMatch ? Math.round(pitchMatch.score * 100) : null;

  // Arranque automático: escuchar el audio del sistema apenas abre. Se queda
  // en modo pastilla mientras no reconozca nada; al identificar la canción, el
  // efecto de abajo expande la ventana solo. El ref evita que un re-render
  // relance la captura.
  useEffect(() => {
    if (!autoStart || autoStartedRef.current || !window.api) return;
    autoStartedRef.current = true;
    void recognition.start('system');
  }, [autoStart, recognition]);

  const handleSing = useCallback(() => {
    setCollapsed(false);
    void recognition.start('system');
  }, [recognition]);

  useEffect(() => {
    if (!window.api?.onSingCommand) return;
    return window.api.onSingCommand(() => {
      void handleSing();
    });
  }, [handleSing]);

  // El main detectó un posible cambio de canción (evento del reproductor del
  // SO) que no pudo confirmar por metadata: re-identificar de inmediato en vez
  // de esperar el próximo ciclo de corrección.
  useEffect(() => {
    if (!window.api?.onResyncCommand) return;
    return window.api.onResyncCommand(() => {
      recognition.requestResync();
    });
  }, [recognition]);

  // Al forzar el modo tangible, sacar también el modo fantasma y mostrar la
  // chrome: si no, el widget sería agarrable pero seguiría invisible.
  useEffect(() => {
    if (!window.api?.onTangibleCommand) return;
    return window.api.onTangibleCommand((locked) => {
      setTangible(locked);
      if (locked) {
        setGhost(false);
        setChromeVisible(true);
        setAutoGhostNotice(null);
      }
    });
  }, []);

  useEffect(() => {
    if (!collapsed && prevCollapsedRef.current) expandedAtRef.current = performance.now();
    prevCollapsedRef.current = collapsed;
    void window.api?.setCollapsed?.(collapsed);
  }, [collapsed]);

  // Tras expandir la pastilla se descartan los clics un instante: el segundo
  // clic de un doble clic en SING caía sobre el botón Cerrar (expandGuard.ts).
  // Va en captura sobre window para cortar el evento antes que React.
  useEffect(() => {
    const swallow = (e: Event) => {
      if (withinExpandGuard(performance.now(), expandedAtRef.current)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    for (const type of GUARDED_POINTER_EVENTS) window.addEventListener(type, swallow, true);
    return () => {
      for (const type of GUARDED_POINTER_EVENTS) window.removeEventListener(type, swallow, true);
    };
  }, []);

  // Canción nueva reconocida con la pastilla: abrir en modo fantasma (no
  // atrapa los clics de lo que el usuario esté haciendo) o, si lo desactivó en
  // Ajustes, quedarse como pastilla. Pulsar SING abre normal (handleSing).
  useEffect(() => {
    const t = model.track_title;
    const action = autoOpenAction({
      collapsed,
      newTrack: Boolean(t) && t !== prevTrackRef.current,
      openOnRecognize: autoGhostPrefs.openOnRecognize,
    });
    if (action === 'open-ghost') {
      setGhost(true);
      window.clearTimeout(hideTimerRef.current);
      setChromeVisible(false);
      showGhostNotice('auto-open');
      setCollapsed(false);
    }
    prevTrackRef.current = t;
  }, [model.track_title, collapsed, autoGhostPrefs.openOnRecognize, showGhostNotice]);

  // F2: al cambiar de canción (trackKey distinto), re-traducir la letra nueva
  // si la vista de traducción está activa. El ref evita re-disparos por el
  // objeto translate que se recrea en cada render.
  const translateRef = useRef(translationState.translate);
  // El ref se actualiza en un efecto propio, NO durante el render: escribir en
  // un ref mientras React renderiza es un fallo real (react-hooks/refs) porque
  // el render debe ser puro. Este efecto va antes que el consumidor, y los
  // efectos corren en orden de declaración, así que el valor ya está fresco.
  useEffect(() => {
    translateRef.current = translationState.translate;
  }, [translationState.translate]);
  const prevTrackKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!trackKey) {
      prevTrackKeyRef.current = null;
      return;
    }
    if (prevTrackKeyRef.current === trackKey) return;
    prevTrackKeyRef.current = trackKey;
    if (translationView === 'off') return;
    void translateRef.current();
  }, [trackKey, translationView]);

  // Cierra Ajustes y relee las prefs de intangible automático: el cambio en
  // localStorage aplica sin reiniciar la app.
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    setAutoGhostPrefs(readAutoGhostPrefs());
  }, []);

  const handleCollapse = useCallback(() => {
    setCollapsed(true);
    closeSettings();
    setGhost(false);
    setAutoGhostNotice(null);
  }, [closeSettings]);

  const dismissWelcome = useCallback(() => {
    try {
      window.localStorage.setItem(BETA_WELCOME_KEY, 'seen');
    } catch {
      // El recorrido sigue funcionando aunque el almacenamiento esté bloqueado.
    }
    setWelcomeOpen(false);
  }, []);

  const openSettingsFromWelcome = useCallback(() => {
    dismissWelcome();
    setSettingsOpen(true);
  }, [dismissWelcome]);

  const isDisplaying = model.status === 'DISPLAYING';

  const reveal = useCallback(() => {
    if (ghost) return;
    setChromeVisible(true);
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setChromeVisible(false), CHROME_IDLE_MS);
  }, [ghost]);

  const toggleGhost = useCallback(() => {
    setGhost((prev) => {
      const next = !prev;
      if (next) {
        window.clearTimeout(hideTimerRef.current);
        setChromeVisible(false);
      } else {
        setChromeVisible(true);
        hideTimerRef.current = window.setTimeout(() => setChromeVisible(false), CHROME_IDLE_MS);
      }
      return next;
    });
    // Salir del fantasma (o entrar a mano) descarta el aviso de inactividad.
    setAutoGhostNotice(null);
  }, []);

  useEffect(() => {
    if (!isDisplaying || ghost) return;
    hideTimerRef.current = window.setTimeout(() => setChromeVisible(false), CHROME_IDLE_MS);
    return () => {
      window.clearTimeout(hideTimerRef.current);
      setChromeVisible(true);
    };
  }, [isDisplaying, ghost]);

  useEffect(() => {
    if (!isDisplaying || !chromeVisible || ghost) return;
    const onActivity = () => reveal();
    window.addEventListener('mousemove', onActivity);
    window.addEventListener('mousedown', onActivity);
    window.addEventListener('wheel', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity);
    return () => {
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('mousedown', onActivity);
      window.removeEventListener('wheel', onActivity);
      window.removeEventListener('keydown', onActivity);
    };
  }, [isDisplaying, chromeVisible, ghost, reveal]);

  // Temporizador de inactividad → modo fantasma automático. El onFire hace lo
  // mismo que activar el fantasma a mano (toggleGhost) más un aviso temporal.
  useEffect(() => {
    if (!autoGhostTimerRef.current) {
      autoGhostTimerRef.current = new AutoGhostTimer(() => {
        setGhost(true);
        window.clearTimeout(hideTimerRef.current);
        setChromeVisible(false);
        showGhostNotice('idle');
      });
    }
    autoGhostTimerRef.current.update({
      enabled: autoGhostPrefs.enabled,
      idleMs: autoGhostPrefs.idleSeconds * 1000,
      eligible: autoGhostEligible({
        collapsed,
        tangible,
        settingsOpen,
        welcomeOpen,
        manualSearchOpen,
        ghost,
      }),
    });
  }, [
    autoGhostPrefs,
    collapsed,
    tangible,
    settingsOpen,
    welcomeOpen,
    manualSearchOpen,
    ghost,
    showGhostNotice,
  ]);

  useEffect(() => () => autoGhostTimerRef.current?.dispose(), []);

  // Actividad del usuario sobre el HUD: reinicia la cuenta del intangible
  // automático. Con la ventana click-through los mousemove reenviados no cuentan.
  useEffect(() => {
    const onActivity = (e: Event) => {
      if (isHudActivity(e.type, clickThroughRef.current)) {
        autoGhostTimerRef.current?.activity();
      }
    };
    const types = [
      'pointerdown',
      'mousedown',
      'wheel',
      'keydown',
      'contextmenu',
      'pointermove',
      'mousemove',
    ] as const;
    for (const type of types) {
      window.addEventListener(type, onActivity, type === 'wheel' ? { passive: true } : undefined);
    }
    return () => {
      for (const type of types) window.removeEventListener(type, onActivity);
    };
  }, []);

  const chromeHidden = !tangible && (ghost || (isDisplaying && !chromeVisible));

  useEffect(() => {
    // La píldora nunca deja pasar los clics: no tiene asa sobre la que pasar
    // el cursor para recuperarla, y con una canción en pantalla el temporizador
    // de la chrome la volvía intangible a los pocos segundos (sin forma de
    // pulsar SING con el mouse).
    // Hold manual: no cambia nada aquí. El indicador es atravesable y el botón
    // "Sincronizar" está en la barra inferior, que se revela como siempre.
    const clickThrough =
      !collapsed &&
      !tangible &&
      !settingsOpen &&
      !welcomeOpen &&
      !manualSearchOpen &&
      (ghost ? !handleHovered : chromeHidden);
    clickThroughRef.current = clickThrough;
    window.api?.setClickThrough?.(clickThrough);
  }, [collapsed, ghost, handleHovered, chromeHidden, settingsOpen, tangible, welcomeOpen, manualSearchOpen]);

  const visibleLines = useMemo(
    () => [...model.previous_lines, model.current_line, ...model.next_lines],
    [model],
  );

  const hasAnnotations =
    model.status === 'DISPLAYING' &&
    visibleLines.some(
      (l) => l.furigana != null || l.romaji != null || l.kana != null || l.ipa != null,
    );

  /** Hay IPA cuando el idioma se reconoció: japonés o una lengua latina. */
  const hasIpa = model.status === 'DISPLAYING' && visibleLines.some((l) => l.ipa != null);

  const scriptHint = useMemo(() => {
    if (model.status !== 'DISPLAYING') return 'latin' as const;
    return detectScriptFromLines(visibleLines.map((l) => l.text));
  }, [model.status, visibleLines]);

  if (collapsed) {
    return <Pill onSing={handleSing} trackTitle={model.track_title} />;
  }

  return (
    <>
      <Teleprompter
        model={model}
        readingMode={readingMode}
        translationView={translationView}
        chromeHidden={chromeHidden}
        ghost={ghost}
        melody={activeMelody}
        pitchActive={pitchMonitor.active}
        recallHidden={recallHidden}
        livePitch={pitchMonitor.pitch}
        pitchScore={pitchScore}
      />
      {tangible && (
        <div className="tangible-badge" role="status">
          {t('app.tangible.title')} · <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd> {t('app.tangible.toRelease')} ·{' '}
          <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+{t('app.tangible.arrows')} {t('app.tangible.toMove')}
        </div>
      )}
      {autoGhostNotice && ghost && (
        <div className="auto-ghost-notice" role="status">
          {autoGhostNotice === 'auto-open'
            ? t('app.ghostNotice.autoOpen')
            : t('app.ghostNotice.idle')}
          <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd> {t('app.ghostNotice.forceTangible')}
        </div>
      )}
      <WidgetHandle
        api={window.api}
        ghost={ghost}
        onToggleGhost={toggleGhost}
        onReveal={reveal}
        onHoverChange={setHandleHovered}
        color={model.handle_color}
        scale={model.handle_scale}
        positionX={model.handle_position_x}
      />
      <SyncHoldBadge />
      <div className={`app-chrome${chromeHidden ? ' chrome-hidden' : ''}`}>
        <ChromeTopBar
          api={window.api}
          model={model}
          readingMode={readingMode}
          onReadingModeChange={setReadingMode}
          hasAnnotations={hasAnnotations}
          hasIpa={hasIpa}
          scriptHint={scriptHint}
          ipaInfo={model.ipa_info ?? null}
          ipaGuideOpen={ipaGuideOpen}
          onIpaGuideToggle={() => setIpaGuideOpen((v) => !v)}
          translationView={translationView}
          onTranslationViewChange={setTranslationView}
          translationLoading={translationState.loading}
          translationError={translationState.error}
          onCollapse={handleCollapse}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <ChromeBottomBar
          recognition={recognition}
          api={window.api}
          model={model}
          recallHidden={recallHidden}
          onRecallHiddenChange={setRecallHidden}
          pitchMonitor={pitchMonitor}
          melodyRef={melodyRef}
          onManualSearch={() => setManualSearchOpen(true)}
        />
      </div>
      {ipaGuideOpen && (
        <IpaGuide
          ipa={model.current_line.ipa}
          label={model.ipa_info?.label}
          onClose={() => setIpaGuideOpen(false)}
        />
      )}
      {manualSearchOpen && (
        <ManualSearch
          onClose={() => setManualSearchOpen(false)}
          initialTitle={model.track_title ?? undefined}
          initialArtist={model.track_artist ?? undefined}
        />
      )}
      <SettingsPanel
        open={settingsOpen}
        onClose={closeSettings}
        autoStart={autoStart}
        onAutoStartChange={setAutoStart}
        teacherRef={teacherRef}
        trackTitle={model.track_title ?? undefined}
        trackArtist={model.track_artist ?? undefined}
      />
      <BetaWelcome
        open={welcomeOpen}
        onDone={dismissWelcome}
        onOpenSettings={openSettingsFromWelcome}
      />
    </>
  );
}

function App() {
  useEffect(() => {
    if (!window.api) {
      console.warn(
        '[App] window.api no disponible — ejecutando en modo navegador. ' +
          'Para la app completa usa `npm run dev:electron`.',
      );
    }
  }, []);

  return (
    <RenderModelProvider>
      <AppContent />
    </RenderModelProvider>
  );
}

export default App;
