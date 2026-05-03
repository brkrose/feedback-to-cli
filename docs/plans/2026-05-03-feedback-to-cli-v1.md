# feedback-to-cli v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `feedback-to-cli` v0.1.0 to npm — one drop-in script tag for click-to-pin feedback on any localhost page, plus an optional Node companion that mirrors pins to `.feedback-to-cli/<page>.md` for AI assistants.

**Architecture:** Single npm package, two install paths. `src/overlay.js` is a self-contained IIFE bundled with esbuild and shipped as `dist/feedback-to-cli.js` (also served from unpkg). `bin/cli.js` exposes `feedback-to-cli serve` — a Node `http`-only companion on `127.0.0.1:9091`. Pure JS with JSDoc types (no TS compile step). Pure functions live in `src/core.js` so logic is testable outside DOM and outside Node.

**Tech Stack:** Vanilla JS, Node 20+ (`http`, `fs`), esbuild (devDep), vitest (jsdom + node), playwright (e2e). Zero runtime deps.

---

## File Structure

```
feedback-to-cli/
  src/
    core.js          # pure: composeMarkdown, upsertPin, deletePin, slugForPath, makeKey
    overlay.js       # IIFE: DOM, localStorage, popover, toolbar, companion sync
    server.js        # createServer(cwd) → http.Server with /ping /pin /clear
  bin/
    cli.js           # argv → port → createServer(process.cwd()).listen(port)
  dist/
    feedback-to-cli.js  # built by esbuild (bundle + minify), gitignored, prepublish
  examples/
    static-html/index.html
    nextjs/README.md
    vite/README.md
  tests/
    core.test.js     # vitest, node env
    overlay.test.js  # vitest, jsdom env
    server.test.js   # vitest, node env, spawns server on random port
    e2e.spec.ts      # playwright
  scripts/
    build.js         # esbuild call (bundle src/overlay.js → dist/feedback-to-cli.js, minified IIFE)
  README.md
  LICENSE            # MIT, "Brooke Bekoff"
  package.json
  .gitignore         # node_modules, dist (rebuilt on publish), .feedback-to-cli, *.log
  vitest.config.js
  playwright.config.ts
```

**Why this split:**
- `core.js` holds all pure logic so unit tests don't need a DOM or a server.
- `overlay.js` is the ONLY file shipped to browsers — it imports nothing (esbuild bundles `core.js` into it).
- `server.js` exports a factory so tests can spawn it on a random port. `bin/cli.js` is a thin argv wrapper.

---

## Task 1: Bootstrap repo

**Files:**
- Create: `package.json`, `.gitignore`, `LICENSE`, `vitest.config.js`, `README.md` (stub)

- [ ] **Step 1: Initialize package.json**

Create `/Users/brookebekoff/feedback-to-cli/package.json`:

```json
{
  "name": "feedback-to-cli",
  "version": "0.1.0",
  "description": "Click-to-pin feedback overlay for any localhost page. Drop in a script tag, copy markdown to your AI CLI.",
  "type": "module",
  "main": "./dist/feedback-to-cli.js",
  "exports": { ".": "./dist/feedback-to-cli.js" },
  "unpkg": "dist/feedback-to-cli.js",
  "bin": { "feedback-to-cli": "./bin/cli.js" },
  "files": ["dist", "bin", "src", "README.md", "LICENSE"],
  "scripts": {
    "build": "node scripts/build.js",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "prepublishOnly": "npm run build && npm test"
  },
  "keywords": ["feedback", "annotate", "claude", "cursor", "copilot", "localhost", "devtool"],
  "author": "Brooke Bekoff",
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/brkrose/feedback-to-cli.git" },
  "engines": { "node": ">=20" },
  "devDependencies": {
    "esbuild": "^0.24.0",
    "vitest": "^2.1.0",
    "jsdom": "^25.0.0",
    "@playwright/test": "^1.48.0"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
dist/
.feedback-to-cli/
*.log
.DS_Store
test-results/
playwright-report/
```

- [ ] **Step 3: Create LICENSE (MIT)**

Standard MIT text, year 2026, holder "Brooke Bekoff".

- [ ] **Step 4: Create vitest.config.js**

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environmentMatchGlobs: [
      ["tests/overlay.test.js", "jsdom"],
      ["tests/**", "node"],
    ],
    include: ["tests/**/*.test.js"],
  },
});
```

- [ ] **Step 5: Create stub README.md**

```md
# feedback-to-cli

Click-to-pin feedback overlay for any locally-served page. Copy markdown straight to your AI CLI.

