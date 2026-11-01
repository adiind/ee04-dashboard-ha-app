#!/usr/bin/env python3
"""Homebase EE04 Spectra briefing renderer.

Composes Adi's daily briefing over a pre-made background and writes a
palette-clean 800x480 PNG (exactly 6 colours, nearest-colour, no dither).

Token-free: the HA token is read from the HA_TOKEN env var at runtime only
(or, when run as an HA add-on, SUPERVISOR_TOKEN against http://supervisor/core).
Nothing secret is stored in this file or written to disk.

Usage:
  HA_TOKEN=... python3 render.py --out briefing.png [--now 2026-11-01T22:30] [--mode auto|day|night]
  python3 render.py --data snapshot.json --out x.png      # offline, from a saved snapshot
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
# The live add-on emits these device RGBs for the same six inks; --emit addon remaps 1:1 if the firmware needs them.
ADDON_RGB = {(0, 0, 0): (17, 17, 17), (255, 255, 255): (255, 255, 255), (255, 0, 0): (215, 25, 32),
             (255, 255, 0): (247, 198, 0), (0, 0, 255): (18, 97, 166), (0, 255, 0): (31, 157, 85)}
NIGHT_START, NIGHT_END = 22, 6
WEATHER = "weather.forecast_home"
BRIEFING_SENSORS = ["sensor.daily_briefing", "sensor.alfred_daily_briefing", "sensor.alfred_briefing"]
CALENDARS = [  # (entity, short tag) — duplicates (_2) and test calendars intentionally left out
    "calendar.adityaagarwal2027_u_northwestern_edu", "calendar.aditya_agarwal_calendar_canvas",
    "calendar.family", "calendar.team_mclovin", "calendar.adiind_yahoo_co_in",
    "calendar.birthdays", "calendar.holidays_in_india",
]
CONDITIONS = {"clear-night": "Clear", "cloudy": "Cloudy", "exceptional": "Alert", "fog": "Foggy",
              "hail": "Hail", "lightning": "Storms", "lightning-rainy": "Storms", "partlycloudy": "Partly cloudy",
              "pouring": "Pouring", "rainy": "Rain", "snowy": "Snow", "snowy-rainy": "Sleet",
              "sunny": "Sunny", "windy": "Windy", "windy-variant": "Windy"}
PRIORITY = re.compile(r"\b(due|deadline|exam|midterm|mid[- ]term|final|quiz|submit|submission|assignment|"
                      r"check-?in|presentation|present|interview|birthday|flight|appointment|review|demo)\b", re.I)


NOISE = re.compile(r"^(\*\*zoom|\d{4}(FA|WI|SP|SU)_)", re.I)      # Canvas mirrors of class sessions
ROUTINE = re.compile(r"^(TA\b|[A-Z]{2,8} \d{3}\S* —)|recurring|weekly|class day", re.I)  # classes / standing meetings


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


def fetch_snapshot(now):
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
        days = fc["service_response"][WEATHER]["forecast"]
        snap["forecast"] = days[:3]
        snap["sources"].append("weather.get_forecasts")
    except Exception as e:
        snap["errors"].append(f"forecast: {e}")
    for s in BRIEFING_SENSORS:
        try:
            b = ha.get(f"/api/states/{s}")
            if b and b.get("state") not in (None, "unknown", "unavailable"):
                snap["briefing"] = {"entity": s, "state": b["state"], **b.get("attributes", {})}
                snap["sources"].append(s); break
        except Exception:
            pass
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


def fmt_time(t):
    h = t.hour % 12 or 12
    return f"{h}{'' if t.minute == 0 else ':%02d' % t.minute}{'a' if t.hour < 12 else 'p'}"


def build_lists(snap, now, night):
    """Return (today_label, today_items, week_items); items are (tag, text, important)."""
    b = snap.get("briefing")
    if b and (b.get("today") or b.get("week")):
        tl = [("", clean(x), False) for x in (b.get("today") or [])]
        wl = [("", clean(x), False) for x in (b.get("week") or [])]
        return "TODAY", tl, wl
    focus = now.date()
    label = "TODAY"
    if night and now.hour >= NIGHT_START:
        focus, label = focus + dt.timedelta(days=1), "TOMORROW"
    evs, seen = [], set()
    for ev in snap.get("events", []):
        try:
            s, allday = parse_when(ev["start"]); e, _ = parse_when(ev["end"])
        except Exception:
            continue
        raw = (ev.get("summary") or "").strip()
        if NOISE.search(raw):
            continue
        name = clean(raw)
        cal = ev.get("calendar", "")
        key = (name.lower(), s.date())
        if key in seen:
            continue
        seen.add(key)
        important = bool(PRIORITY.search(name)) or "canvas" in cal or "holiday" in cal or "birthday" in cal
        evs.append({"s": s, "e": e, "allday": allday, "name": name, "important": important,
                    "routine": bool(ROUTINE.search(name)) and not important})
    evs.sort(key=lambda x: (x["s"], not x["allday"]))
    today = [x for x in evs if (x["s"].date() <= focus < x["e"].date()) if x["allday"]] + \
            [x for x in evs if not x["allday"] and x["s"].date() == focus and (label != "TODAY" or x["e"] > now)]
    today.sort(key=lambda x: (not x["allday"], x["s"]))
    t_items = [("ALL DAY" if x["allday"] else fmt_time(x["s"]), x["name"], x["important"]) for x in today]
    wk_start, wk_end = focus + dt.timedelta(days=1), focus + dt.timedelta(days=7)
    week, names = [], set()
    for x in evs:
        d = x["s"].date()
        if wk_start <= d <= wk_end and not x["routine"] and x["name"].lower() not in names:
            names.add(x["name"].lower()); week.append(x)
    # Deadlines/one-offs first, then fill, then show in date order.
    pick = sorted(week, key=lambda x: (not x["important"], x["s"]))[:6]
    pick.sort(key=lambda x: x["s"])
    w_items = [(x["s"].strftime("%a"), x["name"], x["important"]) for x in pick]
    return label, t_items, w_items


def greeting(now, night):
    h = now.hour
    if night:
        return "Good night, Adi" if h >= NIGHT_START else "Up late, Adi?"
    return "Good morning, Adi" if h < 12 else "Good afternoon, Adi" if h < 17 else "Good evening, Adi"


# ------------------------------------------------------------ drawing ----
def fit_text(draw, text, weight, max_w, size, min_size):
    """Largest font <= size that fits max_w; truncate with an ellipsis at min_size."""
    for s in range(size, min_size - 1, -2):
        f = font(weight, s)
        if draw.textlength(text, font=f) <= max_w:
            return text, f
    f = font(weight, min_size)
    while text and draw.textlength(text + "…", font=f) > max_w:
        text = text[:-1].rstrip()
    return text + "…", f


def ink_on(fill):
    return PALETTE["black"] if fill in ("white", "yellow", "green") else PALETTE["white"]


def text_block(draw, box, lines, fill):
    """Vertically centre lines of (text, weight, size, min_size, colour) in box.
    Uses real glyph extents; shrinks all lines together before dropping the last one."""
    x0, y0, x1, y1 = box
    pad, gap = 10, 4
    avail = (y1 - y0) - 8
    for scale in [1.0, 0.92, 0.85, 0.78, 0.7]:
        rendered = []
        for text, weight, size, mn, col in lines:
            t, f = fit_text(draw, text, weight, x1 - x0 - 2 * pad, max(mn, int(size * scale)), mn)
            top, bot = f.getbbox("Hg°")[1], f.getbbox("Hg°")[3]
            rendered.append((t, f, col, top, bot - top))
        total = sum(r[4] for r in rendered) + gap * (len(rendered) - 1)
        if total <= avail:
            break
    while total > avail and len(rendered) > 1:
        r = rendered.pop(); total -= r[4] + gap
    y = y0 + ((y1 - y0) - total) // 2
    for t, f, col, top, h in rendered:
        draw.text((x0 + pad, y - top), t, font=f, fill=col)
        y += h + gap


def pick(items, n):
    """Keep at most n items, preferring important ones, shown in time order."""
    if len(items) <= n:
        return items, 0
    idx = sorted(range(len(items)), key=lambda i: (not items[i][2], i))[:n]
    return [items[i] for i in sorted(idx)], len(items) - n


def draw_panel(draw, box, fill, label, today, week, night):
    x0, y0, x1, y1 = box
    ink = ink_on(fill)
    head = PALETTE["yellow"] if night else PALETTE["red"]
    tagc = PALETTE["yellow"] if night else PALETTE["blue"]
    pad, labw, gap = 16, 160, 14
    inner = y1 - y0 - 2 * pad - gap
    rows_avail = max(2, inner // 40)
    row_h = min(46, inner // rows_avail)
    nt = min(3 if rows_avail >= 6 or not week else 2, max(1, len(today)))
    nw = max(1, min(4, rows_avail - nt, max(1, len(week))))
    nt = min(nt, rows_avail - nw)
    tagf, moref = font("SemiBold", 26), font("SemiBold", 22)
    sections = [(label, today, nt, "Nothing scheduled"), ("COMING WEEK", week, nw, "Clear week ahead")]
    y = y0 + pad
    for si, (lab, items, n, empty) in enumerate(sections):
        if si == 1:
            draw.line((x0 + pad, y + gap // 2 - 3, x1 - pad, y + gap // 2 - 3), fill=head, width=3)
            y += gap
        sy = y
        lt, lf = fit_text(draw, lab, "ExtraBold", labw - 14, 34, 24)
        draw.text((x0 + pad, y + 2), lt, font=lf, fill=head)
        shown, more = pick(items, n)
        if more:
            draw.text((x0 + pad, y + 40), f"+{more} more", font=moref, fill=ink)
        if not shown:
            shown = [("", empty, False)]
        for tag, text, imp in shown:
            tx = x0 + pad + labw
            if tag:
                draw.text((tx, y + 6), tag, font=tagf, fill=PALETTE["red"] if imp and not night else tagc)
                tx += max(72, int(draw.textlength(tag, font=tagf)) + 12)
            t, f = fit_text(draw, text, "Bold", x1 - pad - tx, 34, 26)
            draw.text((tx, y), t, font=f, fill=ink)
            y += row_h
        y = max(y, sy + (68 if more else row_h))


def quantize(img):
    """Nearest-colour snap to the 6-colour palette, no dither."""
    pal = Image.new("P", (1, 1))
    pal.putpalette([c for rgb in PAL for c in rgb] + [0] * (256 - len(PAL)) * 3)
    return img.convert("RGB").quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")


def render(snap, now, mode="auto", bg_override=None):
    layout = json.load(open(os.path.join(HERE, "layout.json")))
    night = (now.hour >= NIGHT_START or now.hour < NIGHT_END) if mode == "auto" else mode == "night"
    pool = layout["night" if night else "day"]
    spec = next((p for p in pool if p["file"] == bg_override), None) or pool[now.date().toordinal() % len(pool)]
    bg_path = os.path.join(HERE, layout["bg_dir"], spec["file"])
    img = Image.open(bg_path).convert("RGB").resize((W, H)) if os.path.exists(bg_path) else \
        Image.new("RGB", (W, H), PALETTE["black" if night else "white"])
    d = ImageDraw.Draw(img)
    d.fontmode = "1"   # aliased glyphs: no anti-alias greys to snap

    label, today, week = build_lists(snap, now, night)
    # Greeting box
    g = spec["greeting"]
    ctx = now.strftime("%a %b ") + str(now.day)
    n_today = len(today)
    ctx += f"  ·  {n_today} {'tomorrow' if label == 'TOMORROW' else 'today'}" if n_today else \
        ("  ·  free tomorrow" if label == "TOMORROW" else "  ·  nothing on today")
    if snap.get("briefing", {}).get("headline"):
        ctx = clean(snap["briefing"]["headline"])
    gi = ink_on(g["fill"])
    text_block(d, g["box"], [(greeting(now, night), "ExtraBold", 40, 26, gi), (ctx, "SemiBold", 24, 18, gi)], g["fill"])
    # Temperature box (always shown)
    t = spec["temp"]; ti = ink_on(t["fill"])
    w = snap.get("weather") or {}
    temp = w.get("temperature")
    big = f"{round(float(temp))}°" if temp not in (None, "") else "--°"
    cond = CONDITIONS.get(w.get("state"), (w.get("state") or "weather n/a").replace("-", " ").capitalize())
    fcs = snap.get("forecast") or []
    fc = (fcs[1] if label == "TOMORROW" and len(fcs) > 1 else fcs[0]) if fcs else {}
    hl = ""
    if fc.get("temperature") is not None and fc.get("templow") is not None:
        hl = f"{'Tmrw ' if label == 'TOMORROW' and len(fcs) > 1 else ''}H{round(fc['temperature'])} L{round(fc['templow'])}"
    lines = [(big, "ExtraBold", 60 if t["box"][3] - t["box"][1] > 90 else 50, 34, ti), (cond, "SemiBold", 26, 18, ti)]
    if hl:
        lines.append((hl, "SemiBold", 24, 18, ti))
    text_block(d, t["box"], lines, t["fill"])
    # Panel
    p = spec["panel"]
    draw_panel(d, p["box"], p["fill"], label, today, week, night)
    return quantize(img), {"background": spec["file"], "night": night, "label": label,
                           "today": today, "week": week}


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
    ap.add_argument("--emit", choices=["pure", "addon"], default="pure",
                    help="pure = exact #000/#FFF/#F00/#FF0/#00F/#0F0; addon = the EE04 add-on's device RGBs")
    a = ap.parse_args()
    now = dt.datetime.fromisoformat(a.now).replace(tzinfo=TZ) if a.now else dt.datetime.now(TZ)
    snap = json.load(open(a.data)) if a.data else fetch_snapshot(now)
    if a.save_data:
        json.dump(snap, open(a.save_data, "w"), indent=1, default=str)
    img, info = render(snap, now, a.mode, a.bg)
    ok, cols = palette_ok(img)
    assert img.size == (W, H) and ok, f"palette violation: {cols}"
    if a.emit == "addon":
        lut = {k: v for k, v in ADDON_RGB.items()}
        px = img.load()
        for y in range(H):
            for x in range(W):
                px[x, y] = lut[px[x, y]]
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(a.out)), suffix=".png")
    os.close(fd); img.save(tmp, optimize=True); os.chmod(tmp, 0o644); os.replace(tmp, a.out)
    print(json.dumps({"out": a.out, **info, "colors": len(cols), "sources": snap.get("sources"),
                      "errors": snap.get("errors")}, default=str))


if __name__ == "__main__":
    main()
