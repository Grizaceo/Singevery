import React from 'react';
import type { ReadingMode, RenderModel } from '../types';
import { LineView } from './LineView';
import { TrackHeader } from './TrackHeader';
import { splitPreviousTiers, splitNextTiers, tierSizes } from './teleprompterHelpers';
import '../Teleprompter.css';

interface Props {
  model: RenderModel;
  readingMode: ReadingMode;
  showTranslation?: boolean;
  chromeHidden?: boolean;
  ghost?: boolean;
}

// La prop `ghost` queda en la interfaz por compatibilidad (App la pasa), pero
// hoy el efecto fantasma se maneja fuera del teleprompter.
export const Teleprompter = React.memo(function Teleprompter({
  model,
  readingMode,
  showTranslation = false,
  chromeHidden = false,
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
  const sizes = tierSizes(model.font_scale, fastPace);

  const isIdle = model.status === 'IDLE';
  const prevTiers = splitPreviousTiers(model.previous_lines);
  const nextTiers = splitNextTiers(model.next_lines);

  return (
    <div className={`teleprompter-container${vignetteClass}`} style={containerStyle}>
      <TrackHeader model={model} chromeHidden={chromeHidden} />

      {!isIdle && (
        <div className="lyrics-panel">
          <div className="lyrics-display">
            <div className="lyrics-far" style={{ fontSize: sizes.far }}>
              {prevTiers.far.map((line, i) => (
                <LineView key={`prev-far-${i}`} line={line} mode={readingMode} tier="far" />
              ))}
            </div>

            <div className="lyrics-adjacent" style={{ fontSize: sizes.prevAdjacent }}>
              {prevTiers.adjacent.map((line, i) => (
                <LineView key={`prev-adj-${i}`} line={line} mode={readingMode} tier="adjacent" />
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
                showTranslation={showTranslation}
              />
            </div>

            <div
              className={`lyrics-adjacent${fastPace ? ' lyrics-next-fast' : ''}`}
              style={{ fontSize: sizes.nextAdjacent }}
            >
              {nextTiers.adjacent.map((line, i) => (
                <LineView key={`next-adj-${i}`} line={line} mode={readingMode} tier="adjacent" />
              ))}
            </div>

            <div className="lyrics-far" style={{ fontSize: sizes.far }}>
              {nextTiers.far.map((line, i) => (
                <LineView key={`next-far-${i}`} line={line} mode={readingMode} tier="far" />
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
