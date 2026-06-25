ARG BUILD_FROM
FROM ${BUILD_FROM}

RUN apk add --no-cache \
    chromium \
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
