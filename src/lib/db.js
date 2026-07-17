import path from "path";
import Database from "better-sqlite3";
import {DB_TABLE_SETUP_SQL, dataDir} from "./config.js";

let db = null;

/**
 * Returns the shared db connection, opening it on first call. Storage must
 * already be verified ready (see ensureDataDirReady()) before this is first
 * called, since it does filesystem I/O against dataDir.
 * @returns {import('better-sqlite3').Database}
 */
export function getDb() {
    if (!db) {
        db = new Database(path.join(dataDir, 'waystation.db'));
        db.pragma('journal_mode = WAL'); // better concurrent read/write behavior
        db.exec(DB_TABLE_SETUP_SQL);
    }
    return db;
}