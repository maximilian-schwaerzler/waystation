import {createReadStream, statSync} from "fs";
import path from "path";
import {dataDir} from "./config.js";
import {getDb} from "./db.js";
import {getLogger} from "./logger.js";

/**
 * Builds a Content-Disposition header value, including both a sanitized
 * ASCII fallback and an RFC 5987 encoded form for non-ASCII filenames.
 * @param {string} filename
 */
function contentDispositionHeader(filename) {
    const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");
    const encoded = encodeURIComponent(filename);
    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {string} token
 */
export function handleFileDownload(req, res, token) {
    if (!token) {
        // Schema enforces CHECK (length(token) > 0), so an empty token can
        // never match a row — skip the DB round-trip entirely.
        res.writeHead(404, {'Content-Type': 'text/plain'});
        return res.end('Not found');
    }

    const row = getDb().prepare(`
        SELECT original_name, storage_path, expires_at
        FROM files WHERE token = ?
    `).get(token);

    if (!row) {
        res.writeHead(404, {'Content-Type': 'text/plain'});
        return res.end('Not found');
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
        res.writeHead(410, {'Content-Type': 'text/plain'});
        return res.end('This link has expired');
    }

    const filePath = path.join(dataDir, row.storage_path);

    let stat;
    try {
        stat = statSync(filePath);
    } catch (err) {
        getLogger().error(`Download failed, file missing on disk for token ${token}: ${err.message}`);
        res.writeHead(404, {'Content-Type': 'text/plain'});
        return res.end('Not found');
    }

    const disposition = contentDispositionHeader(row.original_name);
    const range = req.headers.range;

    if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || (!match[1] && !match[2])) {
            res.writeHead(416, {'Content-Range': `bytes */${stat.size}`});
            return res.end();
        }

        let start = match[1] ? parseInt(match[1], 10) : undefined;
        let end = match[2] ? parseInt(match[2], 10) : undefined;

        if (start === undefined) {
            // suffix range, e.g. `bytes=-500` for the last 500 bytes
            start = Math.max(stat.size - end, 0);
            end = stat.size - 1;
        } else if (end === undefined || end >= stat.size) {
            end = stat.size - 1;
        }

        if (start > end || start >= stat.size) {
            res.writeHead(416, {'Content-Range': `bytes */${stat.size}`});
            return res.end();
        }

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
            'Content-Disposition': disposition,
        });

        createReadStream(filePath, {start, end}).pipe(res);
        return;
    }

    res.writeHead(200, {
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': disposition,
    });

    createReadStream(filePath).pipe(res);
}