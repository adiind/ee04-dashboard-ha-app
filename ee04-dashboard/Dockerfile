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

# Row pitch is int(font_size * 1.55). At 24px that is 37; at 23px it is 35.
# Stock py3-pillow 11.3 is compiled without raqm, so `apk add libraqm` leaves
# PIL.features.check("raqm") false and one week line measures 2px too wide.
# best_size then drops 24 -> 23 and the rows pack tighter.
# musllinux wheels do load raqm, but they bundle FreeType, so the valid frame
# is not the reference: Pillow 11.3.0 misses 13 pixels and 10.4.0 misses 224.
# Pillow 10.2 built against this image's FreeType matches all 384000 pixels.
# py3-pillow is removed first so the pip install is the only Pillow.
RUN apk add --no-cache libraqm fribidi \
    && apk del py3-pillow \
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
