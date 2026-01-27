import asyncio
import time
from libs.common.types import TrackRef, TimedLyrics, LyricLine, TrackMatch
from libs.sync.engine import SyncEngine

class Simulator:
    def __init__(self, sync_engine: SyncEngine):
        self.sync_engine = sync_engine
        self.running = False
        self.start_time = 0
        self.current_song_duration = 0
        
    def load_demo_track(self):
        # Fake track
        track = TrackRef(
            provider="SIMULATOR",
            provider_track_id="demo_1",
            title="Bohemian Rhapsody (Simulated)",
            artist="Queen",
            duration_ms=60000
        )
        
        # Fake lyrics
        lyrics = TimedLyrics(
            source="SIMULATOR",
            lines=[
                LyricLine(start_ms=1000, end_ms=4000, text="Is this the real life?"),
                LyricLine(start_ms=4500, end_ms=7000, text="Is this just fantasy?"),
                LyricLine(start_ms=7500, end_ms=10000, text="Caught in a landslide"),
                LyricLine(start_ms=10500, end_ms=14000, text="No escape from reality"),
                LyricLine(start_ms=15000, end_ms=18000, text="Open your eyes"),
                LyricLine(start_ms=18500, end_ms=21000, text="Look up to the skies and see"),
            ]
        )
        
        self.sync_engine.set_lyrics(lyrics)
        self.current_song_duration = track.duration_ms
        return track

    async def start(self):
        self.running = True
        self.start_time = time.time()
        print("Simulator: Started playback")

    def get_current_position(self) -> int:
        if not self.running:
            return 0
        return int((time.time() - self.start_time) * 1000)
    
    def stop(self):
        self.running = False
