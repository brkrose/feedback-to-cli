import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
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

describe("POST /pin", () => {
  it("creates .feedback-to-cli/<slug>.md and .json", async () => {
    const pin = { id: "p1", target: "<h1> Hi", note: "tighten", ts: 1, x: 0, y: 0 };
    const res = await fetch(`${baseUrl}/pin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page: "/home", pin }),
    });
    expect(res.status).toBe(200);
    const md = readFileSync(join(cwd, ".feedback-to-cli", "home.md"), "utf8");
    expect(md).toContain("# Feedback on /home");
    expect(md).toContain("**Note:** tighten");
    const json = JSON.parse(readFileSync(join(cwd, ".feedback-to-cli", "home.json"), "utf8"));
    expect(json).toEqual([pin]);
  });

  it("upserts the same pin id without duplication", async () => {
    const a = { id: "p1", target: "<h1>", note: "first", ts: 1, x: 0, y: 0 };
    const aPrime = { ...a, note: "second" };
    await fetch(`${baseUrl}/pin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page: "/home", pin: a }) });
    await fetch(`${baseUrl}/pin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page: "/home", pin: aPrime }) });
    const json = JSON.parse(readFileSync(join(cwd, ".feedback-to-cli", "home.json"), "utf8"));
    expect(json).toEqual([aPrime]);
    const md = readFileSync(join(cwd, ".feedback-to-cli", "home.md"), "utf8");
    expect(md).toContain("**Note:** second");
    expect(md).not.toContain("**Note:** first");
  });

  it("deletes a pin when note === null", async () => {
    const a = { id: "p1", target: "<h1>", note: "x", ts: 1, x: 0, y: 0 };
    const b = { id: "p2", target: "<p>", note: "y", ts: 2, x: 0, y: 0 };
    await fetch(`${baseUrl}/pin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page: "/home", pin: a }) });
    await fetch(`${baseUrl}/pin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page: "/home", pin: b }) });
    await fetch(`${baseUrl}/pin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page: "/home", pin: { ...a, note: null } }) });
    const json = JSON.parse(readFileSync(join(cwd, ".feedback-to-cli", "home.json"), "utf8"));
    expect(json).toEqual([b]);
  });

  it("slugs nested paths", async () => {
    const pin = { id: "p1", target: "<h1>", note: "x", ts: 1, x: 0, y: 0 };
    await fetch(`${baseUrl}/pin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page: "/east-village/abc", pin }) });
    expect(existsSync(join(cwd, ".feedback-to-cli", "east-village_abc.md"))).toBe(true);
  });
});
