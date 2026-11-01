ARG BUILD_FROM
FROM ${BUILD_FROM}

# playwright-core 1.61.1 drives Chromium 149.0.7827.55. Alpine's musl package
# for that milestone is 149.0.7827.53-r0, published for both addon arches.
# Playwright's bundled browser is a glibc build and does not run on this base.
# DEBUG=pw:api enables Playwright's API log without changing these timeouts.
RUN apk add --no-cache \
    chromium=149.0.7827.53-r0 \
    font-noto \
    freetype \
    harfbuzz \
    nss \
    nodejs \
    npm

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . ./
RUN npm run build

ENV CHROMIUM_PATH=/usr/bin/chromium-browser
ENV NODE_ENV=production

CMD ["/usr/bin/with-contenv", "node", "dashboard-server.mjs"]
