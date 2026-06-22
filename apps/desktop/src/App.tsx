import { useState, useEffect, useRef, useCallback } from 'react';
import { Teleprompter } from './Teleprompter';
import { DebugLyricsInput } from './DebugLyricsInput';
import { RecognitionControls } from './RecognitionControls';
import { SyncControls } from './SyncControls';
import { ReadingControls } from './ReadingControls';
import { WindowControls } from './WindowControls';
import { ResizeGrip } from './ResizeGrip';
import { useReadingMode } from './useReadingMode';
import { INITIAL_RENDER_MODEL } from './initialModel';
import type { RenderModel, DesktopApi } from './types';
import './App.css';

declare global {
  interface Window {
    api?: DesktopApi;
  }
}

/** Tiempo de inactividad del mouse tras el cual se oculta la UI (ms). */
const CHROME_IDLE_MS = 2800;

function App() {
  const [model, setModel] = useState<RenderModel>(INITIAL_RENDER_MODEL);
  const [readingMode, setReadingMode] = useReadingMode();
  const [chromeVisible, setChromeVisible] = useState(true);
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);
  const hideTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Fase 0: si window.api no existe (ej. corriendo en navegador puro con
    // `npm run dev:vite`), se simula el estado inicial para no romper el UI.
    if (!window.api) {
      console.warn(
        '[App] window.api no disponible — ejecutando en modo navegador. ' +
          'Para la app completa usa `npm run dev:electron`.'
      );
      const interval = window.setInterval(() => {
        setModel((prev) => ({ ...prev }));
      }, 500);
      return () => window.clearInterval(interval);
    }

    const unsubscribe = window.api.onRenderModel((next) => {
      setModel(next);
    });
    unsubscribeRef.current = unsubscribe;

    return () => {
      unsubscribe();
    };
  }, []);

  // Auto-ocultar la UI mientras se muestra la letra sincronizada. A diferencia
  // de antes, el simple movimiento del mouse NO revela los controles: durante
  // DISPLAYING el widget es "intangible" (los clics pasan a la app de detrás) y
  // solo el handle persistente vuelve a mostrar la UI. Así puedes seguir
  // jugando/clicando encima de la letra. Fuera de DISPLAYING siempre visible.
  const isDisplaying = model.status === 'DISPLAYING';

  // Revela los controles y reinicia el temporizador de ocultación.
  const reveal = useCallback(() => {
    setChromeVisible(true);
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setChromeVisible(false), CHROME_IDLE_MS);
  }, []);

  useEffect(() => {
    if (!isDisplaying) return;
    // Al entrar en DISPLAYING, ocultar la UI tras el primer periodo de inactividad.
    hideTimerRef.current = window.setTimeout(() => setChromeVisible(false), CHROME_IDLE_MS);
    return () => {
      window.clearTimeout(hideTimerRef.current);
      // Al salir de DISPLAYING, dejar la UI visible para la próxima vez.
      setChromeVisible(true);
    };
  }, [isDisplaying]);

  // Mantener la UI viva mientras está visible: cualquier actividad reinicia el
  // temporizador. Cuando se oculta, estos listeners se retiran, de modo que
  // mover el mouse sobre la letra ya NO la revela (solo el handle lo hace).
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

  // El widget se vuelve intangible (click-through) exactamente cuando la chrome
  // está oculta durante DISPLAYING. El handle persistente sigue siendo tangible
  // porque al pasar el cursor por encima dispara `reveal`, que desactiva el
  // modo intangible antes de cualquier clic.
  useEffect(() => {
    window.api?.setClickThrough?.(chromeHidden);
  }, [chromeHidden]);

  // Detecta si las letras cargadas tienen furigana o romaji en alguna línea.
  const hasAnnotations =
    model.status === 'DISPLAYING' &&
    [...model.previous_lines, model.current_line, ...model.next_lines].some(
      (l) => l.furigana != null || l.romaji != null,
    );

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
            // Clic derecho sobre el handle: muestra las opciones del widget.
            e.preventDefault();
            reveal();
          }}
        >
          ⋮⋮
        </div>
      )}
      <div className={`app-chrome${chromeHidden ? ' chrome-hidden' : ''}`}>
        <RecognitionControls />
        <SyncControls />
        <ReadingControls mode={readingMode} onChange={setReadingMode} hasAnnotations={hasAnnotations} />
        <DebugLyricsInput />
        <WindowControls api={window.api} />
        <ResizeGrip api={window.api} />
      </div>
    </>
  );
}

export default App;
