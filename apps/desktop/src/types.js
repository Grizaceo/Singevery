"use strict";
// ============================================================================
// Tipos del dominio — porte de libs/common/types.py a TypeScript.
// Compartidos entre el proceso main de Electron y el renderer React.
//
// Nota: se mantiene snake_case en RenderModel para preservar el contrato
// existente (apps/ui_kiosk/src/types.ts) y la serialización del daemon
// Python original.
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.INITIAL_RENDER_MODEL = void 0;
exports.INITIAL_RENDER_MODEL = {
    previous_lines: [],
    current_line: "Esperando música...",
    next_lines: [],
    font_scale: 1.0,
    opacity: 1.0,
    alignment: "center",
    mirror_mode: true,
    status: "IDLE",
};
//# sourceMappingURL=types.js.map