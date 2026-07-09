import type { LyricsProvider, LyricsQuery, RawLyrics } from '../types';
import { titleArtistSimilarity } from '../normalizeQuery';
import { appFetch } from '../../http';

const BASE = 'https://music.xianqiao.wang/neteaseapiv2';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:93.0) Gecko/20100101 Firefox/93.0';
const MIN_MATCH_SCORE = 0.84;

/** Forma mínima de las respuestas del mirror (solo lo que usamos). */
interface NeteaseSong {
  id?: number | string;
  name?: string;
  artists?: Array<{ name?: string }>;
}

interface NeteaseResponse {
  result?: { songs?: NeteaseSong[] };
  lrc?: { lyric?: string };
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<NeteaseResponse> {
  const res = await appFetch(url, {
    signal,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Netease HTTP ${res.status}`);
  return (await res.json()) as NeteaseResponse;
}

async function searchTrack(query: LyricsQuery, signal?: AbortSignal): Promise<string | null> {
  const params = new URLSearchParams({
    limit: '10',
    type: '1',
    keywords: `${query.title} ${query.artist}`.trim(),
  });
  const data = await fetchJson(`${BASE}/search?${params}`, signal);
  const songs = data?.result?.songs;
  if (!Array.isArray(songs) || songs.length === 0) return null;

  const ranked = songs
    .map((song) => {
      const artist = Array.isArray(song?.artists)
        ? song.artists.map((entry) => String(entry?.name ?? '').trim()).join(', ')
        : '';
      const score = titleArtistSimilarity(query, {
        title: song?.name,
        artist,
      });
      return { song, score };
    })
    .filter((item) => item.song && item.score >= MIN_MATCH_SCORE)
    .sort((a, b) => b.score - a.score);

  const chosen = ranked[0]?.song;
  return chosen?.id != null ? String(chosen.id) : null;
}

function stripCredits(lrc: string): string {
  const creditInfo = [
    '\\s?作?\\s*词|\\s?作?\\s*曲|\\s?编\\s*曲?|\\s?监\\s*制?',
    '.*编写|.*和音|.*和声|.*合声|.*提琴|.*录|.*工程|.*工作室|.*设计|.*剪辑|.*制作|.*发行|.*出品|.*后期|.*混音|.*缩混',
    '原唱|翻唱|题字|文案|海报|古筝|二胡|钢琴|吉他|贝斯|笛子|鼓|弦乐| 人声 ',
    'lrc|publish|vocal|guitar|program|produce|write|mix',
  ];
  const creditInfoRegExp = new RegExp(`^(${creditInfo.join('|')}).*(:|：)`, 'i');

  const out: string[] = [];
  for (const rawLine of lrc.split(/\r?\n/)) {
    const line = rawLine.trim();
    const parts = line.match(/(\[.*?\])|([^[\]]+)/g);
    if (!parts || parts.length <= 1) continue;

    const textIndex = parts.findIndex((part) => !part.endsWith(']'));
    const time = parts[0];
    const text = textIndex >= 0 ? parts[textIndex].trim() : '';
    if (!text || creditInfoRegExp.test(text)) continue;
    out.push(`${time}${text.startsWith(' ') ? '' : ' '}${text}`);
  }

  return out.join('\n').trim();
}

async function fetchLyrics(trackId: string, signal?: AbortSignal): Promise<string | null> {
  const params = new URLSearchParams({ id: trackId });
  const data = await fetchJson(`${BASE}/lyric?${params}`, signal);
  const lyrics = data?.lrc?.lyric as string | undefined;
  if (!lyrics?.trim()) return null;
  const cleaned = stripCredits(lyrics);
  return cleaned || lyrics.trim();
}

export const neteaseProvider: LyricsProvider = {
  name: 'netease',
  async lookup(query, signal): Promise<RawLyrics | null> {
    const trackId = await searchTrack(query, signal);
    if (!trackId) return null;
    const lrc = await fetchLyrics(trackId, signal);
    if (!lrc?.trim()) return null;
    return { source: 'netease', synced: true, lrc };
  },
};
