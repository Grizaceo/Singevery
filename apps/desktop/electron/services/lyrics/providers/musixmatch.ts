import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { LyricsProvider, LyricsQuery, RawLyrics } from '../types';
import { titleArtistSimilarity } from '../normalizeQuery';

const BASE = 'https://apic-desktop.musixmatch.com/ws/1.1';
const APP_ID = 'web-desktop-app-v1.0';
const TOKEN_FILE = path.join(os.tmpdir(), 'singevery-musixmatch-token.json');

interface TokenData {
  usertoken: string;
  cookies?: string;
  expiresAt: number;
}

interface TrackSearchResult {
  commonTrackId: string;
  hasLyrics: boolean;
  hasLineSyncedLyrics: boolean;
}

/** Forma mínima de la respuesta de la API de Musixmatch (solo lo que usamos). */
interface MxmTrack {
  commontrack_id?: number | string;
  track_name?: string;
  artist_name?: string;
  track_length?: number; // segundos
  has_subtitles?: number | boolean;
  has_lyrics?: number | boolean;
}

/** Tolerancia de duración para el fallback cross-script (segundos). */
const DURATION_TOLERANCE_S = 3;

interface MxmEnvelope {
  message?: {
    header?: { status_code?: number; hint?: string };
    body?: {
      user_token?: string;
      track_list?: Array<{ track?: MxmTrack }>;
      subtitle?: { subtitle_body?: string };
      lyrics?: { lyrics_body?: string };
    };
  };
}

const MIN_MATCH_SCORE = 0.8;

let tokenCache: TokenData | null = null;

function readTokenCache(): TokenData | null {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')) as TokenData;
    if (parsed.usertoken && parsed.expiresAt > Date.now()) {
      tokenCache = parsed;
      return parsed;
    }
  } catch {
    /* noop */
  }
  return null;
}

function writeTokenCache(data: TokenData): void {
  tokenCache = data;
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch {
    /* noop */
  }
}

async function fetchJson(
  url: string,
  signal?: AbortSignal,
  cookies?: string,
  redirectDepth = 0,
): Promise<{ data: MxmEnvelope; cookies?: string }> {
  const res = await fetch(url, {
    signal,
    redirect: 'manual',
    headers: cookies
      ? {
          cookie: cookies,
          Accept: 'application/json',
        }
      : { Accept: 'application/json' },
  });

  // El WAF de Musixmatch responde 301 con set-cookie; se reintenta con las
  // cookies. Tope de profundidad para no recursar infinito si insiste.
  if ((res.status === 301 || res.status === 302) && redirectDepth < 3) {
    const getSetCookie = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.();
    const nextCookies = getSetCookie
      ?.map((cookie) => cookie.split(';').shift())
      .filter(Boolean)
      .join('; ');
    if (nextCookies) return fetchJson(url, signal, nextCookies, redirectDepth + 1);
  }

  if (!res.ok) throw new Error(`Musixmatch HTTP ${res.status}`);
  const data = (await res.json()) as MxmEnvelope;
  if (data?.message?.header?.status_code === 401 && data?.message?.header?.hint === 'captcha') {
    throw new Error('Musixmatch rate limited (captcha)');
  }
  if (data?.message?.header?.status_code && data.message.header.status_code !== 200) {
    throw new Error(`Musixmatch status ${data.message.header.status_code}`);
  }
  return { data, cookies };
}

async function getUserToken(signal?: AbortSignal): Promise<TokenData> {
  const cached = readTokenCache();
  if (cached) return cached;

  const url = `${BASE}/token.get?user_language=en&app_id=${APP_ID}`;
  const { data, cookies } = await fetchJson(url, signal);
  const usertoken = data?.message?.body?.user_token as string | undefined;
  if (!usertoken || usertoken === 'UpgradeOnlyUpgradeOnlyUpgradeOnlyUpgradeOnly') {
    throw new Error('Musixmatch token unavailable');
  }

  const tokenData: TokenData = {
    usertoken,
    cookies,
    expiresAt: Date.now() + 10 * 60 * 1000,
  };
  writeTokenCache(tokenData);
  return tokenData;
}

