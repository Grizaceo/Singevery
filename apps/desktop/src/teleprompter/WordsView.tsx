import React from 'react';
import type { LyricWord } from '../types';
import { splitAtFraction } from '../lineHighlight';

/** Render por palabra (A2): resaltado karaoke palabra a palabra. */
export const WordsView = React.memo(function WordsView({
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
});
