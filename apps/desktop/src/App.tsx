import { useCallback, useEffect, useRef, useState } from 'react';
import { Teleprompter } from './teleprompter/Teleprompter';
import { DebugLyricsInput } from './DebugLyricsInput';
import { ChromeTopBar } from './ChromeTopBar';
import { ChromeBottomBar } from './ChromeBottomBar';
import { SettingsPanel } from './SettingsPanel';
import { Pill } from './Pill';
import { useReadingMode } from './useReadingMode';
import { useRecognition } from './useRecognition';
import { RenderModelProvider, useRenderModel } from './renderModelContext';
import './App.css';

declare global {
  interface Window {
    api?: import('./types').DesktopApi;
  }
}

const CHROME_IDLE_MS = 2800;

function AppContent() {
  const model = useRenderModel();
  const [readingMode, setReadingMode] = useReadingMode();
  const [chromeVisible, setChromeVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const hideTimerRef = useRef<number | undefined>(undefined);
  const prevTrackRef = useRef<string | undefined>(undefined);

  const recognition = useRecognition();

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

  const handleCollapse = useCallback(() => {
    setCollapsed(true);
    setSettingsOpen(false);
  }, []);

  const isDisplaying = model.status === 'DISPLAYING';

  const reveal = useCallback(() => {
    setChromeVisible(true);
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setChromeVisible(false), CHROME_IDLE_MS);
  }, []);

  useEffect(() => {
    if (!isDisplaying) return;
    hideTimerRef.current = window.setTimeout(() => setChromeVisible(false), CHROME_IDLE_MS);
    return () => {
      window.clearTimeout(hideTimerRef.current);
      setChromeVisible(true);
    };
  }, [isDisplaying]);

  useEffect(() => {
    if (!isDisplaying || !chromeVisible) return;
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
  }, [isDisplaying, chromeVisible, reveal]);

  const chromeHidden = isDisplaying && !chromeVisible;

  useEffect(() => {
    window.api?.setClickThrough?.(chromeHidden && !settingsOpen);
  }, [chromeHidden, settingsOpen]);

  const hasAnnotations =
    model.status === 'DISPLAYING' &&
    [...model.previous_lines, model.current_line, ...model.next_lines].some(
      (l) => l.furigana != null || l.romaji != null,
    );

  if (collapsed) {
    return <Pill onSing={handleSing} />;
  }

  return (
    <>
      <Teleprompter model={model} readingMode={readingMode} chromeHidden={chromeHidden} />
      {isDisplaying && (
        <div
          className="intangible-handle"
          title="Arrastra para mover · clic derecho para ver las opciones"
          aria-label="Mover widget y mostrar controles"
          onMouseEnter={reveal}
          onMouseMove={reveal}
          onContextMenu={(e) => {
            e.preventDefault();
            reveal();
          }}
        >
          ⋮⋮
        </div>
      )}
      <div className={`app-chrome${chromeHidden ? ' chrome-hidden' : ''}`}>
        <ChromeTopBar
          api={window.api}
          readingMode={readingMode}
          onReadingModeChange={setReadingMode}
          hasAnnotations={hasAnnotations}
          onCollapse={handleCollapse}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <ChromeBottomBar recognition={recognition} api={window.api} />
        {import.meta.env.DEV && <DebugLyricsInput />}
      </div>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
