import React from 'react';
import type { ReadingMode, RenderLine, RenderModel } from './types';
import './Teleprompter.css';

interface Props {
    model: RenderModel;
    readingMode: ReadingMode;
}

/** Render seguro de una línea según el modo de lectura. */
const LineView: React.FC<{
    line: RenderLine;
    mode: ReadingMode;
    prominent?: boolean;
}> = ({ line, mode, prominent = false }) => {
    const hasFurigana = !!line.furigana && line.furigana.length > 0;
    const hasRomaji = !!line.romaji;

    // Modo solo-romaji: la línea principal ES el romaji (cae a texto si no hay).
    if (mode === 'romaji') {
        return <p className="line-main">{hasRomaji ? line.romaji : line.text}</p>;
    }

    const showRuby = (mode === 'furigana' || mode === 'furigana_romaji') && hasFurigana;
    // El romaji debajo se muestra solo en la línea prominente (actual) para no
    // saturar el contexto previo/siguiente.
    const showRomajiBelow = mode === 'furigana_romaji' && hasRomaji && prominent;

    return (
        <>
            <p className="line-main">
                {showRuby
                    ? line.furigana!.map((seg, i) =>
                          seg.rt ? (
                              <ruby key={i}>
                                  {seg.base}
                                  <rt>{seg.rt}</rt>
                              </ruby>
                          ) : (
                              <span key={i}>{seg.base}</span>
                          ),
                      )
                    : line.text}
            </p>
            {showRomajiBelow && <p className="line-romaji">{line.romaji}</p>}
        </>
    );
};

export const Teleprompter: React.FC<Props> = ({ model, readingMode }) => {
    const containerStyle: React.CSSProperties = {
        transform: model.mirror_mode ? 'scaleX(-1)' : 'none',
        opacity: model.opacity,
        textAlign: model.alignment,
    };

    const fontSize = `${4 * model.font_scale}rem`;

    const isIdle = model.status === 'IDLE';

    return (
        <div className="teleprompter-container" style={containerStyle}>
            <div className="status-indicator">{model.status}</div>

            {!isIdle && (
                <div className="lyrics-panel">
                    <div className="lyrics-display">
                        <div className="lyrics-previous">
                            {model.previous_lines.map((line, i) => (
                                <LineView key={`prev-${i}`} line={line} mode={readingMode} />
                            ))}
                        </div>

                        <div className="lyrics-current" style={{ fontSize }}>
                            <LineView line={model.current_line} mode={readingMode} prominent />
                        </div>

                        <div className="lyrics-next">
                            {model.next_lines.map((line, i) => (
                                <LineView key={`next-${i}`} line={line} mode={readingMode} />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {(model.track_title || model.track_artist) && (
                <div className="track-info">
                    <h2>{model.track_title}</h2>
                    <h3>{model.track_artist}</h3>
                </div>
            )}

            {isIdle && (
                <div className="idle-footer">{model.current_line.text}</div>
            )}
        </div>
    );
};
