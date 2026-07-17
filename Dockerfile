FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

RUN useradd --system --create-home --uid 1001 waystation \
    && mkdir -p /data \
    && chown -R waystation:waystation /app /data

USER waystation

VOLUME /data

EXPOSE 3000

# start-period covers the storage-readiness poll (up to 30 attempts x 2s = 60s worst
# case) during which the server hasn't started listening yet — failures in that window
# show as "starting", not "unhealthy".
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD node -e "require('http').get({host: 'localhost', port: process.env.WAYSTATION_PORT || 3000, path: '/', timeout: 4000}, res => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "."]