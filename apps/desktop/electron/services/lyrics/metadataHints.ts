import type { LyricsQuery } from './types';
import { normalizeSearchText, titleArtistSimilarity } from './normalizeQuery';
import { appFetch } from '../http';

interface MetadataCandidate {
  title: string;
  artist: string;
  album?: string | null;
  durationMs?: number | null;
}

export interface MetadataHints {
  primary: LyricsQuery;
  alternates: LyricsQuery[];
}

const USER_AGENT = 'Singevery/0.1.0 (+metadata)';

function sameTrack(left: LyricsQuery, right: LyricsQuery): boolean {
  return (
    normalizeSearchText(left.title) === normalizeSearchText(right.title) &&
    normalizeSearchText(left.artist) === normalizeSearchText(right.artist)
  );
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await appFetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchItunes(query: LyricsQuery): Promise<MetadataCandidate[]> {
  const term = encodeURIComponent(`${query.artist} ${query.title}`);
  const data = (await fetchJson(`https://itunes.apple.com/search?entity=song&limit=5&term=${term}`)) as {
    results?: Array<{
      trackName?: string;
      artistName?: string;
      collectionName?: string;
      trackTimeMillis?: number;
    }>;
  };

  return (data.results ?? [])
    .filter((item) => item.trackName && item.artistName)
    .map((item) => ({
      title: item.trackName ?? '',
      artist: item.artistName ?? '',
      album: item.collectionName ?? null,
      durationMs: item.trackTimeMillis ?? null,
    }));
}

async function fetchDeezer(query: LyricsQuery): Promise<MetadataCandidate[]> {
  const q = encodeURIComponent(`artist:"${query.artist}" track:"${query.title}"`);
  const data = (await fetchJson(`https://api.deezer.com/search?q=${q}&limit=5&output=json`)) as {
    data?: Array<{
      title?: string;
      duration?: number;
      artist?: { name?: string };
      album?: { title?: string };
    }>;
  };

  return (data.data ?? [])
    .filter((item) => item.title && item.artist?.name)
    .map((item) => ({
      title: item.title ?? '',
      artist: item.artist?.name ?? '',
      album: item.album?.title ?? null,
      durationMs: typeof item.duration === 'number' ? item.duration * 1000 : null,
    }));
}

function pickBest(query: LyricsQuery, candidates: MetadataCandidate[]): MetadataCandidate | null {
  let best: { score: number; candidate: MetadataCandidate } | null = null;
  for (const candidate of candidates) {
    const score = titleArtistSimilarity(query, candidate);
    if (score <= 0) continue;
    const boosted = score + (candidate.durationMs ? 0.05 : 0);
    if (!best || boosted > best.score) best = { score: boosted, candidate };
  }
  if (!best || best.score < 0.72) return null;
  return best.candidate;
}

export async function resolveMetadataHints(query: LyricsQuery): Promise<MetadataHints> {
  if (query.durationMs != null && query.album) {
    return { primary: query, alternates: [] };
  }

  const candidates: MetadataCandidate[] = [];
  await Promise.allSettled([
    fetchItunes(query).then((items) => candidates.push(...items)),
    fetchDeezer(query).then((items) => candidates.push(...items)),
  ]);

  const best = pickBest(query, candidates);
  if (!best) return { primary: query, alternates: [] };

  const primary: LyricsQuery = {
    title: query.title,
    artist: query.artist,
    album: query.album ?? best.album ?? null,
    durationMs: query.durationMs ?? best.durationMs ?? null,
  };

  const alternate: LyricsQuery = {
    title: best.title,
    artist: best.artist,
    album: best.album ?? primary.album ?? null,
    durationMs: best.durationMs ?? primary.durationMs ?? null,
  };

  return {
    primary,
    alternates: sameTrack(primary, alternate) ? [] : [alternate],
  };
}
