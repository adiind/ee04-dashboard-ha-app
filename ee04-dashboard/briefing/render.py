#!/usr/bin/env python3
"""Homebase EE04 Spectra briefing renderer — v3 ("actionable" layout).

Content comes from Alfred via sensor.alfred_briefing (attributes: top, today[], week[], for_date, updated).
Items are rendered as given (no re-filtering). If that sensor is missing, unavailable or >18 h old,
falls back to Adi's own calendars (holidays/birthdays/family/team calendars removed, TA-course Canvas
items dropped) and shows a small "calendar fallback" marker.

Layout (800x480, 6 inks, no dither): thin art frame (~14 px) around a full-bleed card;
header = date + greeting | weather chip; red TOP-focus band; two columns TODAY/TOMORROW | THIS WEEK
with a right-aligned time/tag column; items due within 48 h get a red tag chip.

Token-free: the HA token is read from HA_TOKEN at runtime only (or SUPERVISOR_TOKEN inside the add-on).

Usage:
  HA_TOKEN=... python3 render.py --out briefing.png [--now 2026-11-12T09:00] [--mode auto|day|night]
  python3 render.py --data snapshot.json --briefing-json alfred.json --out x.png   # offline preview
  --briefing-json injects an Alfred payload instead of reading sensor.alfred_briefing (nothing is written to HA).
  --no-briefing forces the calendar fallback.
Env: HA_URL (default http://100.110.52.70:8123), HA_SOCKS (default socks5h://127.0.0.1:1055, "" to disable)
"""
import argparse, datetime as dt, html, json, os, re, subprocess, sys, tempfile
from zoneinfo import ZoneInfo
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
TZ = ZoneInfo("America/Chicago")
W, H = 800, 480
PALETTE = {"black": (0, 0, 0), "white": (255, 255, 255), "red": (255, 0, 0),
           "yellow": (255, 255, 0), "blue": (0, 0, 255), "green": (0, 255, 0)}
PAL = list(PALETTE.values())
ADDON_RGB = {(0, 0, 0): (17, 17, 17), (255, 255, 255): (255, 255, 255), (255, 0, 0): (215, 25, 32),
             (255, 255, 0): (247, 198, 0), (0, 0, 255): (18, 97, 166), (0, 255, 0): (31, 157, 85)}
NIGHT_START, NIGHT_END = 22, 6
STALE_HOURS = 18
WEATHER = "weather.forecast_home"
BRIEFING_SENSOR = "sensor.alfred_briefing"
CALENDARS = [  # fallback only. Removed on purpose: holidays_in_india, birthdays, family, team_mclovin (+ _2 dupes)
    "calendar.adityaagarwal2027_u_northwestern_edu",
    "calendar.aditya_agarwal_calendar_canvas",
    "calendar.adiind_yahoo_co_in",
]
CONDITIONS = {"clear-night": "Clear", "cloudy": "Cloudy", "exceptional": "Alert", "fog": "Foggy",
              "hail": "Hail", "lightning": "Storms", "lightning-rainy": "Storms", "partlycloudy": "Partly cloudy",
              "pouring": "Pouring", "rainy": "Rain", "snowy": "Snow", "snowy-rainy": "Sleet",
              "sunny": "Sunny", "windy": "Windy", "windy-variant": "Windy"}
DEADLINE = re.compile(r"\b(due|deadline|exam|midterm|mid[- ]term|final|quiz|submit|submission|send|reply|answer|"
                      r"apply|interview|flight|appointment|presentation|present)\b", re.I)
NOISE = re.compile(r"^(\*\*zoom|\d{4}(FA|WI|SP|SU)_)", re.I)      # Canvas mirrors of class sessions
ROUTINE = re.compile(r"^(TA\b|[A-Z]{2,8} \d{3}\S* —)|recurring|weekly|class day", re.I)
TA_COURSE = re.compile(r"(?:MPD|DSGN)[\s_-]*(?:\d{3}[-\d]*_\w*?_AND_)?(?:416|401|410)(?!\d)", re.I)
TIME_RE = re.compile(r"^(\d{1,2}:\d{2}\s?(?:[ap]m?)?|\d{1,2}\s?[ap]m?)\s+(.+)$", re.I)
TAG_RE = re.compile(r"^(Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun|Today|Tonight|Tmrw|Tomorrow|\d{1,2}/\d{1,2})\b[:,]?\s+(.+)$", re.I)
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def font(weight, size):
    return ImageFont.truetype(os.path.join(HERE, "fonts", f"BarlowCondensed-{weight}.ttf"), size)