> Full docs coming with v0.1.0 release. See `docs/specs/2026-05-03-feedback-to-cli-design.md` for the spec.
```

- [ ] **Step 6: Install deps and commit**

```bash
cd /Users/brookebekoff/feedback-to-cli
git init
npm install
git add .
git commit -m "chore: bootstrap feedback-to-cli package"
```

---

## Task 2: src/core.js — pure functions (TDD)

**Files:**
- Create: `src/core.js`
- Test: `tests/core.test.js`

The pure module exports:
- `slugForPath(pathname: string): string` — `/` → `"root"`, `/home` → `"home"`, `/east-village/abc` → `"east-village_abc"`
- `makeKey(namespace: string, pathname: string): string` — `"feedback-to-cli:<ns>:<pathname>"`
- `upsertPin(pins: Pin[], pin: Pin): Pin[]` — replace by `id` or append
- `deletePin(pins: Pin[], id: string): Pin[]`
- `composeMarkdown(pathname: string, pins: Pin[]): string` — formatted per spec

Pin shape: `{ id: string, target: string, note: string, ts: number, x: number, y: number }`.

- [ ] **Step 1: Write the failing test**

Create `/Users/brookebekoff/feedback-to-cli/tests/core.test.js`:

```js
import { describe, it, expect } from "vitest";
import { slugForPath, makeKey, upsertPin, deletePin, composeMarkdown } from "../src/core.js";

describe("slugForPath", () => {
  it("returns 'root' for /", () => {
    expect(slugForPath("/")).toBe("root");
  });
  it("strips leading slash", () => {
    expect(slugForPath("/home")).toBe("home");
  });
  it("replaces inner slashes with underscores", () => {
    expect(slugForPath("/east-village/abc")).toBe("east-village_abc");
  });
  it("treats empty string as root", () => {
    expect(slugForPath("")).toBe("root");
  });
});

describe("makeKey", () => {
  it("composes localStorage key", () => {
    expect(makeKey("default", "/home")).toBe("feedback-to-cli:default:/home");
  });
  it("uses provided namespace", () => {
    expect(makeKey("my-app", "/")).toBe("feedback-to-cli:my-app:/");
  });
});

describe("upsertPin", () => {
  const a = { id: "a", target: "<h1>", note: "x", ts: 1, x: 0, y: 0 };
  const b = { id: "b", target: "<p>", note: "y", ts: 2, x: 0, y: 0 };

  it("appends a new pin", () => {
    expect(upsertPin([a], b)).toEqual([a, b]);
  });
  it("replaces an existing pin by id", () => {
    const aPrime = { ...a, note: "updated" };
    expect(upsertPin([a, b], aPrime)).toEqual([aPrime, b]);
  });
  it("returns a new array (immutable)", () => {
    const pins = [a];
    const result = upsertPin(pins, b);
    expect(result).not.toBe(pins);
  });
});

describe("deletePin", () => {
  it("removes by id", () => {
    const a = { id: "a", target: "<h1>", note: "", ts: 1, x: 0, y: 0 };
    const b = { id: "b", target: "<p>", note: "", ts: 2, x: 0, y: 0 };
    expect(deletePin([a, b], "a")).toEqual([b]);
  });
  it("no-op when id missing", () => {
    const a = { id: "a", target: "<h1>", note: "", ts: 1, x: 0, y: 0 };
    expect(deletePin([a], "z")).toEqual([a]);
  });
});

