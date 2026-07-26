import {getDb} from "./db.js";
import {deleteFile} from "./fileRemoval.js";
import {getLogger} from "./logger.js";

/**
 * Handles deletion of an uploaded file, for Thunderbird's cloudFile
 * onFileDeleted event (fired when the user removes the attachment before
 * sending, or deletes it from the FileLink management UI afterward).
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {string} token
 */
export async function handleFileDelete(req, res, token) {
    if (!token) {
        // Schema enforces CHECK (length(token) > 0), so an empty token can
        // never match a row — skip the DB round-trip entirely.
        res.writeHead(404, {'Content-Type': 'text/plain'});
        return res.end('Not found');
    }

    const row = getDb().prepare(`SELECT id, storage_path FROM files WHERE token = ?`).get(token);

    if (!row) {
        res.writeHead(404, {'Content-Type': 'text/plain'});
        return res.end('Not found');
    }

    try {
        await deleteFile(row.id, row.storage_path);
    } catch (err) {
        getLogger().error(`Delete failed for file id ${row.id}: ${err.code}`);
        res.writeHead(500, {'Content-Type': 'text/plain'});
        return res.end('Delete failed');
    }

    res.writeHead(204);
    res.end();
}