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

CMD ["node", "."]