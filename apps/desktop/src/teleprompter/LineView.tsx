import React from 'react';
import type { ReadingMode, RenderLine, TranslationView } from '../types';
import { splitAtFraction, splitSegmentsAtFraction } from '../lineHighlight';
import { WordsView } from './WordsView';
import { MelodyStrip } from '../MelodyStrip';
import type { MelodyPoint } from '../audio/melody';

type Tier = 'current' | 'adjacent' | 'far';

interface LineViewProps {
  line: RenderLine;
  mode: ReadingMode;
  tier: Tier;
  progress?: number;
  wordIndex?: number;
  wordProgress?: number;
  /** off = sin traducción; below = bajo la línea actual; side = columna paralela. */
  translationView?: TranslationView;
  /** Melodía de referencia (práctica vocal). null = sin referencia. */
  melody?: MelodyPoint[] | null;
  /** true = monitor de pitch activo (muestra la columna de entonación). */
  pitchActive?: boolean;
  /** Sustituye la letra/lectura por una pista neutra para práctica de recuerdo. */
  concealed?: boolean;
}

/** Texto con la parte ya cantada atenuada (resaltado interpolado). */
function splitHighlighted(text: string, frac: number, highlight: boolean): React.ReactNode {
  if (!highlight) return text;
  const [spoken, rest] = splitAtFraction(text, frac);
  return (
    <>
      {spoken && <span className="line-spoken">{spoken}</span>}
      {rest}
    </>
  );
}

/** Render seguro de una línea según el modo de lectura. */
export const LineView = React.memo(function LineView({
  line,
  mode,
  tier,
  progress,
  wordIndex,
  wordProgress,
  translationView = 'off',
  melody = null,
  pitchActive = false,
  concealed = false,
}: LineViewProps) {
  const hasFurigana = !!line.furigana && line.furigana.length > 0;
  const hasRomaji = !!line.romaji;
  const hasKana = !!line.kana;
  const highlight = tier === 'current' && progress != null && progress > 0;
  const frac = progress ?? 0;
  const useWords =
    tier === 'current' && !!line.words && line.words.length > 0 && wordIndex != null;

  const showRuby = (mode === 'furigana' || mode === 'furigana_romaji') && hasFurigana;
  // En columna paralela el romaji bajo la línea sobra: la izquierda ya es la
  // pronunciación y la derecha el significado.
  const showRomajiBelow =
    mode === 'furigana_romaji' && hasRomaji && tier === 'current' && translationView !== 'side';

  const translation = line.translation?.trim() ?? '';
  const hasTranslation = translation.length > 0;
  const showTranslationBelow =
    translationView === 'below' && tier === 'current' && hasTranslation;
  const sideBySide = translationView === 'side';

  // Entonación (práctica vocal): columna paralela con la melodía de la línea,
  // avanzando como la traducción. Requiere timestamps de línea.
  const showMelody = pitchActive && !!melody && melody.length > 0 && line.start_ms != null;

  let mainContent: React.ReactNode;
  if (mode === 'kana') {
    mainContent = splitHighlighted(hasKana ? line.kana! : line.text, frac, highlight);
  } else if (mode === 'romaji') {
    mainContent = splitHighlighted(hasRomaji ? line.romaji! : line.text, frac, highlight);
  } else if (showRuby) {
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
    mainContent = (
      <WordsView words={line.words!} activeIndex={wordIndex!} wordProgress={wordProgress ?? 0} />
    );
  } else {
    mainContent = splitHighlighted(line.text, frac, highlight);
  }

  if (concealed) {
    mainContent = <span className="line-concealed" aria-label="Letra oculta">••••••</span>;
  }

  // Vista de texto paralelo: columnas alineadas por línea. La traducción se
  // ilumina con la MISMA fracción que la letra, para asociar tramo con tramo
  // (el orden de palabras entre idiomas no calza, así que es una guía visual,
  // no una correspondencia palabra a palabra). Con práctica vocal activa, la
  // entonación (melodía de la línea) se añade como columna extra.
  const melodyCol = showMelody ? (
    <div className="line-col line-col-melody">
      <MelodyStrip
        melody={melody!}
        startMs={line.start_ms!}
        endMs={line.end_ms ?? null}
        progress={tier === 'current' ? frac : undefined}
        current={tier === 'current'}
      />
    </div>
  ) : null;

  if (sideBySide) {
    return (
      <div className="line-row">
        <div className="line-col line-col-main">
          <p className="line-main">{mainContent}</p>
        </div>
        <div className="line-col line-col-translation">
          <p className="line-main line-translation-side">
            {hasTranslation ? splitHighlighted(translation, frac, highlight) : null}
          </p>
        </div>
        {melodyCol}
      </div>
    );
  }

  return (
    <div className="line-row">
      <div className="line-col line-col-main">
        <p className="line-main">{mainContent}</p>
        {showRomajiBelow && !concealed && <p className="line-romaji">{line.romaji}</p>}
        {showTranslationBelow && <p className="line-translation">Traducción: {translation}</p>}
      </div>
      {melodyCol}
    </div>
  );
});
