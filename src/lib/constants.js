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

export const INSTANCE_ID_FILENAME = ".waystation_instance_id";