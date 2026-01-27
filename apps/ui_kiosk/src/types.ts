export interface RenderModel {
    previous_lines: string[];
    current_line: string;
    next_lines: string[];

    font_scale: number;
    opacity: number;
    alignment: "left" | "center" | "right";
    mirror_mode: boolean;

    track_title?: string;
    track_artist?: string;
    status: string;
}

export const INITIAL_RENDER_MODEL: RenderModel = {
    previous_lines: [],
    current_line: "Esperando música...",
    next_lines: [],
    font_scale: 1.0,
    opacity: 1.0,
    alignment: "center",
    mirror_mode: true,
    status: "IDLE"
};
