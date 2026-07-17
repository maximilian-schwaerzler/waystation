import http from "http";
import {initDb} from "./lib/db.js";

const PORT = 3000;

const db = initDb(process.env.DATA_DIR || "/data");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Hello, World!");
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});