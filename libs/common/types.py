from pydantic import BaseModel
from typing import Optional, List, Any

# TrackRef (Canonical Song Reference)
class TrackRef(BaseModel):
    provider: str
    provider_track_id: str
    title: str
    artist: str
    album: Optional[str] = None
    duration_ms: Optional[int] = None
    isrc: Optional[str] = None

# TrackMatch (Recognition Result)
class TrackMatch(BaseModel):
    track: TrackRef
    confidence: float  # 0.0 to 1.0
    position_ms: int  # Estimated offset
    matched_at: float  # Local timestamp when match matched

# TimedLyrics (Lyrics with timestamps)
class LyricLine(BaseModel):
    start_ms: int
    end_ms: Optional[int] = None
    text: str

class TimedLyrics(BaseModel):
    lines: List[LyricLine]
    source: str  # e.g., "LRC", "Musixmatch"
    synced: bool = True

# RenderModel (UI State)
class RenderModel(BaseModel):
    previous_lines: List[str]
    current_line: str
    next_lines: List[str]
    
    font_scale: float = 1.0
    opacity: float = 1.0
    alignment: str = "center"
    mirror_mode: bool = True
    
    track_title: Optional[str] = None
    track_artist: Optional[str] = None
    status: str  # IDLE, LISTENING, IDENTIFYING, FETCHING_LYRICS, DISPLAYING, NO_LYRICS, ERROR
