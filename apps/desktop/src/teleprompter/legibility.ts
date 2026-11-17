// ============================================================================
// legibility.ts — separación de transparencia letra/fondo, puro y testeable.
//
// Antes `opacity` se aplicaba al contenedor entero: bajar la letra también
// apagaba la viñeta. Ahora la letra y el fondo tienen opacidades propias y
// esta función traduce los ajustes a los valores que consume el CSS.
// ============================================================================

export interface LegibilityInput {
  /** Opacidad de la letra (0.2–1, ya viene clampeada de los ajustes). */
  textOpacity: number;
  /** Opacidad de la viñeta/fondo (0–1). */
  backgroundOpacity: number;
  /** Preferencia del usuario de reforzar el contorno con fondo transparente. */
  boost: boolean;
}

export interface LegibilityOutput {
  /** Opacidad de la línea que se está cantando. */
  currentLineOpacity: number;
  /** Opacidad de las líneas de contexto (before/después y lo ya cantado). */
  contextOpacity: number;
  /** Multiplicador de alfa de la viñeta (0 = ventana totalmente limpia). */
  backgroundAlpha: number;
  /** true = aplicar el halo de contorno extra en el renderer. */
  boostActive: boolean;
}

/**
 * Pisos de legibilidad para cantar: aunque el usuario baje la letra al
 * mínimo, la línea actual nunca baja del 60 % y el contexto del 35 % — por
 * debajo de eso el texto deja de leerse sobre un video en vivo.
 */
const CURRENT_LINE_FLOOR = 0.6;
const CONTEXT_FLOOR = 0.35;
/** Con el fondo por debajo de este alfa la letra pierde su "colchón" y el
 *  contorno extra empieza a tener sentido. */
const BOOST_BACKGROUND_THRESHOLD = 0.35;

export function computeLegibility(input: LegibilityInput): LegibilityOutput {
  const textOpacity = input.textOpacity;
  const backgroundOpacity = input.backgroundOpacity;
  return {
    currentLineOpacity: Math.max(textOpacity, CURRENT_LINE_FLOOR),
    contextOpacity: Math.max(textOpacity, CONTEXT_FLOOR),
    backgroundAlpha: backgroundOpacity,
    boostActive: input.boost && backgroundOpacity < BOOST_BACKGROUND_THRESHOLD,
  };
}
