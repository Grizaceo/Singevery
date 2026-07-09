// Cadena ordenada de proveedores. El orquestador prueba en orden hasta el
// primer resultado. Agregar una fuente nueva = importar su provider y sumarlo.
//
// NOTA: neteaseProvider (./netease) está FUERA de la cadena: el mirror
// music.xianqiao.wang devuelve resultados no relacionados con la búsqueda
// (verificado 2026-07, incluso con queries en chino). El archivo queda por si
// se restaura con un mirror sano; re-agregarlo cambia el hash de la caché
// negativa y fuerza re-búsquedas (comportamiento deseado).
import type { LyricsProvider } from '../types';
import { lrclibProvider } from './lrclib';
import { musixmatchProvider } from './musixmatch';
import { letrasProvider } from './letras';

export const providerChain: LyricsProvider[] = [
  lrclibProvider,
  musixmatchProvider,
  letrasProvider,
];
