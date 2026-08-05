// ============================================================================
// referenceTypes.ts — melodías de referencia grabadas por el profesor.
//
// QUÉ SE GUARDA Y QUÉ NO
//
// Se guarda SOLO la curva de tono: dos arrays paralelos de tiempo y frecuencia.
// El audio de la grabación se descarta apenas se extrae la curva y nunca toca
// el disco. Esto no es una restricción técnica, es la decisión de diseño:
//
//   - No es una grabación de nadie. La curva no se puede "escuchar de vuelta"
//     para saber quién habló ni qué se dijo; solo describe alturas en el tiempo.
//   - No contiene la canción. Si el profesor toca encima de un fonograma ajeno,
//     la curva no reproduce ese fonograma y no hay copia que distribuir.
//   - Pesa kilobytes, no megabytes.
//   - Para oírla de vuelta se sintetiza un tono que sigue la curva, que además
//     es mejor pedagógicamente: sin timbre que distraiga del tono.
//
// Todo vive en el equipo del usuario (userData). No hay servidor, no hay cuenta
// y ninguna de estas funciones abre un socket. Compartir con el alumno es
// exportar un archivo y mandarlo por donde el profesor quiera.
// ============================================================================

/** Instrumento al que apunta la referencia (afecta el rango de análisis). */
export type ReferenceInstrument = 'voz' | 'bajo' | 'guitarra' | 'teclado' | 'otro';

/** Rango de frecuencias útil por instrumento (Hz). El bajo baja a 38 Hz: el
 *  mi grave de un bajo de 4 cuerdas está en 41,2 Hz, muy por debajo del piso
 *  vocal de 80 Hz que usa el detector por defecto. */
export const INSTRUMENT_RANGE_HZ: Record<ReferenceInstrument, { min: number; max: number }> = {
  voz: { min: 80, max: 1200 },
  bajo: { min: 38, max: 400 },
  guitarra: { min: 75, max: 1400 },
  teclado: { min: 55, max: 2100 },
  otro: { min: 38, max: 2100 },
};

/** Ficha de una referencia, sin la curva (para listar sin cargar todo). */
export interface ReferenceMeta {
  id: string;
  /** Pista a la que pertenece (normalizeTrackKey). Vacío = ejercicio suelto. */
  trackKey: string;
  title: string;
  artist: string;
  /** Nombre que le pone el profesor: "Estribillo", "Compases 12-20". */
  label: string;
  instrument: ReferenceInstrument;
  /** Quién la grabó, texto libre. Opcional y a criterio del profesor. */
  author?: string;
  createdAt: number;
  /** Instante de la canción donde empieza la referencia (ms). */
  startMs: number;
  endMs: number;
  pointCount: number;
  /** Versión de la app que la grabó (para depurar formatos futuros). */
  appVersion: string;
}

/**
 * Curva compacta: `t` y `f` son arrays PARALELOS del mismo largo. Se guardan
 * así y no como lista de objetos porque un `{timeMs, freq}` por punto triplica
 * el tamaño del JSON sin aportar nada.
 */
export interface ReferenceCurve {
  /** Milisegundos absolutos dentro de la canción. */
  t: number[];
  /** Frecuencia en Hz. */
  f: number[];
}

export interface ReferenceMelody extends ReferenceMeta {
  curve: ReferenceCurve;
}

/** Extensión y marca del archivo que se manda al alumno. */
export const REFERENCE_FILE_EXTENSION = 'singevery-ref';
export const REFERENCE_FORMAT = 'singevery-reference';
export const REFERENCE_FORMAT_VERSION = 1;

/** Sobre del archivo exportado. */
export interface ReferenceExportEnvelope {
  format: typeof REFERENCE_FORMAT;
  formatVersion: number;
  exportedAt: number;
  reference: ReferenceMelody;
}

// --- Límites defensivos ----------------------------------------------------
//
// Un archivo importado llega por WhatsApp, correo o pendrive: no se puede
// confiar en él. Estos topes acotan lo que puede hacer un archivo hostil o
// simplemente corrupto antes de que toque nada.

/** Máximo de puntos por referencia (~30 min a 50 ms de paso). */
export const MAX_REFERENCE_POINTS = 40_000;
/** Frecuencias fuera de esto no son musicales. */
export const MIN_REFERENCE_HZ = 20;
export const MAX_REFERENCE_HZ = 5_000;
/** Tope de texto en cualquier campo libre. */
export const MAX_TEXT_LENGTH = 200;
/** Tope del archivo a leer (2 MB es holgadísimo para curvas). */
export const MAX_REFERENCE_FILE_BYTES = 2 * 1024 * 1024;
