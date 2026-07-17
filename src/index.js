import http from "http";
import {initDb} from "./lib/db.js";
import {handleFileUpload} from "./lib/fileUpload.js";

const PORT = process.env.PORT || 3000;

// eslint-disable-next-line no-unused-vars -- not wired into routes yet
const db = initDb(process.env.DATA_DIR || "/data");

const server = http.createServer((req, res) => {
  const {pathname} = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'POST' && pathname === '/upload') {
    return handleFileUpload(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});