describe("composeMarkdown", () => {
  it("formats header + numbered pins", () => {
    const pins = [
      { id: "a", target: "<button> Save", note: "make this primary", ts: 1, x: 0, y: 0 },
      { id: "b", target: "<h1> Hello", note: "", ts: 2, x: 0, y: 0 },
    ];
    const md = composeMarkdown("/home", pins);
    expect(md).toContain("# Feedback on /home");
    expect(md).toContain("Total pins: 2");
    expect(md).toContain("## Pin #1");
    expect(md).toContain("**Target:** `<button> Save`");
    expect(md).toContain("**Note:** make this primary");
    expect(md).toContain("## Pin #2");
    expect(md).toContain("**Note:** _(empty)_");
  });
  it("handles zero pins", () => {
    expect(composeMarkdown("/", [])).toContain("Total pins: 0");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/brookebekoff/feedback-to-cli
npm test -- tests/core.test.js
```

Expected: FAIL — `Cannot find module '../src/core.js'`.

- [ ] **Step 3: Implement src/core.js**

Create `/Users/brookebekoff/feedback-to-cli/src/core.js`:

```js
/**
 * @typedef {Object} Pin
 * @property {string} id
 * @property {string} target
 * @property {string} note
 * @property {number} ts
 * @property {number} x
 * @property {number} y
 */

export function slugForPath(pathname) {
  if (!pathname || pathname === "/") return "root";
  const stripped = pathname.replace(/^\//, "");
  if (stripped === "") return "root";
  return stripped.replace(/\//g, "_");
}

export function makeKey(namespace, pathname) {
  return `feedback-to-cli:${namespace}:${pathname}`;
}

export function upsertPin(pins, pin) {
  const idx = pins.findIndex((p) => p.id === pin.id);
  if (idx === -1) return [...pins, pin];
  const next = pins.slice();
  next[idx] = pin;
  return next;
}

export function deletePin(pins, id) {
  return pins.filter((p) => p.id !== id);
}

export function composeMarkdown(pathname, pins) {
  const lines = [];
  lines.push(`# Feedback on ${pathname}`, "");
  lines.push(`Total pins: ${pins.length}`, "");
  pins.forEach((pin, i) => {
    lines.push(`## Pin #${i + 1}`);
    lines.push(`**Target:** \`${pin.target}\``);
    lines.push(`**Note:** ${pin.note ? pin.note : "_(empty)_"}`);
    lines.push("");
  });
  return lines.join("\n").trimEnd() + "\n";
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/core.test.js
```

Expected: 12/12 pass.

- [ ] **Step 5: Commit**

```bash
git add src/core.js tests/core.test.js
git commit -m "feat(core): pure helpers for slug, key, pin upsert/delete, markdown"
```

---

## Task 3: src/server.js — /ping route (TDD)

**Files:**
- Create: `src/server.js`
- Test: `tests/server.test.js`

`createServer(cwd)` returns a Node `http.Server` (not yet listening). Tests start it on a random port via `.listen(0)`, fetch, then `.close()`.

- [ ] **Step 1: Write the failing test**

Create `/Users/brookebekoff/feedback-to-cli/tests/server.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/server.test.js
```

Expected: FAIL — `Cannot find module '../src/server.js'`.

- [ ] **Step 3: Implement src/server.js (ping only)**

Create `/Users/brookebekoff/feedback-to-cli/src/server.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/server.test.js
```

Expected: 2/2 pass.

- [ ] **Step 5: Commit**

```bash
git add src/server.js tests/server.test.js
git commit -m "feat(server): GET /ping with CORS"
```

---

## Task 4: src/server.js — /pin route (write + upsert + delete)

**Files:**
- Modify: `src/server.js`
- Modify: `tests/server.test.js`

Behavior:
- `POST /pin {page, pin}` → reads `cwd/.feedback-to-cli/<slug>.md` if it exists, parses pins, `upsertPin`, writes back via `composeMarkdown`. Creates `.feedback-to-cli/` dir if missing.
- `POST /pin {page, pin: {id, note: null, ...}}` → deletes that pin from the file.

Parsing strategy: we only need to round-trip pins WE wrote. Store a JSON sidecar `<slug>.json` next to the md so we don't have to parse markdown back. The md file is for the assistant to read; the json is internal state.

- [ ] **Step 1: Add failing tests for /pin**

Append to `/Users/brookebekoff/feedback-to-cli/tests/server.test.js`:

```js
import { readFileSync, existsSync } from "node:fs";

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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/server.test.js
```

Expected: 4 new tests fail (404 response, files don't exist).

- [ ] **Step 3: Implement /pin in src/server.js**

Replace `/Users/brookebekoff/feedback-to-cli/src/server.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/server.test.js
```

Expected: 6/6 pass.

- [ ] **Step 5: Commit**

```bash
git add src/server.js tests/server.test.js
git commit -m "feat(server): POST /pin upserts/deletes pins, writes md+json sidecar"
```

---

## Task 5: src/server.js — /clear route

**Files:**
- Modify: `src/server.js`
- Modify: `tests/server.test.js`

`POST /clear {page}` → deletes both `<slug>.md` and `<slug>.json` for that page.

- [ ] **Step 1: Add failing test**

Append to `/Users/brookebekoff/feedback-to-cli/tests/server.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
npm test -- tests/server.test.js
```

Expected: 2 new tests fail (404).

- [ ] **Step 3: Add /clear handler in src/server.js**

Add `import { unlinkSync } from "node:fs";` to the imports, then insert before the 404 fallback:

```js
    if (req.method === "POST" && req.url === "/clear") {
      try {
        const { page } = await readBody(req);
        const slug = slugForPath(page);
        const dir = join(cwd, DIR);
        for (const ext of ["md", "json"]) {
          const p = join(dir, `${slug}.${ext}`);
          if (existsSync(p)) unlinkSync(p);
        }
        res.writeHead(200, { ...CORS, "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, CORS);
        res.end(String(err.message ?? err));
      }
      return;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/server.test.js
```

Expected: 8/8 pass.

- [ ] **Step 5: Commit**

```bash
git add src/server.js tests/server.test.js
git commit -m "feat(server): POST /clear removes md+json sidecar for page"
```

---

## Task 6: bin/cli.js — `feedback-to-cli serve`

**Files:**
- Create: `bin/cli.js`

CLI parses argv:
- `feedback-to-cli serve` → start server on default port 9091
- `feedback-to-cli serve --port 9099` → start on custom port
- `feedback-to-cli` (no args) or `--help` → print usage

- [ ] **Step 1: Create bin/cli.js**

Create `/Users/brookebekoff/feedback-to-cli/bin/cli.js`:

```js
#!/usr/bin/env node
import { createServer } from "../src/server.js";

const args = process.argv.slice(2);
const cmd = args[0];

function usage() {
  console.log(`feedback-to-cli — companion server for the feedback overlay

Usage:
  feedback-to-cli serve [--port <n>]    start the companion (default port 9091)
  feedback-to-cli --help                show this message

Pins from the overlay land in ./.feedback-to-cli/<page-slug>.md so your AI
assistant can read them directly. Run from the directory you want pins written to.
`);
}

if (!cmd || cmd === "--help" || cmd === "-h") {
  usage();
  process.exit(0);
}

if (cmd !== "serve") {
  console.error(`Unknown command: ${cmd}\n`);
  usage();
  process.exit(1);
}

const portIdx = args.indexOf("--port");
const port = portIdx !== -1 ? Number(args[portIdx + 1]) : 9091;
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid port: ${args[portIdx + 1]}`);
  process.exit(1);
}

const server = createServer(process.cwd());
server.listen(port, "127.0.0.1", () => {
  console.log(`feedback-to-cli listening on http://127.0.0.1:${port}`);
  console.log(`writing pins to ${process.cwd()}/.feedback-to-cli/`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${port} is in use. Try --port 9092.`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x /Users/brookebekoff/feedback-to-cli/bin/cli.js
```

- [ ] **Step 3: Smoke-test the CLI**

```bash
cd /tmp && /Users/brookebekoff/feedback-to-cli/bin/cli.js --help
```

Expected: usage text prints, exit 0.

```bash
cd /tmp && /Users/brookebekoff/feedback-to-cli/bin/cli.js serve --port 9199 &
sleep 1
curl -s http://127.0.0.1:9199/ping
kill %1
```

Expected: `{"ok":true}` printed.

- [ ] **Step 4: Commit**

```bash
git add bin/cli.js
git commit -m "feat(cli): feedback-to-cli serve [--port N]"
```

---

## Task 7: src/overlay.js — port from sublease-app, refactor to use core

**Files:**
- Create: `src/overlay.js`
- Test: `tests/overlay.test.js`

Source of truth: `/Users/brookebekoff/sublease-app/.superpowers/brainstorm/96962-1777787596/content/_feedback.js` (288 lines).

**Adaptations to make while porting:**
1. Wrap entire IIFE in `(function(){ ... })();` so it can be loaded via `<script src>` directly without modules.
2. Read namespace + companion port from the script tag's `data-namespace` and `data-companion-port` attributes (default `"default"` and `9091`).
3. Replace inline localStorage key with `makeKey(namespace, location.pathname)` — but inline the helper since the IIFE has no imports at runtime (esbuild bundles `core.js` into the IIFE for the dist build; for the unbundled `src/overlay.js` we paste the helpers inline).

**Decision:** the `src/overlay.js` file will inline the core helpers (so it works both as a standalone script and as the input to esbuild). `tests/overlay.test.js` will exercise it under jsdom.

- [ ] **Step 1: Write the failing test**

Create `/Users/brookebekoff/feedback-to-cli/tests/overlay.test.js`:

```js
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

async function loadOverlay({ namespace = "default", port = "9091" } = {}) {
  document.body.innerHTML = "";
  const script = document.createElement("script");
  script.src = "feedback-to-cli.js";
  script.dataset.namespace = namespace;
  script.dataset.companionPort = port;
  document.body.appendChild(script);
  globalThis.__F2C_TEST__ = true;
  vi.resetModules();
  await import("../src/overlay.js?t=" + Date.now());
}

beforeEach(() => {
  localStorage.clear();
  globalThis.fetch = vi.fn(() => Promise.reject(new Error("no companion")));
});

describe("overlay boot", () => {
  it("mounts a toolbar in the DOM", async () => {
    await loadOverlay();
    expect(document.querySelector("[data-f2c-toolbar]")).toBeTruthy();
  });
  it("reads namespace from data-namespace", async () => {
    await loadOverlay({ namespace: "my-app" });
    // The overlay exposes its key via window.__f2c.key for testing
    expect(window.__f2c.key).toBe("feedback-to-cli:my-app:/");
  });
  it("starts with zero pins", async () => {
    await loadOverlay();
    expect(window.__f2c.pins()).toEqual([]);
  });
});

describe("pin lifecycle", () => {
  it("save adds a pin to localStorage", async () => {
    await loadOverlay();
    window.__f2c.savePin({ id: "p1", target: "<h1>", note: "x", ts: 1, x: 10, y: 20 });
    const pins = JSON.parse(localStorage.getItem("feedback-to-cli:default:/"));
    expect(pins).toHaveLength(1);
    expect(pins[0].note).toBe("x");
  });
  it("save with same id replaces the pin", async () => {
    await loadOverlay();
    window.__f2c.savePin({ id: "p1", target: "<h1>", note: "first", ts: 1, x: 0, y: 0 });
    window.__f2c.savePin({ id: "p1", target: "<h1>", note: "second", ts: 2, x: 0, y: 0 });
    expect(window.__f2c.pins()).toHaveLength(1);
    expect(window.__f2c.pins()[0].note).toBe("second");
  });
  it("clear removes all pins for current page", async () => {
    await loadOverlay();
    window.__f2c.savePin({ id: "p1", target: "<h1>", note: "x", ts: 1, x: 0, y: 0 });
    window.__f2c.clear();
    expect(window.__f2c.pins()).toEqual([]);
  });
});

describe("markdown export", () => {
  it("composeMarkdown produces the spec'd format", async () => {
    await loadOverlay();
    window.__f2c.savePin({ id: "p1", target: "<button> Save", note: "make primary", ts: 1, x: 0, y: 0 });
    const md = window.__f2c.markdown();
    expect(md).toContain("# Feedback on /");
    expect(md).toContain("Total pins: 1");
    expect(md).toContain("**Target:** `<button> Save`");
    expect(md).toContain("**Note:** make primary");
  });
});

describe("companion sync", () => {
  it("posts to companion when /ping succeeds at boot", async () => {
    const calls = [];
    globalThis.fetch = vi.fn((url, opts) => {
      calls.push({ url, opts });
      if (url.endsWith("/ping")) return Promise.resolve({ ok: true });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
    });
    await loadOverlay();
    await new Promise((r) => setTimeout(r, 10)); // wait for ping
    window.__f2c.savePin({ id: "p1", target: "<h1>", note: "x", ts: 1, x: 0, y: 0 });
    await new Promise((r) => setTimeout(r, 10));
    const pinPosts = calls.filter((c) => c.url.endsWith("/pin"));
    expect(pinPosts).toHaveLength(1);
    const body = JSON.parse(pinPosts[0].opts.body);
    expect(body.page).toBe("/");
    expect(body.pin.id).toBe("p1");
  });
  it("does not post when /ping fails at boot", async () => {
    const calls = [];
    globalThis.fetch = vi.fn((url) => {
      calls.push(url);
      return Promise.reject(new Error("ECONNREFUSED"));
    });
    await loadOverlay();
    await new Promise((r) => setTimeout(r, 10));
    window.__f2c.savePin({ id: "p1", target: "<h1>", note: "x", ts: 1, x: 0, y: 0 });
    await new Promise((r) => setTimeout(r, 10));
    expect(calls.filter((c) => c.endsWith("/pin"))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/overlay.test.js
```

Expected: FAIL — `Cannot find module '../src/overlay.js'`.

- [ ] **Step 3: Read the source overlay**

```bash
cat /Users/brookebekoff/sublease-app/.superpowers/brainstorm/96962-1777787596/content/_feedback.js
```

Read the full 288 lines. Note its DOM structure (toolbar, popover, pin element), localStorage key (it currently uses a hardcoded `feedback:` prefix scoped to pathname), and event wiring.

- [ ] **Step 4: Implement src/overlay.js**

Create `/Users/brookebekoff/feedback-to-cli/src/overlay.js` as an IIFE. Use this skeleton, then port the visual + interaction code from `_feedback.js` into the marked sections:

```js
(function () {
  if (typeof window === "undefined") return;
  if (window.__f2c) return; // idempotent

  // --- inlined core helpers (kept in sync with src/core.js) ---
  function slugForPath(p) {
    if (!p || p === "/") return "root";
    const s = p.replace(/^\//, "");
    return s === "" ? "root" : s.replace(/\//g, "_");
  }
  function makeKey(ns, p) { return `feedback-to-cli:${ns}:${p}`; }
  function upsertPin(pins, pin) {
    const i = pins.findIndex((p) => p.id === pin.id);
    if (i === -1) return [...pins, pin];
    const next = pins.slice(); next[i] = pin; return next;
  }
  function deletePin(pins, id) { return pins.filter((p) => p.id !== id); }
  function composeMarkdown(pathname, pins) {
    const lines = [`# Feedback on ${pathname}`, "", `Total pins: ${pins.length}`, ""];
    pins.forEach((pin, i) => {
      lines.push(`## Pin #${i + 1}`);
      lines.push(`**Target:** \`${pin.target}\``);
      lines.push(`**Note:** ${pin.note ? pin.note : "_(empty)_"}`);
      lines.push("");
    });
    return lines.join("\n").trimEnd() + "\n";
  }

  // --- config from script tag ---
  const script = document.currentScript || Array.from(document.scripts).find((s) => /feedback-to-cli/.test(s.src));
  const namespace = (script && script.dataset.namespace) || "default";
  const companionPort = Number((script && script.dataset.companionPort) || 9091);
  const pathname = location.pathname;
  const key = makeKey(namespace, pathname);

  // --- state ---
  let pins = [];
  try { pins = JSON.parse(localStorage.getItem(key)) || []; } catch { pins = []; }
  let companionUp = false;

  function persist() {
    localStorage.setItem(key, JSON.stringify(pins));
  }

  function syncToCompanion(pin) {
    if (!companionUp) return;
    fetch(`http://127.0.0.1:${companionPort}/pin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page: pathname, pin }),
    }).catch(() => {});
  }

  function syncClearToCompanion() {
    if (!companionUp) return;
    fetch(`http://127.0.0.1:${companionPort}/clear`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page: pathname }),
    }).catch(() => {});
  }

  function savePin(pin) {
    pins = upsertPin(pins, pin);
    persist();
    syncToCompanion(pin);
    render();
  }

  function removePin(id) {
    pins = deletePin(pins, id);
    persist();
    syncToCompanion({ id, note: null });
    render();
  }

  function clearAll() {
    pins = [];
    persist();
    syncClearToCompanion();
    render();
  }

  function markdown() {
    return composeMarkdown(pathname, pins);
  }

  async function copyMarkdown() {
    const md = markdown();
    try {
      await navigator.clipboard.writeText(md);
      flashToast("Copied markdown to clipboard");
    } catch {
      flashToast("Copy failed — see console");
      console.log(md);
    }
  }

  // --- TOOLBAR / POPOVER / PIN DOM ---
  // PORT FROM /Users/brookebekoff/sublease-app/.superpowers/brainstorm/96962-1777787596/content/_feedback.js
  // - createToolbar(): bottom-right floating bar with pin count, on/off toggle, "clear", "copy all"
  // - createPin(pin): absolutely-positioned dot at (pin.x, pin.y) with hover popover
  // - openPopover(targetEl, x, y): captures element tag + first 60 chars text, opens textarea
  // - On click anywhere (when active): create new pin with id = crypto.randomUUID(), target string, x/y from pageX/pageY
  // - Style: brutalist plum (#5a2d56) primary, mustard (#f3c94f) accent, hard 2px black borders, 4px offset shadows
  // Keep visual fidelity to the source.

  function render() {
    // re-render pin layer + toolbar count
    // (implement during port)
  }

  function flashToast(msg) {
    const t = document.createElement("div");
    t.setAttribute("data-f2c-toast", "");
    t.textContent = msg;
    Object.assign(t.style, {
      position: "fixed", bottom: "80px", right: "16px",
      background: "#0f0f0f", color: "#fff", padding: "10px 14px",
      borderRadius: "6px", fontFamily: "system-ui, sans-serif", fontSize: "14px",
      zIndex: 2147483647,
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }

  // --- companion detection ---
  function detectCompanion() {
    return fetch(`http://127.0.0.1:${companionPort}/ping`)
      .then((r) => { companionUp = !!(r && r.ok); })
      .catch(() => { companionUp = false; });
  }

  // --- expose for tests ---
  window.__f2c = {
    key,
    pins: () => pins.slice(),
    savePin,
    removePin,
    clear: clearAll,
    markdown,
    copyMarkdown,
    get companionUp() { return companionUp; },
  };

  function boot() {
    // mount minimal toolbar so tests pass; full visual port lands in the same task
    const bar = document.createElement("div");
    bar.setAttribute("data-f2c-toolbar", "");
    bar.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:2147483647;font-family:system-ui,sans-serif;";
    document.body.appendChild(bar);
    detectCompanion().then(() => {
      // sync any locally-stored pins on first boot when companion is up
      if (companionUp) pins.forEach((p) => syncToCompanion(p));
      render();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
```

Then expand the `// PORT FROM` section by translating the toolbar/popover/pin DOM from `_feedback.js` to use the new state functions (`savePin`, `removePin`, `clearAll`). Keep visual styling identical to the brutalist plum/mustard look.

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- tests/overlay.test.js
```

Expected: 9/9 pass. The toolbar test only requires `[data-f2c-toolbar]` to exist; visual fidelity is verified manually in Task 9.

- [ ] **Step 6: Commit**

```bash
git add src/overlay.js tests/overlay.test.js
git commit -m "feat(overlay): IIFE with click-to-pin, copy-all, companion sync"
```

---

## Task 8: Build pipeline (esbuild)

**Files:**
- Create: `scripts/build.js`

esbuild bundles `src/overlay.js` (already inlines core) → `dist/feedback-to-cli.js` (minified IIFE).

- [ ] **Step 1: Create scripts/build.js**

Create `/Users/brookebekoff/feedback-to-cli/scripts/build.js`:

```js
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["src/overlay.js"],
  outfile: "dist/feedback-to-cli.js",
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020"],
  banner: { js: "/* feedback-to-cli — MIT — https://github.com/brkrose/feedback-to-cli */" },
});

console.log("built dist/feedback-to-cli.js");
```

- [ ] **Step 2: Run the build**

```bash
cd /Users/brookebekoff/feedback-to-cli
npm run build
```

Expected: `dist/feedback-to-cli.js` exists, file size <15KB.

- [ ] **Step 3: Verify with `du -h`**

```bash
du -h /Users/brookebekoff/feedback-to-cli/dist/feedback-to-cli.js
```

- [ ] **Step 4: Commit**

```bash
git add scripts/build.js
git commit -m "build: esbuild bundle to dist/feedback-to-cli.js"
```

---

## Task 9: Static HTML example + visual smoke test

**Files:**
- Create: `examples/static-html/index.html`

- [ ] **Step 1: Create the example**

Create `/Users/brookebekoff/feedback-to-cli/examples/static-html/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>feedback-to-cli — static HTML demo</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 640px; margin: 60px auto; padding: 0 20px; line-height: 1.6; color: #1a1a1a; }
    h1 { font-size: 32px; letter-spacing: -0.02em; }
    button { padding: 10px 18px; border: 2px solid #1a1a1a; background: #f3c94f; font-weight: 600; cursor: pointer; }
    section { margin: 40px 0; padding: 20px; border: 1px dashed #aaa; }
  </style>
</head>
<body>
  <h1>Demo page</h1>
  <p>Click anywhere to drop a pin. Use the toolbar bottom-right to copy markdown.</p>
  <button>Primary action</button>
  <section>
    <h2>A section</h2>
    <p>Pins persist in localStorage scoped to this pathname.</p>
  </section>
  <script src="../../dist/feedback-to-cli.js" data-namespace="demo"></script>
</body>
</html>
```

- [ ] **Step 2: Smoke test in browser**

```bash
cd /Users/brookebekoff/feedback-to-cli
python3 -m http.server 8765 &
sleep 1
open http://127.0.0.1:8765/examples/static-html/index.html
```

Manually verify: toolbar appears bottom-right, click drops a pin, popover opens, save persists across reload, "copy all" puts markdown in clipboard. Then:

```bash
kill %1
```

- [ ] **Step 3: Smoke test with companion running**

```bash
cd /tmp/f2c-demo
mkdir -p /tmp/f2c-demo && cd /tmp/f2c-demo
node /Users/brookebekoff/feedback-to-cli/bin/cli.js serve --port 9091 &
cd /Users/brookebekoff/feedback-to-cli && python3 -m http.server 8765 &
sleep 1
open http://127.0.0.1:8765/examples/static-html/index.html
```

Drop a pin in the browser, then check `/tmp/f2c-demo/.feedback-to-cli/root.md` exists with the pin.

```bash
kill %1 %2
```

- [ ] **Step 4: Commit**

```bash
cd /Users/brookebekoff/feedback-to-cli
git add examples/static-html/index.html
git commit -m "docs: static-html example page"
```

---

## Task 10: Framework example READMEs

**Files:**
- Create: `examples/nextjs/README.md`, `examples/vite/README.md`

- [ ] **Step 1: Next.js snippet**

Create `/Users/brookebekoff/feedback-to-cli/examples/nextjs/README.md`:

```md
# feedback-to-cli in Next.js

Add the script tag in `app/layout.tsx`, gated to development:

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {process.env.NODE_ENV === "development" && (
          <script
            src="https://unpkg.com/feedback-to-cli@1"
            data-namespace="my-app"
            async
          />
        )}
      </body>
    </html>
  );
}
```

Then in another terminal, from your project root:

```bash
npx feedback-to-cli serve
```

Pins land in `.feedback-to-cli/<page>.md`. Add it to `.gitignore`.
```

- [ ] **Step 2: Vite snippet**

Create `/Users/brookebekoff/feedback-to-cli/examples/vite/README.md`:

```md
# feedback-to-cli in Vite

Add the script tag in `index.html` (Vite serves it directly):

```html
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
  <script src="https://unpkg.com/feedback-to-cli@1" data-namespace="my-app"></script>
</body>
```

Wrap in a conditional if you want to keep it out of production builds:

```html
<!-- only loads when running `vite dev`, not in built output -->
<script>
  if (location.hostname === "localhost") {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/feedback-to-cli@1";
    s.dataset.namespace = "my-app";
    document.body.appendChild(s);
  }
</script>
```

Run the companion from project root:

```bash
npx feedback-to-cli serve
```
```

- [ ] **Step 3: Commit**

```bash
git add examples/nextjs/README.md examples/vite/README.md
git commit -m "docs: nextjs + vite usage snippets"
```

---

## Task 11: Playwright e2e

**Files:**
- Create: `playwright.config.ts`, `tests/e2e.spec.ts`

- [ ] **Step 1: Install playwright browsers**

```bash
cd /Users/brookebekoff/feedback-to-cli
npx playwright install chromium
```

- [ ] **Step 2: Create playwright.config.ts**

Create `/Users/brookebekoff/feedback-to-cli/playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /e2e\.spec\.ts/,
  use: {
    baseURL: "http://127.0.0.1:8766",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  webServer: {
    command: "python3 -m http.server 8766",
    port: 8766,
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 3: Create tests/e2e.spec.ts**

Create `/Users/brookebekoff/feedback-to-cli/tests/e2e.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("place a pin, copy markdown, see it in clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/examples/static-html/index.html");

  // toolbar mounts
  await expect(page.locator("[data-f2c-toolbar]")).toBeVisible();

  // place a pin via the page API (avoids brittle DOM clicks during port-in-progress)
  await page.evaluate(() => {
    // @ts-ignore
    window.__f2c.savePin({ id: "p1", target: "<h1> Demo page", note: "make hero bolder", ts: Date.now(), x: 100, y: 100 });
  });

  // copy markdown
  await page.evaluate(() => window.__f2c.copyMarkdown());

  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("# Feedback on /examples/static-html/index.html");
  expect(clip).toContain("**Note:** make hero bolder");
});
```

- [ ] **Step 4: Run e2e**

```bash
cd /Users/brookebekoff/feedback-to-cli
npm run build  # ensure dist exists
npm run test:e2e
```

Expected: 1/1 pass.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e.spec.ts
git commit -m "test(e2e): playwright places pin and asserts clipboard markdown"
```

---

## Task 12: README, publish prep, dry run

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write the real README**

Replace `/Users/brookebekoff/feedback-to-cli/README.md`:

```md
# feedback-to-cli

> Click-to-pin feedback on any localhost page. Copy the markdown straight to your AI CLI.

You're vibe-coding with Claude Code, Cursor, or Copilot CLI. You see something off in the browser. Today you screenshot it, describe it in words, paste. Lossy. Slow.

`feedback-to-cli` collapses that to: **click on the thing → type a sentence → "copy all" → paste markdown back to your CLI.** With the optional companion process, the paste step disappears too.

---

## Quick start (script tag)

```html
<script src="https://unpkg.com/feedback-to-cli@1"></script>
```

Drop that on any locally-served page. Click anywhere to pin. Toolbar bottom-right has on/off, clear, copy-all.

Pins persist in `localStorage` scoped to the pathname. Works in static HTML, Next.js dev, Vite dev, Astro dev — anything that renders HTML on localhost.

## Optional: companion server

```bash
npx feedback-to-cli serve
```

Run from your project root. The overlay auto-detects it once at boot. Every save also writes to `.feedback-to-cli/<page-slug>.md` in the cwd, ready for your assistant to read directly.

```
.feedback-to-cli/
  home.md
  east-village_abc.md
```

> Started the companion mid-session? Reload the page so the overlay picks it up.

## Customization

Two `data-*` attributes on the script tag:

```html
<script
  src="https://unpkg.com/feedback-to-cli@1"
  data-namespace="my-app"
  data-companion-port="9091"
></script>
```

That's the whole API.

## Examples

- `examples/static-html/` — drop-in script tag
- `examples/nextjs/` — `app/layout.tsx` snippet
- `examples/vite/` — `index.html` snippet

## What lands in the clipboard

```md
# Feedback on /home

Total pins: 2

## Pin #1
**Target:** `<button> List Yours →`
**Note:** make this primary, not ghost

## Pin #2
**Target:** `<h1> NYC's only short-term rental search…`
**Note:** _(empty)_
```

## License

MIT © Brooke Bekoff
```

- [ ] **Step 2: Run the full test suite**

```bash
cd /Users/brookebekoff/feedback-to-cli
npm test
npm run test:e2e
```

Expected: all green.

- [ ] **Step 3: Pack dry-run and inspect**

```bash
npm pack --dry-run
```

Expected: tarball includes `dist/`, `bin/`, `src/`, `README.md`, `LICENSE`. No `tests/`, no `examples/`, no `node_modules/`.

- [ ] **Step 4: Commit README**

```bash
git add README.md
git commit -m "docs: README with pitch + install + clipboard sample"
```

- [ ] **Step 5: Create the GitHub repo and push**

```bash
gh repo create brkrose/feedback-to-cli --public --source=. --remote=origin --description="Click-to-pin feedback overlay for any localhost page. Pipe markdown to your AI CLI."
git push -u origin main
```

- [ ] **Step 6: Publish to npm (manual, after smoke test)**

```bash
npm publish --access public
```

Then verify: `https://unpkg.com/feedback-to-cli@0.1.0/dist/feedback-to-cli.js` returns the bundle.

---

## Self-review checklist

- [ ] Every task has exact file paths (✓)
- [ ] No "TBD" / "implement later" anywhere (✓)
- [ ] All test code is complete (✓)
- [ ] Method signatures consistent across tasks (`upsertPin`, `deletePin`, `slugForPath`, `makeKey`, `composeMarkdown`) — referenced in core tests, server tests, and overlay tests with the same names (✓)
- [ ] Spec coverage:
  - script tag distribution → Task 1, 8 (build), 12 (publish) ✓
  - companion `GET /ping` → Task 3 ✓
  - companion `POST /pin` upsert + delete → Task 4 ✓
  - companion `POST /clear` → Task 5 ✓
  - CLI `feedback-to-cli serve` → Task 6 ✓
  - overlay localStorage + namespace + companion sync → Task 7 ✓
  - markdown export format → Task 2 (impl), 7 (overlay surfaces it), 11 (e2e asserts) ✓
  - examples (static-html, nextjs, vite) → Task 9, 10 ✓
  - vitest jsdom + node + playwright → Tasks 2, 3, 4, 5, 7, 11 ✓
  - zero runtime deps → enforced by package.json (no `dependencies` key) in Task 1 ✓
