ARG BUILD_FROM
FROM ${BUILD_FROM}

# playwright-core 1.61.1 drives Chromium 149.0.7827.55. Alpine's musl package
# for that milestone is 149.0.7827.53-r0, published for both addon arches.
# Playwright's bundled browser is a glibc build and does not run on this base.
# DEBUG=pw:api enables Playwright's API log without changing these timeouts.
# python3 renders the briefing page. py3-pillow draws it; tzdata supplies
# America/Chicago for zoneinfo. HA_SOCKS is cleared, so render.py uses urllib
# and does not need curl.
RUN apk add --no-cache \
    chromium=149.0.7827.53-r0 \
    font-noto \
    freetype \
    harfbuzz \
    nss \
    nodejs \
    npm \
    python3 \
    py3-pillow \
    tzdata

# Alpine's py3-pillow 11 is built without raqm, so text measures wider than the
# reference renderer. One week line then misses fitting at 24px by a couple of
# pixels, best_size drops to 23, and row pitch shrinks from 37 to 35.
# Pillow 10.2 with raqm reproduces the reference frame.
RUN apk add --no-cache libraqm fribidi \
    && apk add --no-cache --virtual .pillow-build \
        gcc \
        musl-dev \
        python3-dev \
        py3-pip \
        libraqm-dev \
        fribidi-dev \
        freetype-dev \
        harfbuzz-dev \
        jpeg-dev \
        zlib-dev \
        libpng-dev \
    && pip install --break-system-packages --no-cache-dir --no-binary=pillow 'pillow==10.2.0' \
    && apk del .pillow-build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . ./
RUN npm run build

ENV CHROMIUM_PATH=/usr/bin/chromium-browser
ENV NODE_ENV=production

CMD ["/usr/bin/with-contenv", "node", "dashboard-server.mjs"]
