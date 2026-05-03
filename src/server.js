import { createServer as createHttpServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { slugForPath, upsertPin, deletePin, composeMarkdown } from "./core.js";

const ALLOWED_ORIGIN_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname === "::1" ? "[::1]" : url.hostname;
    return ALLOWED_ORIGIN_HOSTS.has(host);
  } catch {
    return false;
  }
}

function corsHeaders(origin) {
  const headers = {
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  };
  if (origin && isAllowedOrigin(origin)) {
    headers["access-control-allow-origin"] = origin;
  }
  return headers;
}

const DIR = ".feedback-to-cli";
const MAX_BODY_BYTES = 64 * 1024;

class PayloadTooLargeError extends Error {
  constructor() {
    super("payload too large");
    this.code = "PAYLOAD_TOO_LARGE";
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on("data", (c) => {
      if (aborted) return;
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        reject(new PayloadTooLargeError());
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (aborted) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", (err) => {
      if (!aborted) reject(err);
    });
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
    const origin = req.headers.origin;
    const cors = corsHeaders(origin);

    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/ping") {
      res.writeHead(200, { ...cors, "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    const isMutation =
      req.method === "POST" && (req.url === "/pin" || req.url === "/clear");
    if (isMutation && !isAllowedOrigin(origin)) {
      res.writeHead(403, cors);
      res.end("origin not allowed");
      return;
    }

    if (req.method === "POST" && req.url === "/pin") {
      try {
        const { page, pin } = await readBody(req);
        const slug = slugForPath(page);
        const pins = loadPins(cwd, slug);
        const next = pin.note === null ? deletePin(pins, pin.id) : upsertPin(pins, pin);
        writePins(cwd, slug, page, next);
        res.writeHead(200, { ...cors, "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, count: next.length }));
      } catch (err) {
        const status = err instanceof PayloadTooLargeError ? 413 : 400;
        res.writeHead(status, cors);
        res.end(String(err.message ?? err));
      }
      return;
    }

    if (req.method === "POST" && req.url === "/clear") {
      try {
        const { page } = await readBody(req);
        const slug = slugForPath(page);
        const dir = join(cwd, DIR);
        for (const ext of ["md", "json"]) {
          const p = join(dir, `${slug}.${ext}`);
          if (existsSync(p)) unlinkSync(p);
        }
        res.writeHead(200, { ...cors, "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        const status = err instanceof PayloadTooLargeError ? 413 : 400;
        res.writeHead(status, cors);
        res.end(String(err.message ?? err));
      }
      return;
    }

    res.writeHead(404, cors);
    res.end();
  });
}
