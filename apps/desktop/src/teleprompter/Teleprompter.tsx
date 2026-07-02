import React from 'react';
import type { ReadingMode, RenderModel } from '../types';
import { LineView } from './LineView';
import { TrackHeader } from './TrackHeader';
import { splitPreviousTiers, splitNextTiers } from './teleprompterHelpers';
import '../Teleprompter.css';

interface Props {
  model: RenderModel;
  readingMode: ReadingMode;
  chromeHidden?: boolean;
}

export const Teleprompter = React.memo(function Teleprompter({
  model,
  readingMode,
  chromeHidden = false,
}: Props) {
  const containerStyle: React.CSSProperties = {
    transform: model.mirror_mode ? 'scaleX(-1)' : 'none',
    opacity: model.opacity,
    textAlign: model.alignment,
  };

  const currentSize = `${4 * model.font_scale}rem`;
  const adjacentSize = `${2.1 * model.font_scale}rem`;
  const farSize = `${1.35 * model.font_scale}rem`;

  const isIdle = model.status === 'IDLE';
  const prevTiers = splitPreviousTiers(model.previous_lines);
  const nextTiers = splitNextTiers(model.next_lines);

  return (
    <div className="teleprompter-container" style={containerStyle}>
      <TrackHeader model={model} chromeHidden={chromeHidden} />

      {!isIdle && (
        <div className="lyrics-panel">
          <div className="lyrics-display">
            <div className="lyrics-far" style={{ fontSize: farSize }}>
              {prevTiers.far.map((line, i) => (
                <LineView key={`prev-far-${i}`} line={line} mode={readingMode} tier="far" />
              ))}
            </div>

            <div className="lyrics-adjacent" style={{ fontSize: adjacentSize }}>
              {prevTiers.adjacent.map((line, i) => (
                <LineView key={`prev-adj-${i}`} line={line} mode={readingMode} tier="adjacent" />
              ))}
            </div>

            <div className="lyrics-current" style={{ fontSize: currentSize }}>
              <LineView
                line={model.current_line}
                mode={readingMode}
                tier="current"
                progress={model.current_line_progress}
                wordIndex={model.current_word_index}
                wordProgress={model.current_word_progress}
              />
            </div>

            <div className="lyrics-adjacent" style={{ fontSize: adjacentSize }}>
              {nextTiers.adjacent.map((line, i) => (
                <LineView key={`next-adj-${i}`} line={line} mode={readingMode} tier="adjacent" />
              ))}
            </div>

            <div className="lyrics-far" style={{ fontSize: farSize }}>
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
