import React from 'react';
import type { ReadingMode, RenderLine } from '../types';
import { splitAtFraction, splitSegmentsAtFraction } from '../lineHighlight';
import { WordsView } from './WordsView';

type Tier = 'current' | 'adjacent' | 'far';

interface LineViewProps {
  line: RenderLine;
  mode: ReadingMode;
  tier: Tier;
  progress?: number;
  wordIndex?: number;
  wordProgress?: number;
}

/** Render seguro de una línea según el modo de lectura. */
export const LineView = React.memo(function LineView({
  line,
  mode,
  tier,
  progress,
  wordIndex,
  wordProgress,
}: LineViewProps) {
  const hasFurigana = !!line.furigana && line.furigana.length > 0;
  const hasRomaji = !!line.romaji;
  const highlight = tier === 'current' && progress != null && progress > 0;
  const frac = progress ?? 0;
  const useWords =
    tier === 'current' && !!line.words && line.words.length > 0 && wordIndex != null;

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
  } else if (!highlight) {
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

  return (
    <>
      <p className="line-main">{mainContent}</p>
      {showRomajiBelow && <p className="line-romaji">{line.romaji}</p>}
    </>
  );
});
