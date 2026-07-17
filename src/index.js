import http from "http";
import {handleFileUpload} from "./lib/fileUpload.js";
import {handleFileDownload} from "./lib/fileDownload.js";
import {ensureDataDirReady} from "./lib/dataStorage.js";
import {getDb} from "./lib/db.js";
import {startGc} from "./lib/gc.js";
import {getLogger} from "./lib/logger.js";
import {port} from "./lib/config.js";

await ensureDataDirReady();
getDb();
startGc();

const server = http.createServer((req, res) => {
  const {pathname} = new URL(req.url, `http://localhost:${port}`);

  getLogger().debug(`${req.method} request on path '${pathname}'`);

  if (pathname === '/') {
    res.writeHead(200);
    return res.end('healthy');
  }

  if (req.method === 'POST' && pathname === '/upload') {
    return handleFileUpload(req, res);
  }

  if (req.method === 'GET' && pathname.startsWith('/download/')) {
    const token = pathname.slice('/download/'.length);
    return handleFileDownload(req, res, token);
  }

  res.writeHead(404, {'Content-Type': 'text/plain'});
  res.end('Not found');
});

server.listen(port, () => {
  getLogger().info(`Server running on http://localhost:${port}`);
});