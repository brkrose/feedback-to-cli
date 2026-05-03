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
    await new Promise((r) => setTimeout(r, 10));
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
