import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../src/server.js";

let server, baseUrl, cwd;

beforeEach(async () => {
  cwd = mkdtempSync(join(tmpdir(), "f2c-"));
  server = createServer(cwd);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(cwd, { recursive: true, force: true });
});

describe("GET /ping", () => {
  it("returns 200 with ok:true", async () => {
    const res = await fetch(`${baseUrl}/ping`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
  it("includes CORS header", async () => {
    const res = await fetch(`${baseUrl}/ping`);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
