FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache su-exec chromium nss freetype harfbuzz ca-certificates ttf-freefont

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY --chown=node:node services/bridge/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node lib ./lib
COPY --chown=node:node services/bridge .

# Права на /app/bridge-state задаёт entrypoint (чтобы node мог писать в volume)
COPY --chown=root:root services/bridge/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"]
