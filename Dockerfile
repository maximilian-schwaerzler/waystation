FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

RUN useradd --system --create-home --uid 1001 waystation \
    && mkdir -p /app/data \
    && chown -R waystation:waystation /app

USER waystation

VOLUME /app/data

EXPOSE 3000

CMD ["node", "."]