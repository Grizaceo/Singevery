import React from 'react';
import type { FuriganaSegment, ReadingMode, RenderLine, RenderModel, Status, WordTiming } from './types';
import './Teleprompter.css';

/** Traduce el enum crudo de estado a una etiqueta corta legible. */
const STATUS_LABEL: Record<Status, string> = {
    IDLE: '⏸ Esperando',
    LISTENING: '🎙 Escuchando',
    IDENTIFYING: '🔎 Identificando',
    FETCHING_LYRICS: '⏳ Buscando letra',
    DISPLAYING: '▶ Sincronizado',
    NO_LYRICS: '❌ Sin letra',
    ERROR: '⚠ Error',
};

interface Props {
    model: RenderModel;
    readingMode: ReadingMode;
    highContrast: boolean;
}

/**
 * Karaoke por palabra. Dos modos:
 *  - `wordIndex` (Enhanced LRC A2, real): marca como "cantadas" las palabras
 *    cuyo índice <= wordIndex (precisión por timing, no interpolado).
 *  - `progress` (fallback): marca las primeras `ceil(progress * n)` palabras.
 * Se usa para texto latino (romaji) separado por espacios.
 */
const KaraokeText: React.FC<{ text: string; progress?: number; wordIndex?: number }> = ({
    text,
    progress,
    wordIndex,
}) => {
    const tokens = text.split(/(\s+)/);
    const isWord = (t: string): boolean => /\S/.test(t);
    const total = tokens.filter(isWord).length;
    // wordIndex = índice de la palabra ACTIVA (0-based). "Cantadas" = hasta ella.
    // -1 = ninguna aún (antes de la 1ª palabra).
    const active =
        typeof wordIndex === 'number'
            ? wordIndex + 1
            : progress != null
                ? Math.ceil(Math.max(0, Math.min(1, progress)) * total)
                : 0;
    return (
        <>
            {tokens.map((tok, i) => {
                if (!isWord(tok)) return tok;
                const wordIdx = tokens.slice(0, i).filter(isWord).length;
                return (
                    <span key={i} className={`kw${wordIdx < active ? ' kw-done' : ''}`}>
                        {tok}
                    </span>
                );
            })}
        </>
    );
};

/**
 * Karaoke sobre el texto ORIGINAL con furigana (Enhanced LRC A2). Cada "word"
 * timed es un fragmento del texto original; se resaltan los segmentos cantados.
 * Sin A2 → render plano sin resaltado por palabra (solo la línea completa).
 */
const KaraokeFurigana: React.FC<{
    text: string;
    furigana?: FuriganaSegment[];
    words?: WordTiming[];
    wordIndex?: number;
}> = ({ text, furigana, words, wordIndex }) => {
    // Sin furigana: resalta el texto plano por palabra timed (si las hay) o lo
    // deja plano.
    if (!furigana || furigana.length === 0) {
        if (!words || words.length === 0 || typeof wordIndex !== 'number') {
            return <span>{text}</span>;
        }
        return (
            <span>
                {words.map((w, i) => (
                    <span key={i} className={`kw${i <= wordIndex ? ' kw-done' : ''}`}>
                        {w.text}
                    </span>
                ))}
            </span>
        );
    }

    // Con furigana: render ruby. No intentamos mapear word-timing a segmentos
    // de furigana (la alineación es frágil); el karaoke real se ve en el romaji
    // de abajo. Aquí solo destacamos con la clase de la línea prominente.
    return (
        <span>
            {furigana.map((seg, i) =>
                seg.rt ? (
                    <ruby key={i}>
                        {seg.base}
                        <rt>{seg.rt}</rt>
                    </ruby>
                ) : (
                    <span key={i}>{seg.base}</span>
                ),
            )}
        </span>
    );
};

