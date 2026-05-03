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
  it("echoes a localhost Origin in the CORS header", async () => {
    const res = await fetch(`${baseUrl}/ping`, {
      headers: { origin: "http://localhost:3000" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000"
    );
  });
  it("does not return CORS headers for hostile origins", async () => {
    const res = await fetch(`${baseUrl}/ping`, {
      headers: { origin: "https://evil.example.com" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("allows requests with no Origin (e.g. curl, devtools)", async () => {
    const res = await fetch(`${baseUrl}/ping`);
    expect(res.status).toBe(200);
  });
});

describe("origin allowlist", () => {
  it("rejects /pin from a hostile origin with 403", async () => {
    const pin = { id: "p1", target: "<h1>", note: "x", ts: 1, x: 0, y: 0 };
    const res = await fetch(`${baseUrl}/pin`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example.com",
      },
      body: JSON.stringify({ page: "/home", pin }),
    });
    expect(res.status).toBe(403);
    expect(existsSync(join(cwd, ".feedback-to-cli", "home.json"))).toBe(false);
  });

  it("rejects /clear from a hostile origin with 403", async () => {
    const res = await fetch(`${baseUrl}/clear`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example.com",
      },
      body: JSON.stringify({ page: "/home" }),
    });
    expect(res.status).toBe(403);
  });

  it("accepts /pin from http://localhost:5173", async () => {
    const pin = { id: "p1", target: "<h1>", note: "x", ts: 1, x: 0, y: 0 };
    const res = await fetch(`${baseUrl}/pin`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:5173",
      },
      body: JSON.stringify({ page: "/home", pin }),
    });
    expect(res.status).toBe(200);
  });

  it("accepts /pin from http://127.0.0.1:3000", async () => {
    const pin = { id: "p1", target: "<h1>", note: "x", ts: 1, x: 0, y: 0 };
    const res = await fetch(`${baseUrl}/pin`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:3000",
      },
      body: JSON.stringify({ page: "/home", pin }),
    });
    expect(res.status).toBe(200);
  });

  it("accepts /pin from http://[::1]:3000", async () => {
    const pin = { id: "p1", target: "<h1>", note: "x", ts: 1, x: 0, y: 0 };
    const res = await fetch(`${baseUrl}/pin`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://[::1]:3000",
      },
      body: JSON.stringify({ page: "/home", pin }),
    });
    expect(res.status).toBe(200);
  });

  it("accepts /pin with no Origin header", async () => {
    const pin = { id: "p1", target: "<h1>", note: "x", ts: 1, x: 0, y: 0 };
    const res = await fetch(`${baseUrl}/pin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page: "/home", pin }),
    });
    expect(res.status).toBe(200);
  });

  it("accepts https://localhost (some dev servers use TLS)", async () => {
    const res = await fetch(`${baseUrl}/pin`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://localhost:3000",
      },
      body: JSON.stringify({ page: "/home", pin: { id: "p1", target: "x", note: "x", ts: 1, x: 0, y: 0 } }),
    });
    expect(res.status).toBe(200);
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
    expect(md).toContain("tighten");
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
    expect(md).toContain("second");
    expect(md).not.toContain("first");
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

describe("body size limits", () => {
  it("rejects /pin bodies larger than 64 KB with 413", async () => {
    const huge = "x".repeat(70 * 1024);
    const pin = { id: "p1", target: "<h1>", note: huge, ts: 1, x: 0, y: 0 };
    const res = await fetch(`${baseUrl}/pin`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({ page: "/home", pin }),
    });
    expect(res.status).toBe(413);
    expect(existsSync(join(cwd, ".feedback-to-cli", "home.json"))).toBe(false);
  });

  it("rejects /clear bodies larger than 64 KB with 413", async () => {
    const huge = "/" + "a".repeat(70 * 1024);
    const res = await fetch(`${baseUrl}/clear`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({ page: huge }),
    });
    expect(res.status).toBe(413);
  });
});

describe("POST /clear", () => {
  it("removes md and json for the given page", async () => {
    const pin = { id: "p1", target: "<h1>", note: "x", ts: 1, x: 0, y: 0 };
    await fetch(`${baseUrl}/pin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page: "/home", pin }) });
    expect(existsSync(join(cwd, ".feedback-to-cli", "home.md"))).toBe(true);
    const res = await fetch(`${baseUrl}/clear`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page: "/home" }),
    });
    expect(res.status).toBe(200);
    expect(existsSync(join(cwd, ".feedback-to-cli", "home.md"))).toBe(false);
    expect(existsSync(join(cwd, ".feedback-to-cli", "home.json"))).toBe(false);
  });
  it("is a no-op when files don't exist", async () => {
    const res = await fetch(`${baseUrl}/clear`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page: "/never-saved" }),
    });
    expect(res.status).toBe(200);
  });
});
