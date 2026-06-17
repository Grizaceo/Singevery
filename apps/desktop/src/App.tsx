import { useState, useEffect, useRef } from 'react';
import { Teleprompter } from './Teleprompter';
import { DebugLyricsInput } from './DebugLyricsInput';
import { RecognitionControls } from './RecognitionControls';
import { SyncControls } from './SyncControls';
import { ReadingControls } from './ReadingControls';
import { WindowControls } from './WindowControls';
import { useReadingMode } from './useReadingMode';
import { useHighContrast } from './useHighContrast';
import { INITIAL_RENDER_MODEL } from './initialModel';
import type { RenderModel, DesktopApi } from './types';
import './App.css';

declare global {
  interface Window {
    api?: DesktopApi;
  }
}

function App() {
  const [model, setModel] = useState<RenderModel>(INITIAL_RENDER_MODEL);
  const [bgLuminance, setBgLuminance] = useState<number | undefined>(undefined);
  const [readingMode, setReadingMode] = useReadingMode();
  const [highContrast, toggleHighContrast] = useHighContrast();
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);

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

    const unsubLum = window.api.onBackgroundLuminance((value) => {
      setBgLuminance(value);
    });

    return () => {
      unsubscribe();
      unsubLum();
    };
  }, []);

  // Modelo enriquecido con luminancia del fondo (se inyecta en el RenderModel
  // para que el Teleprompter decida el color del texto).
  const enrichedModel: RenderModel = { ...model, background_luminance: bgLuminance };

  return (
    <>
      <Teleprompter model={enrichedModel} readingMode={readingMode} highContrast={highContrast} />
      <RecognitionControls />
      <SyncControls />
      <ReadingControls
        mode={readingMode}
        onChange={setReadingMode}
        highContrast={highContrast}
        onToggleHighContrast={toggleHighContrast}
      />
      <DebugLyricsInput />
      <WindowControls api={window.api} />
    </>
  );
}

export default App;
