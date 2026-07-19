import http from "http";
import {handleFileUpload} from "./lib/fileUpload.js";
import {handleFileDownload} from "./lib/fileDownload.js";
import {isAuthorizedUpload} from "./lib/auth.js";
import {ensureDataDirReady} from "./lib/dataStorage.js";
import {getDb} from "./lib/db.js";
import {startGc} from "./lib/gc.js";
import {getLogger} from "./lib/logger.js";
import {port, uploadAuthToken} from "./lib/config.js";

const configuredWaystationVars = Object.keys(process.env).filter((key) => key.startsWith("WAYSTATION_"));
if (configuredWaystationVars.length === 0) {
  getLogger().warn(
    "No WAYSTATION_* environment variables are set. If this is unexpected, check that .env exists " +
    "(copy .env.example to .env) and that it's actually being loaded (e.g. run via `npm start`, which " +
    "passes --env-file-if-exists=.env)."
  );
}

await ensureDataDirReady();
getDb();
startGc();

if (!uploadAuthToken) {
  getLogger().warn(
    "WAYSTATION_UPLOAD_TOKEN is not set — /upload is unauthenticated. " +
    "Anyone who can reach this server can upload files. Set WAYSTATION_UPLOAD_TOKEN to require a bearer token."
  );
}

const server = http.createServer((req, res) => {
  const {pathname} = new URL(req.url, `http://localhost:${port}`);

  getLogger().debug(`${req.method} request on path '${pathname}'`);

  if (pathname === '/') {
    res.writeHead(200);
    return res.end('healthy');
  }

  if (req.method === 'POST' && pathname === '/upload') {
    if (!isAuthorizedUpload(req)) {
      res.writeHead(401, {'Content-Type': 'text/plain', 'WWW-Authenticate': 'Bearer'});
      return res.end('Unauthorized');
    }
    return handleFileUpload(req, res);
  }

  if (req.method === 'GET' && pathname.startsWith('/download/')) {
    const token = pathname.slice('/download/'.length);
    return handleFileDownload(req, res, token);
  }

  res.writeHead(404, {'Content-Type': 'text/plain'});
  res.end('Not found');
});

// Node's default (5 minutes) cuts off large uploads before the body finishes streaming in.
// Kept non-zero (rather than disabled) per Node's own docs, to still guard against
// slow-request DoS when this server is deployed without a reverse proxy in front.
server.requestTimeout = 30 * 60 * 1000; // 30 minutes

server.listen(port, () => {
  getLogger().info(`Server running on http://localhost:${port}`);
});