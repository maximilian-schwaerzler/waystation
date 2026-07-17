# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Architecture decisions below are settled.** Do not re-litigate the storage abstraction, the instance-ID flow,
SQLite vs. flat-file, or other decisions made below unless the user explicitly says they want to reconsider one.
Use the Implementation Checklist to track what's done and what's next — keep it updated as work progresses.

## Naming

Project name: **Waystation**. Previously called "FileLink Backend" internally — that name is retired. "FileLink"
refers only to Thunderbird's own client-side attachment-upload feature (which this backend serves), never to this
project. Use `waystation` / `WAYSTATION_*` for repo, package, Docker image, and env var prefixes (e.g.
`WAYSTATION_INSTANCE_ID`, `WAYSTATION_DATA_DIR`) — not `filelink` / `FILELINK_*`.

## Goal

A self-hostable Thunderbird FileLink service. Thunderbird uploads attachments over HTTP to a Docker-hosted
backend; the backend streams the file to storage and returns a download link; a recipient later fetches the file
over HTTP. An optional manual web upload UI may be added later for general-purpose use beyond Thunderbird.

**Deployment target:** Hetzner VPS (Docker/Traefik v3), with a Synology NAS (DS223j) as the storage backend,
connected via Tailscale.

## Stack

- Node.js, ESM (`"type": "module"` in package.json), single container, single process — entry point
  `src/index.js`, raw `http` module, no web framework.
- `better-sqlite3` for storage (`src/lib/db.js`), `node-cron` for scheduled GC, `pino`/`pino-roll` for logging,
  `uuid` for tokens.

## Storage abstraction

The app only does filesystem I/O against one path (`/data`). Whether `/data` is local disk or a network mount
(NFS/SMB over Tailscale to the NAS) is a host-level decision via a configurable bind mount
(`${WAYSTATION_DATA_DIR:-./data}:/data`) — container code never knows or cares whether it's local or networked
storage.

## Instance ID & storage-readiness flow

Uses presence/absence of `WAYSTATION_INSTANCE_ID` itself as the state discriminator — no separate init flag
needed. Sentinel file: `/data/.waystation-instance-id`.

1. **Env var unset, sentinel absent** → true first run. Generate a UUID, write it to the sentinel file, print it
   with instructions to set `WAYSTATION_INSTANCE_ID` in `.env`, exit(0).
2. **Env var unset, sentinel present** → storage already initialized, user hasn't set the var yet. Print the
   existing ID from the file, same instructions, exit(0).
3. **Env var set, sentinel absent** → ambiguous (mount not ready yet, OR user mistakenly pre-set their own ID on a
   real first run). Poll with bounded retries/timeout (e.g. 2s × 30 attempts). If sentinel appears, proceed to
   verification. If timeout expires, hard fail with a message covering both possibilities.
4. **Env var set, sentinel present** → normal steady state. Compare values; match → proceed, log "storage
   verified"; mismatch → hard fail (wrong volume mounted).

No auto-generation shortcuts, no ID format validation (any non-empty string is valid) — in practice the ID always
originates from the app's own generated UUID, since the documented flow has the user copy it rather than invent
one.

No Docker restart policy (`restart: "no"` or omitted) — so init/error exits stay visible instead of looping.

## Database

SQLite (`better-sqlite3`), single file inside `/data` next to the file blobs — DB and files always travel/mount
together, covered by the same readiness check. One table (`files`, see `src/lib/constants.js`): id, token
(unique), original_name, storage_path, content_hash, size_bytes, uploaded_at, expires_at. Chosen over a flat file
for safe concurrent writes, indexed token lookups, and simple SQL expiry queries.

## Streaming

Uploads and downloads pipe bytes directly between HTTP request/response and filesystem streams
(`fs.createReadStream`/`createWriteStream`/`.pipe()`) — no full in-memory buffering.

## Garbage collection

In-process scheduled function (`node-cron`, e.g. hourly) — not a separate container, since it shares the same DB,
storage mount, and instance ID as the main app. Queries DB for expired rows, deletes files, removes rows;
async/non-blocking. Failed file deletions leave the DB row intact for retry next run. Must not run until the
storage-readiness check has passed.

## Logging

`pino`, dual destination: always to stdout (`docker compose logs`), and additionally appended to
`/data/waystation.log` once storage is confirmed ready (can't write there before that). Needs basic size-based
rotation (`pino-roll`). Log levels: lifecycle events (startup, GC runs, errors) at `info`; per-request detail at
`debug` only when troubleshooting.

## Security

Download tokens must be unguessable (UUIDv4 or equivalent), never sequential IDs.

## Open / undecided

- Thunderbird FileLink provider type: generic WebDAV-style vs. custom REST provider — not yet decided.
- Upload endpoint authentication scheme for Thunderbird — TBD, depends on above.
- Optional manual web UI for general-purpose uploads — stretch goal, not started.
- Resumable/chunked uploads for very large attachments — stretch goal.
- Multi-instance scaling — explicitly out of scope for now (single instance assumed).

## Commands

- `npm start` — run with `node .`
- `npm run dev` — run with `nodemon .` (auto-restart)
- `npm run lint` — ESLint (flat config in `eslint.config.js`)
- `npm test` is a stub (`exit 1`) — no test suite exists yet.

## Implementation Checklist

**Foundation**
- [ ] Node.js project scaffolding (package.json, entrypoint, Dockerfile)
- [ ] Docker Compose with configurable WAYSTATION_DATA_DIR bind mount
- [ ] restart: "no" (or omitted) in compose
- [ ] Implement the 4-state instance-ID / storage-readiness flow
- [ ] SQLite schema (file ID/token, filename, path/hash, upload timestamp, expiry)
- [ ] pino logging setup (stdout + /data/waystation.log post-readiness, rotation, levels)

**Upload path**
- [ ] Streaming upload endpoint to /data
- [ ] Hashed/random storage filename; original filename preserved in DB
- [ ] Unguessable download token (UUIDv4) per file
- [ ] Return download URL to client
- [ ] Upload endpoint authentication (TBD scheme)

**Download path**
- [ ] Streaming download endpoint from /data
- [ ] Content-Disposition header with original filename
- [ ] Content-Length header
- [ ] HTTP Range request support

**Thunderbird FileLink protocol**
- [ ] Decide provider type (WebDAV-style vs. custom REST)
- [ ] Implement upload/auth contract
- [ ] End-to-end test with real Thunderbird client

**Garbage collection**
- [ ] node-cron scheduled job (hourly) in main process
- [ ] Query + delete expired files/rows, async/non-blocking
- [ ] Retry-safe: leave DB row on failed file deletion
- [ ] Guard: don't run until storage-readiness check passed

**Documentation**
- [ ] README: first-time setup flow
- [ ] README: how to read logs (docker compose logs + /data/waystation.log fallback)
- [ ] .env.example documenting WAYSTATION_INSTANCE_ID and WAYSTATION_DATA_DIR

**Optional / stretch**
- [ ] Manual web upload UI
- [ ] Resumable/chunked uploads
- [ ] Multi-instance scaling (out of scope for now)