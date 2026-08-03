// ============================================================================
// widgetPrefs.ts — qué controles aparecen en la barra superior (F5).
// Persistidos en localStorage; los lee ChromeTopBar al renderizar el widget.
// ============================================================================

export interface WidgetControls {
  reading: boolean;
  translate: boolean;
  import: boolean;
  settings: boolean;
}

export const WIDGET_CONTROLS_KEY = 'espejo.widget.controls';

export const DEFAULT_WIDGET_CONTROLS: WidgetControls = {
  reading: true,
  translate: true,
  import: true,
  settings: true,
};

export function readWidgetControls(): WidgetControls {
  try {
    const raw = localStorage.getItem(WIDGET_CONTROLS_KEY);
    if (raw) return { ...DEFAULT_WIDGET_CONTROLS, ...(JSON.parse(raw) as Partial<WidgetControls>) };
  } catch {
    /* ídem */
  }
  return DEFAULT_WIDGET_CONTROLS;
}

export function writeWidgetControls(controls: WidgetControls): void {
  try {
    localStorage.setItem(WIDGET_CONTROLS_KEY, JSON.stringify(controls));
  } catch {
    /* ídem */
  }
}
