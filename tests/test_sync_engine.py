import unittest
from libs.sync.engine import SyncEngine
from libs.common.types import TimedLyrics, LyricLine

class TestSyncEngine(unittest.TestCase):
    def setUp(self):
        self.engine = SyncEngine()
        self.sample_lyrics = TimedLyrics(
            source="Test",
            lines=[
                LyricLine(start_ms=0, end_ms=1000, text="Line 1"),
                LyricLine(start_ms=1000, end_ms=2000, text="Line 2"),
                LyricLine(start_ms=2000, end_ms=3000, text="Line 3"),
                LyricLine(start_ms=3000, end_ms=4000, text="Line 4"),
            ]
        )
        self.engine.set_lyrics(self.sample_lyrics)

    def test_get_render_model_basic(self):
        # 500ms -> Line 1
        model = self.engine.get_render_model(500)
        self.assertEqual(model.current_line, "Line 1")
        self.assertEqual(model.next_lines, ["Line 2", "Line 3"])
        
    def test_get_render_model_middle(self):
        # 1500ms -> Line 2
        model = self.engine.get_render_model(1500)
        self.assertEqual(model.current_line, "Line 2")
        self.assertEqual(model.previous_lines, ["Line 1"])
        self.assertEqual(model.next_lines, ["Line 3", "Line 4"])

    def test_get_render_model_end(self):
        # 3500ms -> Line 4
        model = self.engine.get_render_model(3500)
        self.assertEqual(model.current_line, "Line 4")
        self.assertEqual(model.next_lines, [])

if __name__ == '__main__':
    unittest.main()
