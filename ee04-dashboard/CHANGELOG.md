# Changelog

## 1.0.3

- Add the E Ink daily briefing as the first page and the startup default. Each refresh runs `briefing/render.py` and publishes that palette-clean PNG directly, skipping the add-on's colour conversion. If the briefing renderer fails or exceeds 60 seconds, the add-on logs the error and falls back to the existing Chromium render of Home. Previous and Next still cycle through the original pages.
