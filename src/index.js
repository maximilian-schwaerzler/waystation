import http from "http";
import {handleFileUpload} from "./lib/fileUpload.js";
import {ensureDataDirReady} from "./lib/dataStorage.js";
import {getDb} from "./lib/db.js";
import {getLogger} from "./lib/logger.js";
import {port} from "./lib/config.js";

await ensureDataDirReady();
getDb();

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
});

server.listen(port, () => {
  getLogger().info(`Server running on http://localhost:${port}`);
});