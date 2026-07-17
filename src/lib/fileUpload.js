import {createWriteStream, mkdirSync} from "fs";
import path from "path";
import {dataDir} from "./config.js";

const UPLOADS_DIRNAME = "files";

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
export function handleFileUpload(req, res) {
    if (req.headers['content-type'] !== 'application/octet-stream') {
        res.writeHead(415, {'Content-Type': 'text/plain'});
        return res.end('Expected binary upload (Content-Type: application/octet-stream)');
    }

    const {searchParams} = new URL(req.url, 'http://localhost');
    const filename = searchParams.get('filename');

    if (!filename) {
        res.writeHead(400, {'Content-Type': 'text/plain'});
        return res.end('Missing filename query parameter');
    }

    // Strip any directory components so `filename` can't escape the uploads
    // dir via path traversal (e.g. `../../etc/cron.d/x`). Will be replaced by
    // a generated UUID later, at which point this becomes moot.
    const safeFilename = path.basename(filename);
    if (!safeFilename || safeFilename === '.' || safeFilename === '..') {
        res.writeHead(400, {'Content-Type': 'text/plain'});
        return res.end('Invalid filename');
    }

    const uploadsDir = path.join(dataDir, UPLOADS_DIRNAME);
    mkdirSync(uploadsDir, {recursive: true});

    const filePath = path.join(uploadsDir, safeFilename);
    const writeStream = createWriteStream(filePath);

    req.on('error', (err) => {
        console.error(`Upload request error: ${err.message}`);
        writeStream.destroy();
    });

    writeStream.on('error', (err) => {
        console.error(`Upload write failed: ${err.message}`);
        if (!res.headersSent) {
            res.writeHead(500, {'Content-Type': 'text/plain'});
            res.end('Upload failed');
        }
    });

    writeStream.on('finish', () => {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('Upload complete');
    });

    req.pipe(writeStream);
}