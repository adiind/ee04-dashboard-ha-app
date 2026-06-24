# EE04 Dashboard Home Assistant App

This repository contains the Home Assistant-owned runtime for the EE04 Spectra Dashboard.

The app reads Home Assistant through the Supervisor proxy, renders the existing 800x480 React dashboard with Chromium, atomically writes the six-colour PNG to `/config/www/eink/dashboard-spectra.png`, and exposes the LAN action endpoint used by the sleeping EE04 board.

## Install

1. In Home Assistant, add this private repository URL under **Settings > Apps > App store > three-dot menu > Repositories**.
2. Install **EE04 Spectra Dashboard**.
3. Generate a long random action token, set it in the app configuration, and put the identical value in the local ESPHome secret `ee04_ha_action_token` before compiling the HA-native firmware.
4. Start the app and wait for `/local/eink/dashboard-spectra.png` to return `200`.
5. Flash `esphome/ee04-spectra-dashboard-deepsleep.yaml` from the companion development repository only after the app image and button actions have been verified.

The app publishes no dashboard control service to the internet. Port `8099` is for the EE04's trusted LAN only and rejects requests without the configured action token.
