FROM node:20-alpine

WORKDIR /app

COPY --chown=node:node services/bridge/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node lib ./lib
COPY --chown=node:node services/bridge .

USER node

CMD ["node", "server.js"]
