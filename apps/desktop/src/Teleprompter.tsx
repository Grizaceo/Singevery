import React from 'react';
import type { LyricWord, ReadingMode, RenderLine, RenderModel } from './types';
import { splitAtFraction, splitSegmentsAtFraction } from './lineHighlight';
import './Teleprompter.css';

interface Props {
    model: RenderModel;
    readingMode: ReadingMode;
    /** Cuando true, la UI de chrome está oculta (solo letra) → header se atenúa. */
    chromeHidden?: boolean;
}

/** Nivel jerárquico de una línea: centro / subtítulo adyacente / contexto lejano. */
type Tier = 'current' | 'adjacent' | 'far';

/** Render por palabra (A2): las ya cantadas se atenúan, la activa se parte por
 *  su avance, las pendientes se mantienen brillantes. */
function WordsView({
    words,
    activeIndex,
    wordProgress,
}: {
    words: LyricWord[];
    activeIndex: number;
    wordProgress: number;
}) {
    return (
        <>
            {words.map((w, i) => {
                if (i < activeIndex) {
                    return (
                        <span key={i} className="line-spoken">
                            {w.text}
                        </span>
                    );
                }
                if (i === activeIndex && wordProgress > 0) {
                    const [spoken, rest] = splitAtFraction(w.text, wordProgress);
                    return (
                        <React.Fragment key={i}>
                            {spoken && <span className="line-spoken">{spoken}</span>}
                            {rest}
                        </React.Fragment>
                    );
                }
                return <span key={i}>{w.text}</span>;
            })}
        </>
    );
}

/** Render seguro de una línea según el modo de lectura. */
const LineView: React.FC<{
    line: RenderLine;
    mode: ReadingMode;
    tier: Tier;
    /** Avance 0..1 dentro de la línea (solo tier 'current'). Atenúa lo ya cantado. */
    progress?: number;
    /** Índice de palabra activa (A2, solo tier 'current' con words). */
    wordIndex?: number;
    /** Avance 0..1 dentro de la palabra activa (A2). */
    wordProgress?: number;
}> = ({ line, mode, tier, progress, wordIndex, wordProgress }) => {
    const hasFurigana = !!line.furigana && line.furigana.length > 0;
    const hasRomaji = !!line.romaji;

    // Solo la línea actual se resalta; y solo cuando hay progreso real (>0).
    const highlight = tier === 'current' && progress != null && progress > 0;
    const frac = progress ?? 0;
    // Modo palabra (A2): aplica cuando la línea actual tiene words y estamos
    // renderizando el texto plano (original / furigana sin furigana).
    const useWords =
        tier === 'current' && !!line.words && line.words.length > 0 && wordIndex != null;

    // Modo solo-romaji: la línea principal ES el romaji (cae a texto si no hay).
    if (mode === 'romaji') {
        const text = hasRomaji ? line.romaji! : line.text;
        if (!highlight) return <p className="line-main">{text}</p>;
        const [spoken, rest] = splitAtFraction(text, frac);
        return (
            <p className="line-main">
                {spoken && <span className="line-spoken">{spoken}</span>}
                {rest}
            </p>
        );
    }

    const showRuby = (mode === 'furigana' || mode === 'furigana_romaji') && hasFurigana;
    // El romaji debajo solo en la línea central, para no saturar el contexto.
    const showRomajiBelow = mode === 'furigana_romaji' && hasRomaji && tier === 'current';

    let mainContent: React.ReactNode;
    if (showRuby) {
        if (!highlight) {
            mainContent = line.furigana!.map((seg, i) =>
                seg.rt ? (
                    <ruby key={i}>
                        {seg.base}
                        <rt>{seg.rt}</rt>
                    </ruby>
                ) : (
                    <span key={i}>{seg.base}</span>
                ),
            );
        } else {
            // Resaltado por segmento: los ya cantados se atenúan, los pendientes
            // se mantienen brillantes (metáfora de teleprompter: leer lo que viene).
            const { spoken, unspoken } = splitSegmentsAtFraction(line.furigana!, frac);
            mainContent = (
                <>
                    {spoken.map((seg, i) =>
                        seg.rt ? (
                            <ruby key={`s${i}`} className="line-spoken">
                                {seg.base}
                                <rt>{seg.rt}</rt>
                            </ruby>
                        ) : (
                            <span key={`s${i}`} className="line-spoken">
                                {seg.base}
                            </span>
                        ),
                    )}
                    {unspoken.map((seg, i) =>
                        seg.rt ? (
                            <ruby key={`u${i}`}>
                                {seg.base}
                                <rt>{seg.rt}</rt>
                            </ruby>
                        ) : (
                            <span key={`u${i}`}>{seg.base}</span>
                        ),
                    )}
                </>
            );
        }
    } else if (useWords) {
        // Texto plano con timestamps por palabra (A2): resaltado palabra a palabra.
        mainContent = (
            <WordsView
                words={line.words!}
                activeIndex={wordIndex!}
                wordProgress={wordProgress ?? 0}
            />
        );
    } else {
        // Texto plano (original, o furigana sin furigana disponible).
        if (!highlight) {
            mainContent = line.text;
        } else {
            const [spoken, rest] = splitAtFraction(line.text, frac);
            mainContent = (
                <>
                    {spoken && <span className="line-spoken">{spoken}</span>}
                    {rest}
                </>
            );
        }
    }

    return (
        <>
            <p className="line-main">{mainContent}</p>
            {showRomajiBelow && <p className="line-romaji">{line.romaji}</p>}
        </>
    );
};

