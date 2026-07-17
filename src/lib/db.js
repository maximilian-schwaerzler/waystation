import path from "path"
import Database from "better-sqlite3";
import {DB_TABLE_SETUP_SQL} from "./constants.js";

function initDb(dataDir) {
    const db = Database(path.join(dataDir, 'waystation.db'));
    db.pragma('journal_mode = WAL'); // better concurrent read/write behavior

    db.exec(DB_TABLE_SETUP_SQL);

    return db;
}

module.exports = {initDb};