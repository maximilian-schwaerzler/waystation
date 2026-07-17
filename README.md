# Waystation

A self-hostable Thunderbird FileLink service.

## Local development

Requires Node.js 24+.

```
npm install
npm run dev
```

`npm run dev` runs the server with `nodemon`, which auto-restarts on file changes. Data
(the SQLite DB and uploaded files) is written to `./data` in the repo — this is handled
by `nodemon.json`, which sets `DATA_DIR=./data` for dev runs only. No Docker container or
manual setup of `/data` is needed for local development.

In production (via Docker), the app always uses the fixed path `/data` instead — see
`docker-compose.yml` and the `WAYSTATION_DATA_DIR` bind mount.

Other commands:

```
npm run lint   # ESLint
npm start      # run once with plain `node .` (uses /data, not ./data)
```

## Running with Docker

```
docker compose up -d --build
```

See `.env.example` for the environment variables (`WAYSTATION_INSTANCE_ID`,
`WAYSTATION_DATA_DIR`) to configure in a `.env` file.