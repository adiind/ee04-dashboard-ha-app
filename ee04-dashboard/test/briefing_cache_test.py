import json
import os
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "briefing"))
import render  # noqa: E402

TZ = ZoneInfo("America/Chicago")
NOW = datetime(2026, 11, 13, 8, 31, tzinfo=TZ)


def snap(briefing=None):
    payload = {"fetched_at": NOW.isoformat(), "errors": [], "sources": [], "weather": {"state": "partlycloudy", "temperature": 39}}
    if briefing is not None:
        payload["briefing"] = briefing
    return payload


def valid_briefing(**extra):
    body = {
        "entity": "sensor.alfred_briefing",
        "state": "6 today",
        "top": "Post ByeHassle PLA video (overdue)",
        "today": ["Reply Nihal: Agent Jam #2 plan"],
        "week": ["Sat 9a Submit MPD 430 HW #2"],
        "for_date": "2026-11-13",
        "updated": "2026-11-13T08:31:00-06:00",
    }
    body.update(extra)
    return body


class BriefingCacheTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        os.environ["EE04_STATE_DIR"] = self.tmp.name
        os.environ.pop("EE04_LAST_BRIEFING", None)

    def test_valid_payload_is_saved(self):
        data, why = render.select_content(snap(valid_briefing()), NOW)
        self.assertIsNone(why)
        self.assertEqual(data["source"], "alfred")
        self.assertEqual(data["top"], "Post ByeHassle PLA video (overdue)")
        saved = json.loads(Path(render.last_briefing_path()).read_text())
        self.assertEqual(saved["top"], "Post ByeHassle PLA video (overdue)")
        self.assertEqual(saved["today"], ["Reply Nihal: Agent Jam #2 plan"])
        self.assertEqual(saved["for_date"], "2026-11-13")
        self.assertEqual(saved["saved_at"], NOW.isoformat())
        self.assertTrue(Path(render.last_briefing_path()).is_file())

    def test_missing_sensor_reuses_saved_list_with_marker(self):
        render.select_content(snap(valid_briefing()), NOW)
        later = datetime(2026, 11, 14, 9, 0, tzinfo=TZ)
        data, why = render.select_content(snap(), later)
        self.assertEqual(why, "missing")
        self.assertEqual(data["source"], "saved")
        self.assertEqual(data["top"], "Post ByeHassle PLA video (overdue)")
        _image, info = render.render(snap(), later, mode="day")
        self.assertEqual(info["source"], "saved")
        self.assertEqual(info["footer"], "list from Fri 8:31a")
        self.assertEqual(info["top"], "Post ByeHassle PLA video (overdue)")

    def test_missing_sensor_with_nothing_saved_is_the_empty_state(self):
        data, why = render.select_content(snap(), NOW)
        self.assertIsNone(data)
        self.assertEqual(why, "missing")
        _image, info = render.render(snap(), NOW, mode="day")
        self.assertEqual(info["source"], "empty")
        self.assertEqual(info["message"], "Waiting for Alfred's list")
        self.assertEqual(info["footer"], "")
        _image, forced = render.render(snap(valid_briefing()), NOW, mode="day", force_empty=True)
        self.assertEqual(forced["source"], "empty")
        self.assertEqual(forced["message"], "Waiting for Alfred's list")
        self.assertFalse(Path(render.last_briefing_path()).exists())

    def test_old_for_date_is_stale_and_does_not_replace_the_saved_list(self):
        render.select_content(snap(valid_briefing()), NOW)
        before = Path(render.last_briefing_path()).read_text()
        stale = valid_briefing(for_date="2026-11-12", top="Yesterday's list")
        payload, why = render.briefing_state(snap(stale), NOW)
        self.assertIsNone(payload)
        self.assertEqual(why, "old for_date")
        data, why = render.select_content(snap(stale), NOW)
        self.assertEqual(why, "old for_date")
        self.assertEqual(data["source"], "saved")
        self.assertEqual(data["top"], "Post ByeHassle PLA video (overdue)")
        self.assertEqual(Path(render.last_briefing_path()).read_text(), before)


if __name__ == "__main__":
    unittest.main()
