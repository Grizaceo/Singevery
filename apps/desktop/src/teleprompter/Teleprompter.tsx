import React from 'react';
import type { ReadingMode, RenderModel, TranslationView } from '../types';
import { LineView } from './LineView';
import { splitPreviousTiers, splitNextTiers, tierSizes } from './teleprompterHelpers';
import type { MelodyPoint } from '../audio/melody';
import '../Teleprompter.css';

interface Props {
  model: RenderModel;
  readingMode: ReadingMode;
  translationView?: TranslationView;
  chromeHidden?: boolean;
  ghost?: boolean;
  /** Melodía de referencia (práctica vocal). null = sin referencia. */
  melody?: MelodyPoint[] | null;
  /** true = monitor de pitch activo (columnas de entonación visibles). */
  pitchActive?: boolean;
}

// La prop `ghost` queda en la interfaz por compatibilidad (App la pasa), pero
// hoy el efecto fantasma se maneja fuera del teleprompter.
export const Teleprompter = React.memo(function Teleprompter({
  model,
  readingMode,
  translationView = 'off',
  chromeHidden = false,
  melody = null,
  pitchActive = false,
}: Props) {
  const containerStyle: React.CSSProperties = {
    transform: model.mirror_mode ? 'scaleX(-1)' : 'none',
    opacity: model.opacity,
    textAlign: model.alignment,
    transition: 'opacity 0.4s ease, color 0.4s ease',
    ['--lyrics-color' as string]: model.text_color ?? '#ffffff',
  };

  const vignetteClass = model.text_vignette_light ? ' vignette-light' : '';

  const fastPace = Boolean(model.fast_pace);
  // Cuanto más contexto pida el usuario, más chico el texto: si no, con 5
  // líneas por lado la letra se sale de la ventana.
  const contextLines = model.previous_lines.length + model.next_lines.length;
  const sizes = tierSizes(model.font_scale, fastPace, contextLines);

  const isIdle = model.status === 'IDLE';
  const prevTiers = splitPreviousTiers(model.previous_lines);
  const nextTiers = splitNextTiers(model.next_lines);
  const sideBySide = translationView === 'side';

  return (
    <div className={`teleprompter-container${vignetteClass}`} style={containerStyle}>
      {/* El título/artista ya no flota aquí: vive en la barra superior
          (ChromeTopBar) como elemento central del flex, para que no pueda
          solaparse con los controles. */}
      {!isIdle && (
        <div className="lyrics-panel">
          <div className={`lyrics-display${sideBySide ? ' lyrics-side' : ''}`}>
            {sideBySide && (
              <div className="lyrics-side-header" aria-hidden="true">
                <span>Letra</span>
                <span>Traducción</span>
              </div>
            )}

            <div className="lyrics-far" style={{ fontSize: sizes.far }}>
              {prevTiers.far.map((line, i) => (
                <LineView
                  key={`prev-far-${i}`}
                  line={line}
                  mode={readingMode}
                  tier="far"
                  translationView={translationView}
                  melody={melody}
                  pitchActive={pitchActive}
                />
              ))}
            </div>

            <div className="lyrics-adjacent" style={{ fontSize: sizes.prevAdjacent }}>
              {prevTiers.adjacent.map((line, i) => (
                <LineView
                  key={`prev-adj-${i}`}
                  line={line}
                  mode={readingMode}
                  tier="adjacent"
                  translationView={translationView}
                  melody={melody}
                  pitchActive={pitchActive}
                />
              ))}
            </div>

            <div className="lyrics-current" style={{ fontSize: sizes.current }}>
              <LineView
                line={model.current_line}
                mode={readingMode}
                tier="current"
                progress={model.current_line_progress}
                wordIndex={model.current_word_index}
                wordProgress={model.current_word_progress}
                translationView={translationView}
                melody={melody}
                pitchActive={pitchActive}
              />
            </div>

            <div
              className={`lyrics-adjacent${fastPace ? ' lyrics-next-fast' : ''}`}
              style={{ fontSize: sizes.nextAdjacent }}
            >
              {nextTiers.adjacent.map((line, i) => (
                <LineView
                  key={`next-adj-${i}`}
                  line={line}
                  mode={readingMode}
                  tier="adjacent"
                  translationView={translationView}
                  melody={melody}
                  pitchActive={pitchActive}
                />
              ))}
            </div>

            <div className="lyrics-far" style={{ fontSize: sizes.far }}>
              {nextTiers.far.map((line, i) => (
                <LineView
                  key={`next-far-${i}`}
                  line={line}
                  mode={readingMode}
                  tier="far"
                  translationView={translationView}
                  melody={melody}
                  pitchActive={pitchActive}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {isIdle && (
        <div className={`idle-footer${chromeHidden ? ' is-hidden' : ''}`}>{model.current_line.text}</div>
      )}
    </div>
  );
});
