from typing import Optional, List
import time
from libs.common.types import TimedLyrics, RenderModel, TrackMatch, LyricLine

class SyncEngine:
    def __init__(self):
        self.current_lyrics: Optional[TimedLyrics] = None
        self.offset_ms: int = 0
        self.render_config = {
            "window_size": 2,  # Lines before and after
            "mirror_mode": True
        }

    def set_lyrics(self, lyrics: TimedLyrics):
        self.current_lyrics = lyrics

    def update_match(self, match: TrackMatch):
        """
        Update offset based on recognition match.
        In a real scenario, we might smooth this transition.
        """
        # offset = (now - match.matched_at) - match.position_ms
        # But here we just want to know "where are we in the song?"
        # Let's assume the caller provides the current song position or we calculate it.
        pass

    def get_render_model(self, position_ms: int, status: str = "DISPLAYING") -> RenderModel:
        if not self.current_lyrics or not self.current_lyrics.lines:
             return RenderModel(
                previous_lines=[],
                current_line="",
                next_lines=[],
                status="NO_LYRICS"
            )

        # 1. Find the current line
        current_index = -1
        # Simple linear search (optimize to binary search if needed for huge files)
        for i, line in enumerate(self.current_lyrics.lines):
            # If position is within line duration or before next line
            start = line.start_ms
            end = line.end_ms if line.end_ms else (self.current_lyrics.lines[i+1].start_ms if i+1 < len(self.current_lyrics.lines) else 99999999)
            
            if start <= position_ms < end:
                current_index = i
                break
        
        # If no line matches (e.g. instrumental intro), finding the *next* upcoming line might be better,
        # or just showing nothing. For now, let's find the closest previous line or 0.
        if current_index == -1:
            if position_ms < self.current_lyrics.lines[0].start_ms:
                # Intro
                return RenderModel(
                    previous_lines=[],
                    current_line="...",
                    next_lines=[self.current_lyrics.lines[0].text],
                    status="IDLE"
                )
            else:
                 # End
                 current_index = len(self.current_lyrics.lines) - 1

        # 2. Extract window
        lines = self.current_lyrics.lines
        
        prev_lines_text = []
        start_prev = max(0, current_index - self.render_config["window_size"])
        for i in range(start_prev, current_index):
            prev_lines_text.append(lines[i].text)

        current_text = lines[current_index].text

        next_lines_text = []
        end_next = min(len(lines), current_index + 1 + self.render_config["window_size"])
        for i in range(current_index + 1, end_next):
            next_lines_text.append(lines[i].text)

        return RenderModel(
            previous_lines=prev_lines_text,
            current_line=current_text,
            next_lines=next_lines_text,
            font_scale=1.0,
            opacity=1.0,
            alignment="center",
            mirror_mode=self.render_config["mirror_mode"],
            status=status
        )
