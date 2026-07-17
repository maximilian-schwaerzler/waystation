import http from "http";
import {initDb} from "./lib/db.js";
import path from "path";

const db = initDb(path.resolve(__dirname, "./data"))

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Hello, World!");
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});