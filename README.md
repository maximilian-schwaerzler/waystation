# Waystation

A self-hostable Thunderbird FileLink service.

## Getting the code

```
git clone git@github.com:maximilian-schwaerzler/waystation.git
cd waystation
```

To push changes:

```
git push origin main
```

The repo is private — push access requires being added as a collaborator on
[maximilian-schwaerzler/waystation](https://github.com/maximilian-schwaerzler/waystation).

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

Copy `.env.example` to `.env` and fill it in — it documents all supported environment
variables (`WAYSTATION_INSTANCE_ID`, `WAYSTATION_DATA_DIR`, `WAYSTATION_PUBLIC_URL`,
`WAYSTATION_LOG_LEVEL`, etc.).

On first run, the container prints a generated `WAYSTATION_INSTANCE_ID` and exits —
paste it into `.env` and restart. See `CLAUDE.md` for the full storage-readiness flow.