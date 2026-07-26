# Waystation

A self-hostable Thunderbird FileLink service.

## Getting the code

```
git clone https://github.com/maximilian-schwaerzler/waystation.git
cd waystation
```

See [maximilian-schwaerzler/waystation](https://github.com/maximilian-schwaerzler/waystation) for issues and
contributions.

## Local development

Requires Node.js 24+.

```
npm install
npm run dev
```

`npm run dev` runs the server with `nodemon`, which auto-restarts on file changes. Data
(the SQLite DB and uploaded files) is written to `waystation-data` in the repo — this is handled
by `nodemon.json`, which sets `WAYSTATION_DATA_DIR=./waystation-data` for dev runs only. No Docker
container or manual setup of `/waystation-data` is needed for local development.

In production (via Docker), the app always uses the fixed path `/waystation-data` instead —
see `docker-compose.yml` and the `WAYSTATION_DATA_DIR` bind mount.

Other commands:

```
npm run lint   # ESLint
npm start      # run once with plain `node .` (uses /waystation-data, not ./waystation-data)
```

## Running without Docker

Docker isn't required — the app is a plain Node.js process (raw `http` module,
`better-sqlite3`, filesystem I/O) and runs the same way outside a container. This is a
reasonable option if your host doesn't have Docker, or you just don't want it.

```
cp .env.example .env
# fill in .env, set WAYSTATION_DATA_DIR to wherever you want the DB and files stored
npm install
npm start
```

`npm start` runs `node --env-file-if-exists=.env .`, so `.env` is loaded natively without
needing `dotenv`. Everything else — the instance-ID/storage-readiness flow, GC, logging —
behaves identically to the Docker setup below; you're just responsible for what Docker
otherwise provided (reverse proxy/TLS, process supervision/restart-on-boot, the healthcheck
endpoint at `/`).

> [!WARNING]
> Use an absolute path for `WAYSTATION_DATA_DIR` in any real deployment. A relative path
> resolves against the process's working directory at startup, not against `.env` or the
> repo — fine for local dev where you always run from the repo root, but easy to get wrong
> under a process manager (e.g. a systemd unit with a different `WorkingDirectory`), which
> would silently read/write data from the wrong place.

This is also part of why no prebuilt Docker image is published: building one yourself with
`docker compose build` (or running the app directly, as above) is easy enough that a
published image isn't worth maintaining.

## Running with Docker

### First-time setup (one-time, per storage volume)

Waystation ties its database and files to a unique instance ID stored alongside them.
This lets it detect a wrong or swapped storage volume before touching it.

> [!NOTE]
> The very first time you start it against a new volume, it won't come up straight away.
> This is expected, not a bug — here's exactly what happens:

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

### Deploying against an NFS-mounted NAS

For off-VPS storage (e.g. a NAS reachable over your private network), use the
`docker-compose.nfs.yml` override, which has Docker mount the export directly as a named
volume:

```
docker compose -f docker-compose.yml -f docker-compose.nfs.yml up -d
```

> [!WARNING]
> Don't rely on a host-level `mount -t nfs` + bind mount instead — a bind mount to a path
> that isn't actually mounted yet silently creates an empty local directory instead of
> failing loudly, and host-level NFS mount timing can race the container start.

Set `WAYSTATION_NFS_SERVER` (the NAS address) and `WAYSTATION_NFS_EXPORT` (the export
path, e.g. `/volume1/waystation`) in `.env` — see `.env.example`. `WAYSTATION_DATA_DIR` is
ignored when using this override. If writes fail with permission errors, check the NAS
export's squash setting (`no_root_squash`, or map `anonuid`/`anongid` to the container's
UID 1001).

To avoid passing both `-f` flags on every invocation, set `COMPOSE_FILE=docker-compose.yml:docker-compose.nfs.yml`
in `.env` (see `.env.example`) — Compose reads that automatically, so plain `docker compose
up -d` picks up the override.

> [!CAUTION]
> Docker only applies a named volume's `driver_opts` (the NFS settings) when the volume is
> first created — if you already brought the stack up once with just the base
> `docker-compose.yml` (or before setting the NFS env vars), a plain local volume named
> `waystation_waystation-data` will already exist and silently shadow the NFS config. Check
> with `docker volume inspect waystation_waystation-data` (look for `"Driver": "local"` with
> NFS options under `"Options"`); if it's missing, `docker compose down`, `docker volume rm
> waystation_waystation-data` (**this deletes whatever's currently in it**), then bring the
> stack back up to recreate it against the NAS.

### Configuration

`.env.example` documents all supported environment variables (`WAYSTATION_DATA_DIR`,
`WAYSTATION_PUBLIC_URL`, `WAYSTATION_LOG_LEVEL`, etc.) beyond the instance ID above.

Set `WAYSTATION_UPLOAD_TOKEN` to require an `Authorization: Bearer <token>` header on
`POST /upload`. `GET /download/:token` is unaffected either way; those links are meant to
be shared and rely on the token being unguessable, not on this.

`WAYSTATION_MAX_UPLOAD_SIZE_MB` caps how large a single upload can be (default 10 GiB) —
oversized uploads are rejected with `413` before consuming unbounded disk space.

> [!IMPORTANT]
> If `WAYSTATION_UPLOAD_TOKEN` is unset, uploads are unauthenticated — anyone who can reach
> the server can upload files. The server logs a warning at startup as a reminder. Always
> set this for anything but local dev.
>
> If `WAYSTATION_PUBLIC_URL` is unset, download links are built from the request's `Host`
> header — a header a client controls. The server logs a startup warning as a reminder;
> always set this in production.

### Logs

```
docker compose logs -f
```

Logs are also written to `waystation.log` inside the storage volume (`WAYSTATION_DATA_DIR`
on the host), rotated at 10MB via `pino-roll`. Useful if the container isn't running (crash
loop, already exited) or you need history beyond what `docker compose logs` retains — just
read the file directly from the host path you configured for `WAYSTATION_DATA_DIR`.

## API

[`openapi.yaml`](openapi.yaml) documents the HTTP API (OpenAPI 3.1) — paste it into
[Swagger Editor](https://editor.swagger.io) or any OpenAPI viewer to browse it interactively.

The Thunderbird FileLink integration itself lives in a separate add-on repo:
[tb-waystation-addon](https://github.com/maximilian-schwaerzler/tb-waystation-addon).

The API is otherwise general-purpose — the OpenAPI spec is enough to build your own client
against it (any language with an OpenAPI/Swagger codegen tool can generate one), so feel
free to write your own instead of using the Thunderbird add-on or this README's `curl`
examples.

## A note on AI assistance

This project was developed with the help of AI tools, visible in the commit history — but it was not
"vibe coded." AI was used as a tool, not a substitute for understanding: every change was reviewed and
understood by the author before being committed.