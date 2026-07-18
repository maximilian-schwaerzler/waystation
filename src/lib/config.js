export const dataDir = process.env.DATA_DIR || "/waystation-data";

export const INSTANCE_ID_FILENAME = ".waystation_instance_id";

export const uploadExpiryDays = Number(process.env.WAYSTATION_UPLOAD_EXPIRY_DAYS) || 7;

export const port = process.env.WAYSTATION_PORT || 3000;

// Bearer token required on POST /upload requests. If unset, uploads are
// unauthenticated — anyone who can reach the server can upload.
export const uploadAuthToken = process.env.WAYSTATION_UPLOAD_TOKEN || null;

// Full base URL (e.g. https://files.example.com) used to build links returned
// to clients, for deployments behind a proxy where the outbound hostname
// differs from what Node itself binds to. Falls back to the request's Host
// header when unset, which is fine for local dev but not guaranteed correct
// behind a proxy.
export const publicUrl = process.env.WAYSTATION_PUBLIC_URL?.replace(/\/$/, '') || null;

/**
 * @param {import('http').IncomingMessage} req
 * @returns {string} origin (protocol + host, no trailing slash) to build public-facing links from
 */
export function resolvePublicOrigin(req) {
    // noinspection HttpUrlsUsage
    return publicUrl || `http://${req.headers.host}`;
}

export const DB_TABLE_SETUP_SQL = `
    CREATE TABLE IF NOT EXISTS files (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        token           TEXT NOT NULL UNIQUE,
        original_name   TEXT NOT NULL,
        storage_path    TEXT NOT NULL,
        content_hash    TEXT,
        size_bytes      INTEGER NOT NULL,
        uploaded_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        expires_at      TEXT NOT NULL,

        CHECK (length(token) > 0),
        CHECK (length(storage_path) > 0)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_files_token ON files(token);
    CREATE INDEX IF NOT EXISTS idx_files_expires_at ON files(expires_at);
    `;