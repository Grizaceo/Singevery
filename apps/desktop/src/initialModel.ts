import type { RenderModel } from './types';

/**
 * Estado inicial del renderer antes de que el main envíe el primer
 * RenderModel por IPC. Separado de types.ts (que es solo tipos) para
 * que el bundler no marque el módulo como type-only.
 */
export const INITIAL_RENDER_MODEL: RenderModel = {
  previous_lines: [],
  current_line: { text: "Esperando música..." },
  next_lines: [],
  font_scale: 1.0,
  opacity: 1.0,
  alignment: "center",
  mirror_mode: false,
  status: "IDLE",
};