const STATUS_LABEL: Record<string, string> = {
    IDLE: 'Esperando',
    LISTENING: 'Escuchando',
    IDENTIFYING: 'Identificando',
    FETCHING_LYRICS: 'Buscando letra',
    DISPLAYING: '',
    NO_LYRICS: 'Sin letra',
    ERROR: 'Error',
};

export const Teleprompter: React.FC<Props> = ({ model, readingMode, chromeHidden = false }) => {
    const containerStyle: React.CSSProperties = {
        transform: model.mirror_mode ? 'scaleX(-1)' : 'none',
        opacity: model.opacity,
        textAlign: model.alignment,
    };

    // Tamaños relativos al font_scale. La central manda; los subtítulos
    // adyacentes son legibles pero menores; el contexto lejano es discreto.
    const currentSize = `${4 * model.font_scale}rem`;
    const adjacentSize = `${2.1 * model.font_scale}rem`;
    const farSize = `${1.35 * model.font_scale}rem`;

    const isIdle = model.status === 'IDLE';
    const hasTrack = !!(model.track_title || model.track_artist);
    const statusLabel = STATUS_LABEL[model.status] ?? model.status;

    // Partir el contexto en "adyacente" (1 línea pegada) y "lejano" (el resto).
    const prev = model.previous_lines;
    const next = model.next_lines;
    const prevFar = prev.slice(0, Math.max(0, prev.length - 1));
    const prevAdjacent = prev.slice(Math.max(0, prev.length - 1));
    const nextAdjacent = next.slice(0, 1);
    const nextFar = next.slice(1);

    return (
        <div className="teleprompter-container" style={containerStyle}>

            {/* Header superior-centro: título + artista; estado cuando aplica */}
            <div className={`track-header${chromeHidden ? ' is-hidden' : ''}`}>
                {hasTrack ? (
                    <>
                        {model.track_title && <div className="track-header-title">{model.track_title}</div>}
                        {model.track_artist && <div className="track-header-artist">{model.track_artist}</div>}
                        {statusLabel && <div className="track-header-status">{statusLabel}</div>}
                    </>
                ) : (
                    statusLabel && <div className="track-header-status">{statusLabel}</div>
                )}
            </div>

            {!isIdle && (
                <div className="lyrics-panel">
                    <div className="lyrics-display">
                        <div className="lyrics-far" style={{ fontSize: farSize }}>
                            {prevFar.map((line, i) => (
                                <LineView key={`prev-far-${i}`} line={line} mode={readingMode} tier="far" />
                            ))}
                        </div>

                        <div className="lyrics-adjacent" style={{ fontSize: adjacentSize }}>
                            {prevAdjacent.map((line, i) => (
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
                            {nextAdjacent.map((line, i) => (
                                <LineView key={`next-adj-${i}`} line={line} mode={readingMode} tier="adjacent" />
                            ))}
                        </div>

                        <div className="lyrics-far" style={{ fontSize: farSize }}>
                            {nextFar.map((line, i) => (
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
};
