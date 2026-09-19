// ============================================================================
// displayAppearance.ts — color de texto, apariencia del handle y ajustes de
// lectura (pinyin/variante del español), extraído de StateStore.
//
// Autocontenido: solo lee DisplayStore/ReadingStore y el color resuelto por
// AutoContrastService (setAutoContrast/clearAutoContrast). No conoce nada de
// identidad de pista, reloj de sincronía ni carga de letras.
// ============================================================================

import { isColorDark } from './colorUtils';
import { setPinyinToneType, setSpanishVariant } from '../services/romanize';
import type { DisplayStore, ReadingStore } from '../services/settings';
import type { RenderModel } from '../../src/types';

export class DisplayAppearance {
  private autoContrastColor: string | null = null;
  private autoLightBackground = false;

  constructor(
    private readonly displayStore: DisplayStore,
    private readonly readingStore: ReadingStore,
  ) {}

  /** Sincroniza ajustes de lectura (pinyin, norma del español) con romanize.ts. */
  applyReadingSettings(): void {
    const reading = this.readingStore.get();
    setPinyinToneType(reading.pinyinToneType);
    setSpanishVariant(reading.spanishVariant);
  }

  /** true si el modo de color de texto persistido ya no es 'auto' (el llamador
   *  debe limpiar el override de auto-contraste en ese caso). */
  isManualTextColor(): boolean {
    return this.displayStore.get().textColorMode !== 'auto';
  }

  /** Actualiza el color efectivo desde el servicio de auto-contraste. */
  setAutoContrast(color: string, lightBackground: boolean): void {
    this.autoContrastColor = color;
    this.autoLightBackground = lightBackground;
  }

  /** Limpia el override de auto-contraste (vuelve al color manual). */
  clearAutoContrast(): void {
    this.autoContrastColor = null;
    this.autoLightBackground = false;
  }

  resolveTextAppearance(): Pick<RenderModel, 'text_color' | 'text_vignette_light'> {
    const d = this.displayStore.get();
    if (d.textColorMode === 'auto') {
      return {
        text_color: this.autoContrastColor ?? '#ffffff',
        text_vignette_light: this.autoContrastColor ? this.autoLightBackground : false,
      };
    }
    return {
      text_color: d.textColor,
      text_vignette_light: isColorDark(d.textColor),
    };
  }

  /** Apariencia del handle configurada por el usuario (color/tamaño/posición). */
  resolveHandleAppearance(): Pick<RenderModel, 'handle_color' | 'handle_scale' | 'handle_position_x'> {
    const d = this.displayStore.get();
    return {
      handle_color: d.handleColor,
      handle_scale: d.handleScale,
      handle_position_x: d.handlePositionX,
    };
  }
}