/** Render seguro de una línea según el modo de lectura. */
const LineView: React.FC<{
    line: RenderLine;
    mode: ReadingMode;
    prominent?: boolean;
    progress?: number;
    wordIndex?: number;
}> = ({ line, mode, prominent = false, progress, wordIndex }) => {
    const hasFurigana = !!line.furigana && line.furigana.length > 0;
    const hasRomaji = !!line.romaji;
    const hasWords = !!line.words && line.words.length > 0;
    // Karaoke solo en la línea prominente (actual). Precisión real si hay
    // `wordIndex` (Enhanced LRC); si no, interpola con `progress`.
    const canKaraoke = prominent && (typeof wordIndex === 'number' || typeof progress === 'number');

    // Modo solo-romaji: la línea principal ES el romaji (cae a texto si no hay).
    if (mode === 'romaji') {
        return (
            <p className="line-main">
                {hasRomaji
                    ? canKaraoke
                        ? <KaraokeText text={line.romaji!} progress={progress} wordIndex={wordIndex} />
                        : line.romaji
                    : line.text}
            </p>
        );
    }

    const showRuby = (mode === 'furigana' || mode === 'furigana_romaji') && hasFurigana;
    // El romaji debajo se muestra solo en la línea prominente (actual) para no
    // saturar el contexto previo/siguiente.
    const showRomajiBelow = mode === 'furigana_romaji' && hasRomaji && prominent;

    return (
        <>
            <p className="line-main">
                {showRuby
                    ? canKaraoke && hasWords
                        ? <KaraokeFurigana text={line.text} furigana={line.furigana} words={line.words} wordIndex={wordIndex} />
                        : line.furigana!.map((seg, i) =>
                              seg.rt ? (
                                  <ruby key={i}>
                                      {seg.base}
                                      <rt>{seg.rt}</rt>
                                  </ruby>
                              ) : (
                                  <span key={i}>{seg.base}</span>
                              ),
                          )
                    : canKaraoke && hasWords
                        ? <KaraokeFurigana text={line.text} words={line.words} wordIndex={wordIndex} />
                        : line.text}
            </p>
            {showRomajiBelow &&
                (canKaraoke ? (
                    <p className="line-romaji">
                        <KaraokeText text={line.romaji!} progress={progress} wordIndex={wordIndex} />
                    </p>
                ) : (
                    <p className="line-romaji">{line.romaji}</p>
                ))}
        </>
    );
};

const LIGHT_THRESHOLD = 0.55;

export const Teleprompter: React.FC<Props> = ({ model, readingMode, highContrast }) => {
    const containerStyle: React.CSSProperties = {
        transform: model.mirror_mode ? 'scaleX(-1)' : 'none',
        opacity: model.opacity,
        textAlign: model.alignment,
    };

    const fontSize = `${4 * model.font_scale}rem`;

    const isIdle = model.status === 'IDLE';

    // Clases de fondo adaptativo:
    // - highContrast ON → fuerza dark-bg (texto blanco, halo potente 8-dir).
    // - highContrast OFF → usa luminancia del fondo:
    //     > LIGHT_THRESHOLD → light-bg (texto negro, halo blanco fino).
    //     <= LIGHT_THRESHOLD → dark-bg  (texto blanco, halo negro fino).
    // - Sin luminancia (sampler no disponible) → default dark-bg (seguro).
    const bgClass =
        highContrast
            ? 'high-contrast'
            : typeof model.background_luminance === 'number'
                ? model.background_luminance > LIGHT_THRESHOLD
                    ? 'light-bg'
                    : 'dark-bg'
                : 'dark-bg';

    return (
        <div
            className={`teleprompter-container ${bgClass}`}
            style={containerStyle}
        >
            <div className="status-indicator">{STATUS_LABEL[model.status]}</div>

            {!isIdle && (
                <div className="lyrics-panel">
                    <div className="lyrics-display">
                        <div className="lyrics-previous">
                            {model.previous_lines.map((line, i) => (
                                <LineView key={`prev-${i}`} line={line} mode={readingMode} />
                            ))}
                        </div>

                        <div className="lyrics-current" style={{ fontSize }}>
                            <LineView
                                line={model.current_line}
                                mode={readingMode}
                                prominent
                                progress={model.current_progress}
                                wordIndex={model.current_word_index}
                            />
                            {typeof model.current_progress === 'number' && (
                                <div className="line-progress" aria-hidden="true">
                                    <div
                                        className="line-progress-fill"
                                        style={{ width: `${Math.round(model.current_progress * 100)}%` }}
                                    />
                                </div>
                            )}
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
                    {model.lyrics_source && (
                        <span className="lyrics-source-chip" title={'Letra vía ' + model.lyrics_source}>
                            via {model.lyrics_source}
                        </span>
                    )}
                </div>
            )}

            {isIdle && (
                <div className="idle-footer">{model.current_line.text}</div>
            )}
        </div>
    );
};
