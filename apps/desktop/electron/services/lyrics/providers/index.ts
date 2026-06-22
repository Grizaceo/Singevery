// Cadena ordenada de proveedores. El orquestador prueba en orden hasta el
// primer resultado. Agregar una fuente nueva = importar su provider y sumarlo.
import type { LyricsProvider } from '../types';
import { lrclibProvider } from './lrclib';

export const providerChain: LyricsProvider[] = [lrclibProvider];