async function searchTrack(query: LyricsQuery, signal?: AbortSignal): Promise<TrackSearchResult | null> {
  const token = await getUserToken(signal);
  const params = new URLSearchParams({
    app_id: APP_ID,
    usertoken: token.usertoken,
    q_track: query.title,
    q_artist: query.artist,
    q_album: query.album ?? '',
    page_size: '5',
    page: '1',
    // desc = mejores entradas primero; con 'asc' llegaban las 5 PEORES del
    // catálogo (típicamente sin letra) y el proveedor devolvía basura o nada.
    s_track_rating: 'desc',
  });
  if (query.durationMs != null) params.set('q_duration', String(Math.round(query.durationMs / 1000)));

  const { data } = await fetchJson(`${BASE}/track.search?${params}`, signal, token.cookies);
  const list = data?.message?.body?.track_list;
  if (!Array.isArray(list) || list.length === 0) return null;

  const ranked = list
    .map((item) => {
      const track = item?.track;
      const score = titleArtistSimilarity(query, {
        title: track?.track_name,
        artist: track?.artist_name,
      });
      return { track, score };
    })
    .filter((item) => item.track && item.score >= MIN_MATCH_SCORE)
    .sort((a, b) => b.score - a.score);

  let track = ranked[0]?.track;
  if (!track && query.durationMs != null) {
    // Fallback cross-script: título/artista en otro alfabeto dan similitud 0;
    // una duración casi exacta identifica la pista igual de bien.
    const wantS = Math.round(query.durationMs / 1000);
    track = list
      .map((item) => item?.track)
      .filter((t): t is MxmTrack => Boolean(t))
      .find(
        (t) => typeof t.track_length === 'number' && Math.abs(t.track_length - wantS) <= DURATION_TOLERANCE_S,
      );
  }
  if (!track?.commontrack_id) return null;
  if (!track.has_subtitles && !track.has_lyrics) return null;

  return {
    commonTrackId: String(track.commontrack_id),
    hasLyrics: Boolean(track.has_lyrics),
    hasLineSyncedLyrics: Boolean(track.has_subtitles),
  };
}

async function fetchSynced(commonTrackId: string, signal?: AbortSignal): Promise<string | null> {
  const token = await getUserToken(signal);
  const params = new URLSearchParams({
    app_id: APP_ID,
    usertoken: token.usertoken,
    commontrack_id: commonTrackId,
    subtitle_format: 'mxm',
  });
  const { data } = await fetchJson(`${BASE}/track.subtitle.get?${params}`, signal, token.cookies);
  return (data?.message?.body?.subtitle?.subtitle_body as string | undefined) ?? null;
}

function cleanPlainLyrics(value: string): string {
  return value
    .replace(/\*{3,}.*$/gms, '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

async function fetchPlain(commonTrackId: string, signal?: AbortSignal): Promise<string | null> {
  const token = await getUserToken(signal);
  const params = new URLSearchParams({
    app_id: APP_ID,
    usertoken: token.usertoken,
    commontrack_id: commonTrackId,
  });
  const { data } = await fetchJson(`${BASE}/track.lyrics.get?${params}`, signal, token.cookies);
  const lyrics = (data?.message?.body?.lyrics?.lyrics_body as string | undefined) ?? null;
  return lyrics ? cleanPlainLyrics(lyrics) : null;
}

export const musixmatchProvider: LyricsProvider = {
  name: 'musixmatch',
  async lookup(query, signal): Promise<RawLyrics | null> {
    const track = await searchTrack(query, signal);
    if (!track) return null;

    if (track.hasLineSyncedLyrics) {
      const lrc = await fetchSynced(track.commonTrackId, signal);
      if (lrc?.trim()) return { source: 'musixmatch', synced: true, lrc };
    }
    if (track.hasLyrics) {
      const plain = await fetchPlain(track.commonTrackId, signal);
      if (plain?.trim()) return { source: 'musixmatch', synced: false, plain };
    }
    return null;
  },
};
