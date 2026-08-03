import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Teleprompter } from './teleprompter/Teleprompter';
import { DebugLyricsInput } from './DebugLyricsInput';
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
import { RenderModelProvider, useRenderModel } from './renderModelContext';
import { detectScriptFromLines } from './scriptDetect';
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
  const model = useRenderModel();
  const [readingMode, setReadingMode] = useReadingMode();
  const [translationView, setTranslationView, translationState] = useTranslationView();
  const [chromeVisible, setChromeVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(shouldShowBetaWelcome);
  const [recallHidden, setRecallHidden] = useState(false);
  const [collapsed, setCollapsed] = useState(() => !welcomeOpen);
  const [ghost, setGhost] = useState(false);
  const [handleHovered, setHandleHovered] = useState(false);
  // Modo tangible forzado por atajo global (Ctrl+Alt+T). Es la vía de escape
  // cuando hay un juego en primer plano: el overlay no recibe el hover del
  // mouse, así que sin teclado no habría forma de agarrarlo para moverlo.
  const [tangible, setTangible] = useState(false);
  const hideTimerRef = useRef<number | undefined>(undefined);
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
  const melodyRef = useMelodyReference(trackKey, pitchMonitor.active, getPositionMs);

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
      }
    });
  }, []);

  useEffect(() => {
    void window.api?.setCollapsed?.(collapsed);
  }, [collapsed]);

  useEffect(() => {
    const t = model.track_title;
    if (t && t !== prevTrackRef.current && collapsed) {
      setCollapsed(false);
    }
    prevTrackRef.current = t;
  }, [model.track_title, collapsed]);

  // F2: al cambiar de canción (trackKey distinto), re-traducir la letra nueva
  // si la vista de traducción está activa. El ref evita re-disparos por el
  // objeto translate que se recrea en cada render.
  const translateRef = useRef(translationState.translate);
  translateRef.current = translationState.translate;
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

  const handleCollapse = useCallback(() => {
    setCollapsed(true);
    setSettingsOpen(false);
    setGhost(false);
  }, []);

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

  const chromeHidden = !tangible && (ghost || (isDisplaying && !chromeVisible));

  useEffect(() => {
    const clickThrough =
      !tangible && !settingsOpen && !welcomeOpen && (ghost ? !handleHovered : chromeHidden);
    window.api?.setClickThrough?.(clickThrough);
  }, [ghost, handleHovered, chromeHidden, settingsOpen, tangible, welcomeOpen]);

  const hasAnnotations =
    model.status === 'DISPLAYING' &&
    [...model.previous_lines, model.current_line, ...model.next_lines].some(
      (l) => l.furigana != null || l.romaji != null || l.kana != null,
    );

  const scriptHint = useMemo(() => {
    if (model.status !== 'DISPLAYING') return 'latin' as const;
    return detectScriptFromLines([
      ...model.previous_lines.map((l) => l.text),
      model.current_line.text,
      ...model.next_lines.map((l) => l.text),
    ]);
  }, [model]);

  if (collapsed) {
    return <Pill onSing={handleSing} />;
  }

  return (
    <>
      <Teleprompter
        model={model}
        readingMode={readingMode}
        translationView={translationView}
        chromeHidden={chromeHidden}
        ghost={ghost}
        melody={melodyRef.reference}
        pitchActive={pitchMonitor.active}
        recallHidden={recallHidden}
      />
      {tangible && (
        <div className="tangible-badge" role="status">
          Modo tangible · <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>T</kbd> para soltar ·{' '}
          <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+flechas para mover
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
      <div className={`app-chrome${chromeHidden ? ' chrome-hidden' : ''}`}>
        <ChromeTopBar
          api={window.api}
          model={model}
          readingMode={readingMode}
          onReadingModeChange={setReadingMode}
          hasAnnotations={hasAnnotations}
          scriptHint={scriptHint}
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
        />
        {import.meta.env.DEV && <DebugLyricsInput />}
      </div>
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        autoStart={autoStart}
        onAutoStartChange={setAutoStart}
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
