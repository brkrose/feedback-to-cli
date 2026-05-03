import { createServer as createHttpServer } from "node:http";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export function createServer(cwd) {
  return createHttpServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/ping") {
      res.writeHead(200, { ...CORS, "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, CORS);
    res.end();
  });
}
