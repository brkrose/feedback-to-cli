import { createServer as createHttpServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { slugForPath, upsertPin, deletePin, composeMarkdown } from "./core.js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const DIR = ".feedback-to-cli";

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function loadPins(cwd, slug) {
  const path = join(cwd, DIR, `${slug}.json`);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}

function writePins(cwd, slug, page, pins) {
  const dir = join(cwd, DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${slug}.json`), JSON.stringify(pins, null, 2));
  writeFileSync(join(dir, `${slug}.md`), composeMarkdown(page, pins));
}

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

    if (req.method === "POST" && req.url === "/pin") {
      try {
        const { page, pin } = await readBody(req);
        const slug = slugForPath(page);
        const pins = loadPins(cwd, slug);
        const next = pin.note === null ? deletePin(pins, pin.id) : upsertPin(pins, pin);
        writePins(cwd, slug, page, next);
        res.writeHead(200, { ...CORS, "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, count: next.length }));
      } catch (err) {
        res.writeHead(400, CORS);
        res.end(String(err.message ?? err));
      }
      return;
    }

    res.writeHead(404, CORS);
    res.end();
  });
}
