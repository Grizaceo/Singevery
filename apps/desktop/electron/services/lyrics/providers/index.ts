// Cadena ordenada de proveedores. El orquestador prueba en orden hasta el
// primer resultado. Agregar una fuente nueva = importar su provider y sumarlo.
//
// NOTA: neteaseProvider (./netease) está FUERA de la cadena: el mirror
// music.xianqiao.wang devuelve resultados no relacionados con la búsqueda
// (verificado 2026-07, incluso con queries en chino). El archivo queda por si
// se restaura con un mirror sano; re-agregarlo cambia el hash de la caché
// negativa y fuerza re-búsquedas (comportamiento deseado).
//
// NOTA legal: musixmatchProvider usa un endpoint INTERNO no autorizado de la
// app de escritorio de Musixmatch y los términos del servicio prohíben el uso
// de letras con fines de karaoke. Por eso NO va en la cadena por defecto de
// builds distribuidas: solo se incluye si se define explícitamente
// SINGEVERY_EXPERIMENTAL_MUSIXMATCH=1 (experimentos locales, bajo tu riesgo).
import type { LyricsProvider } from '../types';
import { lrclibProvider } from './lrclib';
import { musixmatchProvider } from './musixmatch';
import { letrasProvider } from './letras';

/**
 * Construye la cadena de proveedores según el entorno.
 * Por defecto: lrclib → letras. Musixmatch solo con opt-in explícito.
 */
export function buildProviderChain(
  env: Record<string, string | undefined> = process.env,
): LyricsProvider[] {
  const chain: LyricsProvider[] = [lrclibProvider];
  if (env.SINGEVERY_EXPERIMENTAL_MUSIXMATCH === '1') {
    chain.push(musixmatchProvider);
  }
  chain.push(letrasProvider);
  return chain;
}

export const providerChain: LyricsProvider[] = buildProviderChain();
