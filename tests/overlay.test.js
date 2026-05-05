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

function fireEvent(type, opts = {}) {
  // jsdom lacks PointerEvent; fake it with MouseEvent + a pointerId field.
  const Ctor = typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;
  const e = new Ctor(type, { bubbles: true, cancelable: true, button: opts.button || 0 });
  Object.defineProperty(e, "pageX", { value: opts.pageX || 0 });
  Object.defineProperty(e, "pageY", { value: opts.pageY || 0 });
  Object.defineProperty(e, "pointerId", { value: opts.pointerId || 1 });
  document.dispatchEvent(e);
  return e;
}

describe("drag threshold", () => {
  beforeEach(async () => {
    await loadOverlay();
  });

  it("creates a point pin when drag distance ≤ 6px", () => {
    fireEvent("pointerdown", { pageX: 100, pageY: 100, button: 0 });
    fireEvent("pointermove", { pageX: 104, pageY: 102 });
    fireEvent("pointerup", { pageX: 104, pageY: 102 });
    const pins = window.__f2c.pins();
    expect(pins.length).toBe(1);
    expect(pins[0].kind).toBe("point");
  });

  it("creates a region pin when drag distance > 6px", () => {
    fireEvent("pointerdown", { pageX: 100, pageY: 100, button: 0 });
    fireEvent("pointermove", { pageX: 200, pageY: 180 });
    fireEvent("pointerup", { pageX: 200, pageY: 180 });
    const pins = window.__f2c.pins();
    expect(pins.length).toBe(1);
    expect(pins[0].kind).toBe("region");
    expect(pins[0].w).toBe(100);
    expect(pins[0].h).toBe(80);
    expect(pins[0].x).toBe(100);
    expect(pins[0].y).toBe(100);
  });

  it("normalizes top-left for drags going up-and-left", () => {
    fireEvent("pointerdown", { pageX: 200, pageY: 200, button: 0 });
    fireEvent("pointermove", { pageX: 100, pageY: 100 });
    fireEvent("pointerup", { pageX: 100, pageY: 100 });
    const pins = window.__f2c.pins();
    expect(pins[0].x).toBe(100);
    expect(pins[0].y).toBe(100);
    expect(pins[0].w).toBe(100);
    expect(pins[0].h).toBe(100);
  });

  it("Escape during drag aborts the region", () => {
    fireEvent("pointerdown", { pageX: 100, pageY: 100, button: 0 });
    fireEvent("pointermove", { pageX: 200, pageY: 200 });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    fireEvent("pointerup", { pageX: 200, pageY: 200 });
    expect(window.__f2c.pins().length).toBe(0);
    expect(document.querySelector(".f2c-region-preview")).toBeNull();
  });

  it("pointercancel during drag aborts the region", () => {
    fireEvent("pointerdown", { pageX: 100, pageY: 100, button: 0 });
    fireEvent("pointermove", { pageX: 200, pageY: 200 });
    fireEvent("pointercancel", { pageX: 200, pageY: 200 });
    expect(window.__f2c.pins().length).toBe(0);
    expect(document.querySelector(".f2c-region-preview")).toBeNull();
  });
});
