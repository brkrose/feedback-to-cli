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
    expect(md).toContain("**Note:**");
    expect(md).toContain("make primary");
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

function stubRectsFromInlineStyle() {
  document.querySelectorAll("[style]").forEach((el) => {
    const left = parseInt(el.style.left || "0", 10);
    const top = parseInt(el.style.top || "0", 10);
    const width = parseInt(el.style.width || "0", 10);
    const height = parseInt(el.style.height || "0", 10);
    el.getBoundingClientRect = () => ({
      left, top, right: left + width, bottom: top + height,
      width, height, x: left, y: top,
    });
  });
}

describe("region commit — container + contains", () => {
  beforeEach(async () => {
    await loadOverlay();
  });

  it("captures closest common ancestor and child tag list", () => {
    document.body.insertAdjacentHTML("beforeend", `
      <section id="about" style="position:absolute;left:100px;top:100px;width:400px;height:300px;">
        <h2 style="position:absolute;left:120px;top:120px;width:200px;height:30px;">About</h2>
        <p style="position:absolute;left:120px;top:160px;width:200px;height:60px;">Body copy</p>
        <button style="position:absolute;left:120px;top:230px;width:80px;height:30px;">A</button>
        <button style="position:absolute;left:210px;top:230px;width:80px;height:30px;">B</button>
      </section>
    `);
    stubRectsFromInlineStyle();

    fireEvent("pointerdown", { pageX: 110, pageY: 110, button: 0 });
    fireEvent("pointermove", { pageX: 480, pageY: 380 });
    fireEvent("pointerup", { pageX: 480, pageY: 380 });

    const pin = window.__f2c.pins()[0];
    expect(pin.kind).toBe("region");
    expect(pin.target).toContain("section");
    expect(pin.contains).toBe("<h2>, <p>, <button> ×2");
  });

  it("falls back to <body> + (empty region) when no elements intersect", () => {
    fireEvent("pointerdown", { pageX: 50, pageY: 50, button: 0 });
    fireEvent("pointermove", { pageX: 100, pageY: 100 });
    fireEvent("pointerup", { pageX: 100, pageY: 100 });
    const pin = window.__f2c.pins()[0];
    expect(pin.target).toBe("<body>");
    expect(pin.contains).toBe("(empty region)");
  });

  it("skips overlay's own elements", () => {
    fireEvent("pointerdown", { pageX: 0, pageY: 0, button: 0 });
    fireEvent("pointermove", { pageX: 2000, pageY: 2000 });
    fireEvent("pointerup", { pageX: 2000, pageY: 2000 });
    const pin = window.__f2c.pins()[0];
    expect(pin.contains).not.toContain("f2c");
  });
});

describe("region rendering", () => {
  beforeEach(async () => {
    await loadOverlay();
  });

  it("renders an .f2c-region with correct dimensions", () => {
    fireEvent("pointerdown", { pageX: 100, pageY: 100, button: 0 });
    fireEvent("pointermove", { pageX: 250, pageY: 200 });
    fireEvent("pointerup", { pageX: 250, pageY: 200 });
    const region = document.querySelector(".f2c-region");
    expect(region).not.toBeNull();
    expect(region.style.left).toBe("100px");
    expect(region.style.top).toBe("100px");
    expect(region.style.width).toBe("150px");
    expect(region.style.height).toBe("100px");
  });

  it("renders a corner tag with the pin number", () => {
    fireEvent("pointerdown", { pageX: 100, pageY: 100, button: 0 });
    fireEvent("pointermove", { pageX: 250, pageY: 200 });
    fireEvent("pointerup", { pageX: 250, pageY: 200 });
    const tag = document.querySelector(".f2c-region-tag");
    expect(tag).not.toBeNull();
    expect(tag.textContent).toBe("#1");
  });

  it("clicking the tag opens a popover", () => {
    fireEvent("pointerdown", { pageX: 100, pageY: 100, button: 0 });
    fireEvent("pointermove", { pageX: 250, pageY: 200 });
    fireEvent("pointerup", { pageX: 250, pageY: 200 });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".f2c-popover")).toBeNull();
    document.querySelector(".f2c-region-tag").click();
    expect(document.querySelector(".f2c-popover")).not.toBeNull();
  });
});

describe("popover anchor flip", () => {
  beforeEach(async () => {
    await loadOverlay();
    Object.defineProperty(window, "innerWidth", { value: 1000, configurable: true });
  });

  it("anchors popover to right of tag by default", () => {
    fireEvent("pointerdown", { pageX: 100, pageY: 100, button: 0 });
    fireEvent("pointermove", { pageX: 250, pageY: 200 });
    fireEvent("pointerup", { pageX: 250, pageY: 200 });
    const pop = document.querySelector(".f2c-popover");
    expect(pop.classList.contains("f2c-popover-flip")).toBe(false);
  });

  it("flips popover when region is near right edge", () => {
    fireEvent("pointerdown", { pageX: 900, pageY: 100, button: 0 });
    fireEvent("pointermove", { pageX: 980, pageY: 200 });
    fireEvent("pointerup", { pageX: 980, pageY: 200 });
    const pop = document.querySelector(".f2c-popover");
    expect(pop.classList.contains("f2c-popover-flip")).toBe(true);
  });
});

describe("first-visit auto-arm", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("arms on first visit to a path", async () => {
    await loadOverlay();
    expect(document.body.classList.contains("f2c-armed")).toBe(true);
    const armBtn = document.querySelector(".f2c-arm");
    expect(armBtn.textContent).toBe("on");
    expect(armBtn.classList.contains("f2c-armed-on")).toBe(true);
  });

  it("disarms on the second visit to the same path", async () => {
    await loadOverlay();
    delete window.__f2c;
    document.body.innerHTML = "";
    await loadOverlay();
    expect(document.body.classList.contains("f2c-armed")).toBe(false);
    const armBtn = document.querySelector(".f2c-arm");
    expect(armBtn.textContent).toBe("off");
    expect(armBtn.classList.contains("f2c-armed-on")).toBe(false);
  });

  it("clear button does not reset the seen flag", async () => {
    await loadOverlay();
    document.querySelector(".f2c-clear").click();
    delete window.__f2c;
    document.body.innerHTML = "";
    await loadOverlay();
    expect(document.body.classList.contains("f2c-armed")).toBe(false);
  });
});
