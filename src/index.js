import http from "http";
import {handleFileUpload} from "./lib/fileUpload.js";
import {ensureDataDirReady} from "./lib/dataStorage.js";
import {getDb} from "./lib/db.js";

const PORT = process.env.PORT || 3000;

await ensureDataDirReady();
getDb();

const server = http.createServer((req, res) => {
  const {pathname} = new URL(req.url, `http://localhost:${PORT}`);

  console.log(`${req.method} request on path '${pathname}'`);

  if (pathname === '/') {
    res.writeHead(200);
    return res.end('healthy');
  }

  if (req.method === 'POST' && pathname === '/upload') {
    return handleFileUpload(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});