# ---------------------------------------------------------------- data ----
class HAClient:
    def __init__(self):
        sup = os.environ.get("SUPERVISOR_TOKEN")
        self.token = os.environ.get("HA_TOKEN") or sup
        self.base = os.environ.get("HA_URL") or ("http://supervisor/core" if sup and not os.environ.get("HA_TOKEN")
                                                 else "http://100.110.52.70:8123")
        self.socks = os.environ.get("HA_SOCKS", "" if sup and not os.environ.get("HA_TOKEN") else "socks5h://127.0.0.1:1055")
        if not self.token:
            raise RuntimeError("no HA_TOKEN / SUPERVISOR_TOKEN in environment")

    def _req(self, method, path, body=None):
        if not self.socks:   # in-HA (add-on) path: plain urllib, no curl needed
            import urllib.request
            req = urllib.request.Request(self.base + path, method=method,
                                         data=json.dumps(body).encode() if body is not None else None,
                                         headers={"Authorization": f"Bearer {self.token}",
                                                  "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read() or b"null")
        # curl keeps SOCKS support dependency-free; the token goes via a header file on stdin, not argv.
        cmd = ["curl", "-sS", "-f", "--max-time", "20", "-X", method, "-H", "@-",
               "-H", "Content-Type: application/json"]
        if self.socks:
            cmd += ["--proxy", self.socks]
        if body is not None:
            cmd += ["--data", json.dumps(body)]
        cmd.append(self.base + path)
        r = subprocess.run(cmd, input=f"Authorization: Bearer {self.token}\n", capture_output=True, text=True)
        if r.returncode:
            raise RuntimeError(f"{method} {path}: {r.stderr.strip()[:160]}")
        return json.loads(r.stdout or "null")

    def get(self, path):
        return self._req("GET", path)

    def post(self, path, body):
        return self._req("POST", path, body)


def fetch_snapshot(now, want_briefing=True):
    """Pull everything the frame needs. Every source is optional."""
    snap = {"fetched_at": now.isoformat(), "errors": [], "sources": []}
    try:
        ha = HAClient()
    except Exception as e:
        snap["errors"].append(str(e)); return snap
    try:
        w = ha.get(f"/api/states/{WEATHER}")
        snap["weather"] = {"state": w["state"], **{k: w["attributes"].get(k) for k in
                           ("temperature", "temperature_unit", "humidity", "wind_speed")}}
        snap["sources"].append(WEATHER)
    except Exception as e:
        snap["errors"].append(f"weather: {e}")
    try:
        fc = ha.post("/api/services/weather/get_forecasts?return_response",
                     {"entity_id": WEATHER, "type": "daily"})
        snap["forecast"] = fc["service_response"][WEATHER]["forecast"][:4]
        snap["sources"].append("weather.get_forecasts")
    except Exception as e:
        snap["errors"].append(f"forecast: {e}")
    if want_briefing:
        try:
            b = ha.get(f"/api/states/{BRIEFING_SENSOR}")
            if b and b.get("state") not in (None, "unknown", "unavailable"):
                snap["briefing"] = {"entity": BRIEFING_SENSOR, "state": b["state"],
                                    "_last_updated": b.get("last_updated"), **b.get("attributes", {})}
                snap["sources"].append(BRIEFING_SENSOR)
        except Exception as e:
            snap["errors"].append(f"{BRIEFING_SENSOR}: {str(e)[-40:]}")
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + dt.timedelta(days=9)
    events = []
    for cal in CALENDARS:
        try:
            q = f"?start={start.isoformat().replace('+', '%2B')}&end={end.isoformat().replace('+', '%2B')}"
            for ev in ha.get(f"/api/calendars/{cal}{q}") or []:
                ev["calendar"] = cal; events.append(ev)
            snap["sources"].append(cal)
        except Exception as e:
            snap["errors"].append(f"{cal}: {e}")
    snap["events"] = events
    return snap


# ------------------------------------------------------------ shaping ----
def clean(text):
    t = html.unescape(re.sub(r"<[^>]+>", " ", text or ""))
    t = re.sub(r"\[[^\]]*\]", "", t)            # Canvas course codes: [CCS_2026FA_...]
    t = re.sub(r"\s+", " ", t).strip(" -—·")
    return t or "(untitled)"


def parse_when(v):
    if "dateTime" in v:
        return dt.datetime.fromisoformat(v["dateTime"]).astimezone(TZ), False
    d = dt.date.fromisoformat(v["date"])
    return dt.datetime(d.year, d.month, d.day, tzinfo=TZ), True


def hm(t):
    return f"{t.hour % 12 or 12}:{t.minute:02d}"


def _list(v):
    if isinstance(v, str):
        try:
            v = json.loads(v)
        except Exception:
            v = [x for x in re.split(r"\s*[\n|;]\s*", v) if x]
    return [str(x) for x in (v or []) if str(x).strip()]


def tag_date(tag, base):
    """Resolve 'Fri' / '11/17' / 'Tmrw' to a date on or after base (None if unknown)."""
    t = tag.lower()
    if t in ("today", "tonight"):
        return base
    if t in ("tmrw", "tomorrow"):
        return base + dt.timedelta(days=1)
    if "/" in t:
        m, d = (int(x) for x in t.split("/"))
        for y in (base.year, base.year + 1):
            try:
                c = dt.date(y, m, d)
            except ValueError:
                return None
            if c >= base - dt.timedelta(days=60):
                return c
        return None
    idx = DAYS.index(t[:3])
    return base + dt.timedelta(days=(idx - base.weekday()) % 7)


def briefing_state(snap, now):
    """Return (payload, why_not). Payload is usable only if fresh and not for a past day."""
    b = snap.get("briefing")
    if not b:
        return None, "missing"
    today, week = _list(b.get("today")), _list(b.get("week"))
    if not (today or week or b.get("top")):
        return None, "empty"
    stamp = b.get("updated") or b.get("_last_updated")
    if stamp:
        try:
            ts = dt.datetime.fromisoformat(str(stamp).replace("Z", "+00:00"))
            ts = ts.replace(tzinfo=TZ) if ts.tzinfo is None else ts
            if now - ts > dt.timedelta(hours=STALE_HOURS):
                return None, "stale"
        except ValueError:
            pass
    fd = None
    if b.get("for_date"):
        try:
            fd = dt.date.fromisoformat(str(b["for_date"])[:10])
        except ValueError:
            fd = None
        if fd and fd < now.date():
            return None, "old for_date"
    return {"top": clean(b.get("top") or b.get("state") or ""), "today": today, "week": week,
            "for_date": fd, "updated": stamp, "injected": b.get("entity") == "--briefing-json"}, None


def item(text, base, now, kind):
    """-> dict(tag, text, red, dot). kind='today' splits a leading time, 'week' a day/date tag."""
    text = clean(text)
    if kind == "today":
        m = TIME_RE.match(text)
        if m:
            return {"tag": m.group(1).replace(" ", ""), "text": m.group(2), "red": False, "dot": False}
        return {"tag": "", "text": text, "red": False, "dot": True, "deadline": bool(DEADLINE.search(text))}
    m = TAG_RE.match(text)
    if m:
        tg = m.group(1)
        tg = tg[:3].capitalize() if not tg[0].isdigit() and tg.lower() not in ("today", "tonight", "tomorrow", "tmrw") else tg
        d = tag_date(tg, base)
        red = d is not None and 0 <= (d - now.date()).days <= 1    # due by end of tomorrow = within 48 h
        return {"tag": tg, "text": m.group(2), "red": red, "dot": False}
    return {"tag": "", "text": text, "red": False, "dot": True, "deadline": bool(DEADLINE.search(text))}


def from_briefing(p, now):
    focus = p["for_date"] or now.date()
    label = "TOMORROW" if focus == now.date() + dt.timedelta(days=1) else "TODAY"
    if focus > now.date() + dt.timedelta(days=1):
        label = focus.strftime("%a").upper()
    today = [item(x, focus, now, "today") for x in p["today"]]
    week = [item(x, focus, now, "week") for x in p["week"]]
    return {"label": label, "focus": focus, "top": p["top"], "today": today, "week": week,
            "source": "alfred", "updated": p["updated"], "injected": p.get("injected")}


def is_ta_canvas(ev):
    if "canvas" not in ev.get("calendar", ""):
        return False
    blob = f"{ev.get('summary') or ''} {ev.get('description') or ''}"
    return bool(TA_COURSE.search(blob))


def from_calendars(snap, now, night):
    focus, label = now.date(), "TODAY"
    if now.hour >= 20:      # same evening switch as Alfred's next-day payloads
        focus, label = focus + dt.timedelta(days=1), "TOMORROW"
    evs, seen = [], {}
    for ev in snap.get("events", []):
        if ev.get("calendar") not in CALENDARS or is_ta_canvas(ev):
            continue
        try:
            s, allday = parse_when(ev["start"]); e, _ = parse_when(ev["end"])
        except Exception:
            continue
        raw = (ev.get("summary") or "").strip()
        if NOISE.search(raw):
            continue
        name = clean(raw)
        nk = re.sub(r"[^a-z0-9 ]", "", name.lower()).strip()
        day_names = seen.setdefault(s.date(), [])
        if any(nk in o or o in nk for o in day_names):    # same event mirrored with a prefix, e.g. "[EDI] X" / "X"
            continue
        day_names.append(nk)
        evs.append({"s": s, "e": e, "allday": allday, "name": name,
                    "deadline": bool(DEADLINE.search(name)),   # no calendar-based boosts (Canvas/holiday/birthday)
                    "routine": bool(ROUTINE.search(name))})
    evs.sort(key=lambda x: (x["s"], not x["allday"]))
    today = [x for x in evs if x["allday"] and x["s"].date() <= focus < x["e"].date()] + \
            [x for x in evs if not x["allday"] and x["s"].date() == focus and (label != "TODAY" or x["e"] > now)]
    t_items = [{"tag": "" if x["allday"] else hm(x["s"]), "text": x["name"], "red": False,
                "dot": x["allday"], "deadline": x["deadline"]} for x in today]
    wk_start, wk_end = focus + dt.timedelta(days=1), focus + dt.timedelta(days=7)
    week, names = [], {x["name"].lower() for x in today}
    for x in evs:
        d = x["s"].date()
        if wk_start <= d <= wk_end and not x["routine"] and x["name"].lower() not in names:
            names.add(x["name"].lower()); week.append(x)
    pick_ = sorted(week, key=lambda x: (not x["deadline"], x["s"]))[:6]
    pick_.sort(key=lambda x: x["s"])
    w_items = []
    for x in pick_:
        d = x["s"].date()
        tg = x["s"].strftime("%a") if (d - now.date()).days < 7 else f"{d.month}/{d.day}"
        txt = x["name"] if x["allday"] else f"{hm(x['s'])} {x['name']}"
        w_items.append({"tag": tg, "text": txt, "red": 0 <= (d - now.date()).days <= 1, "dot": False})
    top = next((x["name"] for x in today if x["deadline"]), None) or \
        next((f"Next due: {x['name']} ({x['s'].strftime('%a')})" for x in week if x["deadline"]), None) or \
        next((f"Next: {x['name']}" for x in today), None) or \
        next((f"Next: {x['name']} ({x['s'].strftime('%a')})" for x in week), "")
    return {"label": label, "focus": focus, "top": top, "today": t_items, "week": w_items,
            "source": "calendar", "updated": None}


def greeting(now, night):
    h = now.hour
    if night:
        return "Good night, Adi" if h >= NIGHT_START else "Up late, Adi?"
    return "Good morning, Adi" if h < 12 else "Good afternoon, Adi" if h < 17 else "Good evening, Adi"


# ------------------------------------------------------------ drawing ----
THEMES = {
    "day": {"card": "white", "ink": "black", "sub": "blue", "rule": "black", "time": "blue",
            "top_fill": "red", "top_ink": "white", "top_tag_fill": "yellow", "top_tag_ink": "black",
            "head_fill": "black", "head_ink": "yellow", "wx_fill": "yellow", "wx_ink": "black",
            "chip_fill": "red", "chip_ink": "white", "tag": "black", "dot": "black", "dot_hot": "red", "faint": "blue"},
    "night": {"card": "black", "ink": "white", "sub": "yellow", "rule": "white", "time": "yellow",
              "top_fill": "blue", "top_ink": "white", "top_tag_fill": "yellow", "top_tag_ink": "black",
              "head_fill": "yellow", "head_ink": "black", "wx_fill": "blue", "wx_ink": "white",
              "chip_fill": "red", "chip_ink": "white", "tag": "white", "dot": "white", "dot_hot": "red", "faint": "yellow"},
}


def C(name):
    return PALETTE[name]


def fit_text(draw, text, weight, max_w, size, min_size):
    """Largest font <= size that fits max_w; truncate with an ellipsis at min_size."""
    for s in range(size, min_size - 1, -1):
        f = font(weight, s)
        if draw.textlength(text, font=f) <= max_w:
            return text, f
    f = font(weight, min_size)
    while text and draw.textlength(text + "…", font=f) > max_w:
        text = text[:-1].rstrip(" ,;:-/+&")
    return text + "…", f


def truncate(draw, text, f, max_w):
    if draw.textlength(text, font=f) <= max_w:
        return text
    while text and draw.textlength(text + "…", font=f) > max_w:
        text = text[:-1].rstrip(" ,;:-/+&")
    return text + "…"


def wrap2(draw, text, f, max_w):
    """Split into at most 2 lines on word boundaries; second line truncated."""
    words, line1 = text.split(), ""
    for i, w_ in enumerate(words):
        trial = (line1 + " " + w_).strip()
        if draw.textlength(trial, font=f) > max_w:
            if not line1:
                return [truncate(draw, text, f, max_w)]
            return [line1, truncate(draw, " ".join(words[i:]), f, max_w)]
        line1 = trial
    return [line1]


def cap_metrics(f):
    """(top offset, height) of capital/digit glyphs, for optical vertical centring."""
    b = f.getbbox("H8")
    return b[1], b[3] - b[1]


def text_center(draw, x, cy, text, f, fill, anchor_right=False):
    top, h = cap_metrics(f)
    if anchor_right:
        x -= draw.textlength(text, font=f)
    draw.text((x, cy - h / 2 - top), text, font=f, fill=fill)


def layout_column(draw, items, width, tagw, size, row_h, avail_h):
    """Return list of rows (item, lines) that fit avail_h at this font size, and how many were dropped."""
    f = font("Bold", size)
    rows, used = [], 0
    for i, it in enumerate(items):
        tw = width - tagw
        lines, h = [truncate(draw, it["text"], f, tw)], row_h
        if used + h > avail_h:
            return rows, len(items) - i
        rows.append((it, lines, h)); used += h
    return rows, 0


def draw_column(draw, box, label, items, empty, th, size, night):
    x0, y0, x1, y1 = box
    # Section header chip
    hf = font("ExtraBold", 26)
    lw = int(draw.textlength(label, font=hf)) + 20
    draw.rectangle((x0, y0, x0 + lw, y0 + 32), fill=C(th["head_fill"]))
    text_center(draw, x0 + 10, y0 + 16, label, hf, C(th["head_ink"]))
    draw.line((x0 + lw, y0 + 31, x1, y0 + 31), fill=C(th["head_fill"]), width=2)
    y = y0 + 40
    if not items:
        f = font("SemiBold", size)
        text_center(draw, x0 + 6, y + 20, empty, f, C(th["faint"]))
        return {"size": size, "dropped": 0}
    tf = font("ExtraBold", size)
    tags = [it["tag"] for it in items if it["tag"]]
    tagw = (max(int(draw.textlength(t, font=tf)) for t in tags) + 22) if tags else 26
    tagw = max(tagw, 26)
    row_h = int(size * 1.55)
    rows, dropped = layout_column(draw, items, x1 - x0, tagw, size, row_h, y1 - y)
    if dropped:   # make room for a "+N more" line
        rows, dropped = layout_column(draw, items, x1 - x0, tagw, size, row_h, y1 - y - 24)
    f = font("Bold", size)
    for it, lines, h in rows:
        cy = y + row_h / 2
        tx = x0 + tagw - 12
        if it["tag"]:
            tw_ = draw.textlength(it["tag"], font=tf)
            if it.get("red"):
                draw.rectangle((tx - tw_ - 5, cy - size * 0.48, tx + 5, cy + size * 0.48), fill=C(th["chip_fill"]))
                text_center(draw, tx, cy, it["tag"], tf, C(th["chip_ink"]), anchor_right=True)
            else:
                col = th["time"] if items is not None and label not in ("THIS WEEK", "COMING UP") else th["tag"]
                text_center(draw, tx, cy, it["tag"], tf, C(col), anchor_right=True)
        else:
            s = max(7, size // 3)
            col = th["dot_hot"] if it.get("deadline") else th["dot"]
            draw.rectangle((tx - s, cy - s / 2, tx, cy + s / 2), fill=C(col))
        for li, ln in enumerate(lines):
            text_center(draw, x0 + tagw, cy + li * int(size * 0.95), ln, f, C(th["ink"]))
        y += h
    if dropped:
        mf = font("SemiBold", 20)
        text_center(draw, x0 + tagw, y + 10, f"+{dropped} more", mf, C(th["faint"]))
    return {"size": size, "dropped": dropped}


def best_size(draw, cols, max_size=30, min_size=22, trunc_size=26):
    """Largest common size where every row fits on one line; else the largest <= trunc_size that fits
    vertically (long rows then get an ellipsis rather than shrinking below a desk-readable size)."""
    for s in range(max_size, min_size - 1, -1):
        ok = True
        for (box, items) in cols:
            x0, y0, x1, y1 = box
            tf = font("ExtraBold", s)
            tags = [it["tag"] for it in items if it["tag"]]
            tagw = max((max(int(draw.textlength(t, font=tf)) for t in tags) + 22) if tags else 26, 26)
            f = font("Bold", s)
            row_h = int(s * 1.55)
            if row_h * len(items) > (y1 - y0 - 40) or \
                    any(draw.textlength(it["text"], font=f) > (x1 - x0 - tagw) for it in items):
                ok = False; break
        if ok:
            return s
    for s in range(trunc_size, min_size - 1, -1):
        if all(int(s * 1.55) * len(items) <= (b[3] - b[1] - 40) for b, items in cols):
            return s
    return min_size


def quantize(img):
    """Nearest-colour snap to the 6-colour palette, no dither."""
    pal = Image.new("P", (1, 1))
    pal.putpalette([c for rgb in PAL for c in rgb] + [0] * (256 - len(PAL)) * 3)
    return img.convert("RGB").quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")


def forecast_for(snap, day):
    for fc in snap.get("forecast") or []:
        try:
            if dt.datetime.fromisoformat(fc["datetime"].replace("Z", "+00:00")).astimezone(TZ).date() == day:
                return fc
        except Exception:
            pass
    return None


def render(snap, now, mode="auto", bg_override=None, force_fallback=False):
    layout = json.load(open(os.path.join(HERE, "layout.json")))
    night = (now.hour >= NIGHT_START or now.hour < NIGHT_END) if mode == "auto" else mode == "night"
    th = THEMES["night" if night else "day"]
    pool = layout["night" if night else "day"]
    spec = next((p for p in pool if p["file"] == bg_override), None) or pool[now.date().toordinal() % len(pool)]
    bg_path = os.path.join(HERE, layout["bg_dir"], spec["file"])
    img = Image.open(bg_path).convert("RGB").resize((W, H)) if os.path.exists(bg_path) else \
        Image.new("RGB", (W, H), C("red" if not night else "blue"))
    img = quantize(img)
    d = ImageDraw.Draw(img)
    d.fontmode = "1"   # aliased glyphs: no anti-alias greys to snap

    p, why = (None, "forced") if force_fallback else briefing_state(snap, now)
    data = from_briefing(p, now) if p else from_calendars(snap, now, night)

    F = layout.get("frame", 14)
    cx0, cy0, cx1, cy1 = F, F, W - F, H - F
    d.rectangle((cx0 - 3, cy0 - 3, cx1 + 2, cy1 + 2), fill=C("black"))
    d.rectangle((cx0, cy0, cx1 - 1, cy1 - 1), fill=C(th["card"]))
    pad = 14

    # ---- header: date + greeting (left) | weather chip (right)
    hy0, hy1 = cy0, cy0 + 62
    wx0 = cx1 - 236
    wfill = C(th["wx_fill"]); wink = C(th["wx_ink"])
    d.rectangle((wx0, hy0, cx1 - 1, hy1), fill=wfill)
    w = snap.get("weather") or {}
    temp = w.get("temperature")
    big = f"{round(float(temp))}°" if temp not in (None, "") else "--°"
    bf = font("ExtraBold", 52)
    text_center(d, wx0 + 12, (hy0 + hy1) / 2, big, bf, wink)
    bx = wx0 + 12 + d.textlength(big, font=bf) + 10
    cond = CONDITIONS.get(w.get("state"), (w.get("state") or "n/a").replace("-", " ").capitalize())
    fc = forecast_for(snap, data["focus"]) or forecast_for(snap, now.date())
    hl = ""
    if fc and fc.get("temperature") is not None and fc.get("templow") is not None:
        pre = data["focus"].strftime("%a ") if data["focus"] != now.date() else ""
        hl = f"{pre}H{round(fc['temperature'])} L{round(fc['templow'])}"
        if data["focus"] != now.date() and fc.get("condition"):
            cond = f"now {cond.lower()}" if len(cond) < 9 else cond
    sw = cx1 - 1 - bx - 8
    ct, cf = fit_text(d, cond, "SemiBold", sw, 24, 18)
    text_center(d, bx, hy0 + 19, ct, cf, wink)
    if hl:
        ht, hf_ = fit_text(d, hl, "Bold", sw, 24, 18)
        text_center(d, bx, hy0 + 44, ht, hf_, wink)
    # date + greeting
    dtxt = now.strftime("%a %b ").upper() + str(now.day)
    df = font("ExtraBold", 46)
    text_center(d, cx0 + pad, (hy0 + hy1) / 2, dtxt, df, C(th["ink"]))
    gx = cx0 + pad + d.textlength(dtxt, font=df) + 16
    gt, gf = fit_text(d, greeting(now, night), "SemiBold", wx0 - gx - 10, 28, 20)
    text_center(d, gx, (hy0 + hy1) / 2 + 4, gt, gf, C(th["sub"]))

    # ---- TOP focus band
    ty0, ty1 = hy1 + 4, hy1 + 4 + 54
    d.rectangle((cx0, ty0, cx1 - 1, ty1), fill=C(th["top_fill"]))
    lab = "FOCUS"
    lf = font("ExtraBold", 24)
    lw = int(d.textlength(lab, font=lf)) + 18
    d.rectangle((cx0 + pad, ty0 + 12, cx0 + pad + lw, ty1 - 12), fill=C(th["top_tag_fill"]))
    text_center(d, cx0 + pad + 9, (ty0 + ty1) / 2, lab, lf, C(th["top_tag_ink"]))
    top = data["top"] or "No focus set"
    tt, tf_ = fit_text(d, top, "ExtraBold", cx1 - (cx0 + pad + lw + 14) - pad, 40, 26)
    text_center(d, cx0 + pad + lw + 14, (ty0 + ty1) / 2, tt, tf_, C(th["top_ink"]))

    # ---- columns
    by0, by1 = ty1 + 12, cy1 - 22
    mid = cx0 + (cx1 - cx0) * 52 // 100
    left = (cx0 + pad, by0, mid - 12, by1)
    right = (mid + 14, by0, cx1 - pad, by1)
    size = best_size(d, [(left, data["today"]), (right, data["week"])])
    lab_l = data["label"] + (" · " + data["focus"].strftime("%a").upper() if data["label"] == "TOMORROW" else "")
    r1 = draw_column(d, left, lab_l, data["today"], "Nothing left today" if data["label"] == "TODAY" and now.hour >= 12 else "Nothing scheduled", th, size, night)
    r2 = draw_column(d, right, "THIS WEEK", data["week"], "Clear week ahead", th, size, night)
    d.line((mid, by0 + 4, mid, by1), fill=C(th["rule"]), width=2)

    # ---- footer marker
    ff = font("SemiBold", 17)
    if data["source"] == "alfred":
        foot = "via Alfred"
        if data.get("injected"):
            foot += " (preview payload)"
        elif data["updated"]:
            try:
                u = dt.datetime.fromisoformat(str(data["updated"]).replace("Z", "+00:00")).astimezone(TZ)
                foot += f" · {u.hour % 12 or 12}:{u.minute:02d}{'a' if u.hour < 12 else 'p'}"
            except ValueError:
                pass
        fcol = C(th["faint"])
    else:
        foot = f"calendar fallback ({why})"
        fcol = C("red")
    fw = d.textlength(foot, font=ff)
    text_center(d, cx1 - pad - fw, cy1 - 11, foot, ff, fcol)
    rt = f"rendered {now.hour % 12 or 12}:{now.minute:02d}{'a' if now.hour < 12 else 'p'}"
    text_center(d, cx0 + pad, cy1 - 11, rt, ff, C(th["faint"]))

    out = quantize(img)
    return out, {"background": spec["file"], "night": night, "source": data["source"], "why_fallback": why,
                 "label": data["label"], "font_px": size, "top": data["top"],
                 "today": [f"{i['tag']}|{i['text']}" for i in data["today"]],
                 "week": [f"{i['tag']}{'!' if i['red'] else ''}|{i['text']}" for i in data["week"]],
                 "dropped": [r1["dropped"], r2["dropped"]]}


def palette_ok(img):
    cols = {c for _, c in img.getcolors(1 << 20)}
    return cols <= set(PAL), sorted(cols)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(HERE, "previews", "briefing-spectra.png"))
    ap.add_argument("--now", help="ISO local time override (America/Chicago)")
    ap.add_argument("--mode", choices=["auto", "day", "night"], default="auto")
    ap.add_argument("--bg", help="force a background file name from layout.json")
    ap.add_argument("--data", help="render from a saved snapshot JSON instead of HA")
    ap.add_argument("--save-data", help="write the fetched snapshot here")
    ap.add_argument("--briefing-json", help="inject an Alfred payload {top,today,week,for_date?,updated?} "
                                            "instead of reading sensor.alfred_briefing (preview; writes nothing to HA)")
    ap.add_argument("--no-briefing", action="store_true", help="force the calendar fallback")
    ap.add_argument("--emit", choices=["pure", "addon"], default="pure",
                    help="pure = exact #000/#FFF/#F00/#FF0/#00F/#0F0; addon = the EE04 add-on's device RGBs")
    a = ap.parse_args()
    now = dt.datetime.fromisoformat(a.now).replace(tzinfo=TZ) if a.now else dt.datetime.now(TZ)
    snap = json.load(open(a.data)) if a.data else fetch_snapshot(now, want_briefing=not (a.briefing_json or a.no_briefing))
    if a.save_data:
        json.dump(snap, open(a.save_data, "w"), indent=1, default=str)
    if a.briefing_json:
        b = json.load(open(a.briefing_json))
        b.setdefault("_last_updated", now.isoformat())   # injected snapshot counts as fresh unless 'updated' says otherwise
        snap = {**snap, "briefing": {"entity": "--briefing-json", **b}}
    if a.no_briefing:
        snap = {k: v for k, v in snap.items() if k != "briefing"}
    img, info = render(snap, now, a.mode, a.bg)
    ok, cols = palette_ok(img)
    assert img.size == (W, H) and ok, f"palette violation: {cols}"
    if a.emit == "addon":
        px = img.load()
        for y in range(H):
            for x in range(W):
                px[x, y] = ADDON_RGB[px[x, y]]
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(a.out)), suffix=".png")
    os.close(fd); img.save(tmp, optimize=True); os.chmod(tmp, 0o644); os.replace(tmp, a.out)
    print(json.dumps({"out": a.out, **info, "colors": len(cols), "sources": snap.get("sources"),
                      "errors": snap.get("errors")}, default=str))


if __name__ == "__main__":
    main()
