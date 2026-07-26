import {unlink} from "fs/promises";
import path from "path";
import {dataDir} from "./config.js";
import {getDb} from "./db.js";

/**
 * Deletes a file's blob from disk and removes its DB row. If the blob is
 * already missing (ENOENT) the row is still removed, since there's nothing
 * left to clean up. Any other filesystem error leaves the row intact (so a
 * retry doesn't lose track of a file that still exists on disk) and is
 * rethrown for the caller to handle/log.
 * @param {number} id
 * @param {string} storagePath
 */
export async function deleteFile(id, storagePath) {
    try {
        await unlink(path.join(dataDir, storagePath));
    } catch (err) {
        if (err.code !== 'ENOENT') {
            throw err;
        }
        // ENOENT: file's already gone, fine to remove the row below
    }

    getDb().prepare(`DELETE FROM files WHERE id = ?`).run(id);
}