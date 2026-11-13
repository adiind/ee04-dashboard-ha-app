# Changelog

## 1.0.6

- The briefing is Alfred's action list only. A valid sensor.alfred_briefing is saved under /data and shown again, with the time it was saved, when the sensor is missing; otherwise the panel waits for Alfred. List rows keep the reference pitch: stock py3-pillow ignores libraqm, and the musllinux wheels that load it still miss the reference because they ship their own FreeType, so the image builds Pillow 10.2 with raqm against its own FreeType.

## 1.0.5

- v3 actionable briefing: reads sensor.alfred_briefing, filtered calendar fallback, full-screen layout

## 1.0.4

- Return to the briefing page on startup, and on the next scheduled or board-wake render, when the saved page is not briefing and the last Prev, Next, or Systems press was more than 10 minutes ago or was never recorded. A press within that window keeps the current page and restarts the 10 minutes. The press time is stored in the page-state file so it survives a restart.

## 1.0.3

- Add the E Ink daily briefing as the first page and the startup default. Each refresh runs `briefing/render.py` and publishes that palette-clean PNG directly, skipping the add-on's colour conversion. If the briefing renderer fails or exceeds 60 seconds, the add-on logs the error and falls back to the existing Chromium render of Home. Previous and Next still cycle through the original pages.
