import path from "path";
import Database from "better-sqlite3";
import {DB_TABLE_SETUP_SQL, dataDir} from "./config.js";

export function initDb() {
    const db = new Database(path.join(dataDir, 'waystation.db'));
    db.pragma('journal_mode = WAL'); // better concurrent read/write behavior

    db.exec(DB_TABLE_SETUP_SQL);

    return db;
}