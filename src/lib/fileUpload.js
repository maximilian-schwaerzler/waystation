import {createWriteStream, mkdirSync} from "fs";
import {unlink} from "fs/promises";
import {createHash} from "crypto";
import path from "path";
import {v4 as uuidv4} from "uuid";
import {dataDir, uploadExpiryDays, resolvePublicOrigin} from "./config.js";
import {getDb} from "./db.js";
import {getLogger} from "./logger.js";

const UPLOADS_DIRNAME = "files";

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
export function handleFileUpload(req, res) {

    const {searchParams} = new URL(req.url, 'http://localhost');
    const filename = searchParams.get('filename');

    if (!filename) {
        res.writeHead(400, {'Content-Type': 'text/plain'});
        return res.end('Missing filename query parameter');
    }

    // Strip any directory components so `filename` can't be used for path
    // traversal (e.g. `../../etc/cron.d/x`) when preserved as original_name.
    const originalName = path.basename(filename);
    if (!originalName || originalName === '.' || originalName === '..') {
        res.writeHead(400, {'Content-Type': 'text/plain'});
        return res.end('Invalid filename');
    }

    const uploadsDir = path.join(dataDir, UPLOADS_DIRNAME);
    mkdirSync(uploadsDir, {recursive: true});

    // Stored under a random name, decoupled from the (attacker-controlled)
    // original filename. storage_path is relative to dataDir.
    const storageFilename = uuidv4();
    const storagePath = path.join(UPLOADS_DIRNAME, storageFilename);
    const writeStream = createWriteStream(path.join(dataDir, storagePath));

    const hash = createHash('sha256');
    req.on('data', (chunk) => hash.update(chunk));

    req.on('error', (err) => {
        getLogger().error(`Upload request error: ${err.message}`);
        writeStream.destroy();
    });

    writeStream.on('error', (err) => {
        getLogger().error(`Upload write failed: ${err.message}`);
        if (!res.headersSent) {
            res.writeHead(500, {'Content-Type': 'text/plain'});
            res.end('Upload failed');
        }
    });

    writeStream.on('finish', async () => {
        const token = uuidv4();
        const expiresAt = new Date(Date.now() + uploadExpiryDays * 24 * 60 * 60 * 1000).toISOString();

        try {
            getDb().prepare(`
                INSERT INTO files (token, original_name, storage_path, content_hash, size_bytes, expires_at)
                VALUES (@token, @originalName, @storagePath, @contentHash, @sizeBytes, @expiresAt)
            `).run({
                token,
                originalName,
                storagePath,
                contentHash: hash.digest('hex'),
                sizeBytes: writeStream.bytesWritten,
                expiresAt,
            });
        } catch (err) {
            getLogger().error(`Failed to persist upload record: ${err.message}`);
            await unlink(path.join(dataDir, storagePath)).catch(() => {});
            if (!res.headersSent) {
                res.writeHead(500, {'Content-Type': 'text/plain'});
                res.end('Upload failed');
            }
            return;
        }

        const downloadUrl = `${resolvePublicOrigin(req)}/download/${token}`;

        res.writeHead(201, {'Content-Type': 'application/json', 'Location': downloadUrl});
        res.end(JSON.stringify({
            token,
            downloadUrl,
            expiresAt,
        }));
    });

    req.pipe(writeStream);
}