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

### First-time setup (one-time, per storage volume)

Waystation ties its database and files to a unique instance ID stored alongside them.
This lets it detect a wrong or swapped storage volume before touching it — but it means
the **very first time you start it against a new volume, it won't come up straight
away.** This is expected, not a bug — here's exactly what happens:

**1. Copy the example env file.**

```
cp .env.example .env
```

**2. Start it.** Storage is empty, so instead of serving requests, it generates an
instance ID, prints it, and exits:

```
$ docker compose up
waystation-1  | [2026-01-01T12:00:00.000Z][INFO] First run detected. Generated instance ID: 3f9a2e11-4b7a-4c9d-9e2a-1a2b3c4d5e6f
waystation-1  | [2026-01-01T12:00:00.000Z][INFO] Set WAYSTATION_INSTANCE_ID=3f9a2e11-4b7a-4c9d-9e2a-1a2b3c4d5e6f in your .env file, then restart.
waystation-1 exited with code 0
```

**3. Copy that ID into `.env`:**

```
WAYSTATION_INSTANCE_ID=3f9a2e11-4b7a-4c9d-9e2a-1a2b3c4d5e6f
```

**4. Start it again.** This time it verifies the ID against storage and stays running:

```
$ docker compose up -d --build
$ docker compose logs -f
waystation-1  | [2026-01-01T12:01:00.000Z][INFO] Storage verified.
waystation-1  | [2026-01-01T12:01:00.000Z][INFO] Server running on http://localhost:3000
```

That's it — every run after this is just `docker compose up -d`. You'll only see this
flow again if you point `WAYSTATION_DATA_DIR` at a fresh, empty volume.

### Configuration

`.env.example` documents all supported environment variables (`WAYSTATION_DATA_DIR`,
`WAYSTATION_PUBLIC_URL`, `WAYSTATION_LOG_LEVEL`, etc.) beyond the instance ID above.

Set `WAYSTATION_UPLOAD_TOKEN` to require an `Authorization: Bearer <token>` header on
`POST /upload`. If unset, uploads are unauthenticated — the server logs a warning at
startup as a reminder. `GET /download/:token` is unaffected either way; those links are
meant to be shared and rely on the token being unguessable, not on this.

### Logs

```
docker compose logs -f
```

Logs are also written to `waystation.log` inside the storage volume (`WAYSTATION_DATA_DIR`
on the host), rotated at 10MB via `pino-roll`. Useful if the container isn't running (crash
loop, already exited) or you need history beyond what `docker compose logs` retains — just
read the file directly from the host path you configured for `WAYSTATION_DATA_DIR`.