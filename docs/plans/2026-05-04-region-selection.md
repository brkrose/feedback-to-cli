# Region Selection + First-Visit Auto-Arm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drag-to-draw region pins (rectangular feedback targets) and first-visit auto-arm (overlay armed on first localhost page load, off on every reload after).

**Architecture:** Pure helpers (markdown branching, contains-list summary, seen-key generation) extracted to `src/core.js` for testability. Overlay logic in `src/overlay.js` replaces the single `click` listener with a `pointerdown` → `pointermove` → `pointerup` flow that branches on a 6px drag threshold. New pin shape adds optional `kind`/`w`/`h`/`contains` fields; legacy pins stay as `'point'` via undefined-check. Companion server unchanged — `/pin` already passes the pin object through verbatim.

**Tech Stack:** Vanilla JS (no framework), Vitest + jsdom for unit tests, Playwright for e2e. Build via `scripts/build.js` bundles `src/overlay.js` → `dist/feedback-to-cli.js`.

**Spec:** `docs/specs/2026-05-04-region-selection-design.md`

**File Structure:**
- Modify: `src/core.js` — add `summarizeContainsList()`, `makeSeenKey()`, branch `composeMarkdown()` on `pin.kind`
- Modify: `src/overlay.js` — extract `placePointPin()`, add pointer-event flow, region rendering, popover anchor flip, first-visit boot logic, new CSS
- Modify: `tests/core.test.js` — composer + helpers
- Modify: `tests/overlay.test.js` — drag threshold, region commit, popover anchoring, auto-arm
- Create: `tests/e2e/region-pin.spec.ts` — full drag → note → copy flow

---

### Task 1: Add `summarizeContainsList` helper to core

**Files:**
- Modify: `src/core.js`
- Modify: `tests/core.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/core.test.js`:

```js
import { slugForPath, makeKey, upsertPin, deletePin, composeMarkdown, summarizeContainsList, makeSeenKey } from "../src/core.js";

describe("summarizeContainsList", () => {
  it("returns '(empty region)' for empty input", () => {
    expect(summarizeContainsList([])).toBe("(empty region)");
  });
  it("formats a single tag", () => {
    expect(summarizeContainsList(["h2"])).toBe("<h2>");
  });
  it("dedupes identical tags with ×N suffix", () => {
    expect(summarizeContainsList(["button", "button", "button"])).toBe("<button> ×3");
  });
  it("preserves first-seen order across mixed tags", () => {
    expect(summarizeContainsList(["h2", "p", "button", "button"])).toBe("<h2>, <p>, <button> ×2");
  });
  it("caps at 8 unique tags with '+N more' overflow", () => {
    const tags = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    expect(summarizeContainsList(tags)).toBe("<a>, <b>, <c>, <d>, <e>, <f>, <g>, <h>, +2 more");
  });
  it("ignores non-string entries", () => {
    expect(summarizeContainsList(["h2", null, undefined, "p"])).toBe("<h2>, <p>");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm test -- tests/core.test.js`
Expected: FAIL with `summarizeContainsList is not a function` (and `makeSeenKey` import error — that's fine, fixed in Task 2).

- [ ] **Step 3: Implement the helper**

Append to `src/core.js`:

```js
const CONTAINS_CAP = 8;

export function summarizeContainsList(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return "(empty region)";
  const counts = new Map();
  for (const tag of tags) {
    if (typeof tag !== "string" || tag.length === 0) continue;
    counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  if (counts.size === 0) return "(empty region)";
  const entries = Array.from(counts.entries());
  const visible = entries.slice(0, CONTAINS_CAP);
  const overflow = entries.length - CONTAINS_CAP;
  const parts = visible.map(([tag, n]) => (n > 1 ? `<${tag}> ×${n}` : `<${tag}>`));
  if (overflow > 0) parts.push(`+${overflow} more`);
  return parts.join(", ");
}
```

- [ ] **Step 4: Add temporary `makeSeenKey` stub so the import resolves**

Append to `src/core.js`:

```js
export function makeSeenKey(namespace, pathname) {
  return `feedback-to-cli:${namespace}:${pathname}:seen`;
}
```

(Real tests for this come in Task 2 — keeping a one-liner here so Task 1 tests can pass.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm test -- tests/core.test.js`
Expected: PASS for all `summarizeContainsList` cases.

- [ ] **Step 6: Commit**

```bash
cd /Users/brookebekoff/feedback-to-cli
git add src/core.js tests/core.test.js
git commit -m "feat(core): add summarizeContainsList + makeSeenKey helpers"
```

---

### Task 2: Add `makeSeenKey` tests

**Files:**
- Modify: `tests/core.test.js`

- [ ] **Step 1: Write the tests** (helper already added in Task 1 step 4)

Append to `tests/core.test.js`:

```js
describe("makeSeenKey", () => {
  it("formats namespace + pathname + :seen suffix", () => {
    expect(makeSeenKey("default", "/home")).toBe("feedback-to-cli:default:/home:seen");
  });
  it("does not collide with the pins key", () => {
    const seen = makeSeenKey("app", "/about");
    const pins = makeKey("app", "/about");
    expect(seen).not.toBe(pins);
    expect(seen.startsWith(pins)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm test -- tests/core.test.js`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/brookebekoff/feedback-to-cli
git add tests/core.test.js
git commit -m "test(core): cover makeSeenKey format and collision guard"
```

---

### Task 3: Branch `composeMarkdown` on `pin.kind`

**Files:**
- Modify: `src/core.js`
- Modify: `tests/core.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/core.test.js`:

```js
describe("composeMarkdown — region pins", () => {
  const pointPin = {
    id: "p1", x: 10, y: 20, target: "<button> Buy",
    note: "make primary", ts: 1, kind: "point",
  };
  const regionPin = {
    id: "r1", x: 140, y: 480, w: 320, h: 180,
    target: "<section> About us",
    contains: "<h2>, <p>, <button> ×2",
    note: "2-col grid on desktop", ts: 2, kind: "region",
  };

  it("renders point pin in the existing shape", () => {
    const md = composeMarkdown("/home", [pointPin]);
    expect(md).toContain("## Pin #1");
    expect(md).toContain("**Target:** `<button> Buy`");
    expect(md).toContain("make primary");
  });

  it("renders region pin with Container/Contains/Size lines", () => {
    const md = composeMarkdown("/home", [regionPin]);
    expect(md).toContain("## Pin #1");
    expect(md).toContain("**Container:** `<section> About us`");
    expect(md).toContain("**Contains:** `<h2>, <p>, <button> ×2`");
    expect(md).toContain("**Size:** 320×180 at (140, 480)");
    expect(md).toContain("2-col grid on desktop");
    expect(md).not.toContain("**Target:**");
  });

  it("treats undefined kind as point pin (legacy)", () => {
    const legacy = { id: "l1", x: 0, y: 0, target: "<a>", note: "", ts: 0 };
    const md = composeMarkdown("/home", [legacy]);
    expect(md).toContain("**Target:** `<a>`");
    expect(md).not.toContain("**Container:**");
  });

  it("numbers mixed pins sequentially", () => {
    const md = composeMarkdown("/home", [pointPin, regionPin, pointPin]);
    expect(md).toMatch(/## Pin #1[\s\S]*## Pin #2[\s\S]*## Pin #3/);
  });

  it("handles region pin with empty note", () => {
    const md = composeMarkdown("/home", [{ ...regionPin, note: "" }]);
    expect(md).toContain("**Note:** _(empty)_");
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm test -- tests/core.test.js`
Expected: FAIL — region pins still rendered through point-pin path.

- [ ] **Step 3: Update `composeMarkdown`**

Replace the `pins.forEach` block in `src/core.js` with:

```js
  pins.forEach((pin, i) => {
    lines.push(`## Pin #${i + 1}`);
    if (pin.kind === "region") {
      const container = singleLine(pin.target).slice(0, TARGET_MAX);
      const contains = singleLine(pin.contains || "").slice(0, TARGET_MAX);
      lines.push(`**Container:** ${container ? inlineCode(container) : "_(unknown)_"}`);
      lines.push(`**Contains:** ${contains ? inlineCode(contains) : "_(empty)_"}`);
      lines.push(`**Size:** ${pin.w}×${pin.h} at (${pin.x}, ${pin.y})`);
    } else {
      const target = singleLine(pin.target).slice(0, TARGET_MAX);
      lines.push(`**Target:** ${target ? inlineCode(target) : "_(unknown)_"}`);
    }
    const note = stripControl(pin.note).slice(0, NOTE_MAX);
    if (note) {
      const fence = fenceFor(note);
      lines.push(`**Note:**`);
      lines.push(fence);
      lines.push(note);
      lines.push(fence);
    } else {
      lines.push(`**Note:** _(empty)_`);
    }
    lines.push("");
  });
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm test -- tests/core.test.js`
Expected: PASS for all new cases AND all existing point-pin cases (regression check).

- [ ] **Step 5: Commit**

```bash
cd /Users/brookebekoff/feedback-to-cli
git add src/core.js tests/core.test.js
git commit -m "feat(core): branch composeMarkdown on pin.kind for region pins"
```

---

### Task 4: Add CSS for region preview, committed region, and corner tag

**Files:**
- Modify: `src/overlay.js`

- [ ] **Step 1: Append style rules to `injectStyles()`**

In `src/overlay.js`, locate the `injectStyles()` function. Add the following entries to the `style.textContent` array, immediately before the closing `].join("\n")` line:

```js
      ".f2c-region {",
      "  position: absolute; z-index: 9997;",
      "  border: 2px dashed #4f2d65;",
      "  background: rgba(79, 45, 101, 0.12);",
      "  pointer-events: none;",
      "  box-sizing: border-box;",
      "}",
      ".f2c-region-preview {",
      "  position: absolute; z-index: 9997;",
      "  border: 2px dashed #4f2d65;",
      "  background: rgba(79, 45, 101, 0.12);",
      "  pointer-events: none;",
      "  box-sizing: border-box;",
      "}",
      ".f2c-region-tag {",
      "  position: absolute;",
      "  top: -2px; left: -2px;",
      "  min-width: 22px; height: 18px;",
      "  padding: 0 5px;",
      "  background: #4f2d65; color: white;",
      "  border: 2px solid #0a0a0a;",
      "  font: 700 10px 'JetBrains Mono', monospace;",
      "  display: flex; align-items: center; justify-content: center;",
      "  box-shadow: 2px 2px 0 #0a0a0a;",
      "  cursor: pointer;",
      "  pointer-events: all;",
      "  transition: transform 0.1s;",
      "}",
      ".f2c-region-tag:hover { transform: scale(1.15); }",
      ".f2c-region-tag.f2c-active { background: #ff7a2b; color: #0a0a0a; }",
```

- [ ] **Step 2: Verify build still succeeds**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm run build`
Expected: `dist/feedback-to-cli.js` rebuilt with no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/brookebekoff/feedback-to-cli
git add src/overlay.js
git commit -m "feat(overlay): add CSS for region preview, committed region, and tag"
```

---

### Task 5: Refactor — extract `placePointPin()` from `handleDocClick`

**Files:**
- Modify: `src/overlay.js`

This is a pure refactor with no behavior change. Confirms existing tests still pass before the larger pointer-event rewrite in Task 6.

- [ ] **Step 1: Add `placePointPin(x, y, targetEl)` function above `handleDocClick`**

In `src/overlay.js`, add this function before `function handleDocClick(e)`:

```js
  function placePointPin(x, y, targetEl) {
    var id = genId();
    var target = targetSummary(targetEl);
    var pin = {
      id: id,
      x: x,
      y: y,
      target: target,
      note: "",
      ts: Date.now(),
      kind: "point",
    };
    pins = upsertPin(pins, pin);
    persist();
    syncToCompanion(pin);
    render();
    var pinEl = pinLayer
      ? pinLayer.querySelector('[data-id="' + id + '"]')
      : null;
    openPopover(pin, pinEl);
  }
```

- [ ] **Step 2: Replace the body of `handleDocClick` to call the helper**

Replace the existing `handleDocClick` function body with:

```js
  function handleDocClick(e) {
    if (!armed) {
      closePopover();
      return;
    }
    if (
      e.target.closest &&
      e.target.closest(".f2c-pin, .f2c-popover, .f2c-toolbar, .f2c-region, .f2c-region-tag")
    ) {
      return;
    }
    if (activePopoverId !== null) {
      closePopover();
      return;
    }
    placePointPin(e.pageX || 0, e.pageY || 0, e.target);
  }
```

- [ ] **Step 3: Run tests**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm test -- tests/overlay.test.js`
Expected: All existing tests PASS (refactor is behavior-preserving). Note: tests that check `pin.kind` should still pass because `kind: "point"` is now explicitly set, but if any test asserts `kind === undefined`, it will fail and needs updating to `"point"`.

- [ ] **Step 4: Commit**

```bash
cd /Users/brookebekoff/feedback-to-cli
git add src/overlay.js
git commit -m "refactor(overlay): extract placePointPin from handleDocClick"
```

---

### Task 6: Add pointerdown/move/up flow with 6px drag threshold

**Files:**
- Modify: `src/overlay.js`
- Modify: `tests/overlay.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/overlay.test.js`:

```js
function fireEvent(type, opts) {
  const e = new PointerEvent(type, { bubbles: true, cancelable: true, ...opts });
  Object.defineProperty(e, "pageX", { value: opts.pageX || 0 });
  Object.defineProperty(e, "pageY", { value: opts.pageY || 0 });
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

  it("ignores pointerdown on toolbar/pin/popover/region", () => {
    placeMarker(); // helper to put a region in DOM
    function placeMarker() {
      const r = document.createElement("div");
      r.className = "f2c-region";
      document.body.appendChild(r);
      return r;
    }
    const region = document.querySelector(".f2c-region");
    region.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    fireEvent("pointermove", { pageX: 200, pageY: 200 });
    fireEvent("pointerup", { pageX: 200, pageY: 200 });
    expect(window.__f2c.pins().length).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm test -- tests/overlay.test.js`
Expected: FAIL — pointer events not handled, no preview rendered.

- [ ] **Step 3: Replace document listener wiring**

In `src/overlay.js`, replace the `attachDocumentListeners` function. The document `click` listener is removed — all pin placement and popover-close-on-outside flow through pointer events now (avoids the click-after-pointerup race where the just-opened popover would immediately close itself).

```js
  function attachDocumentListeners() {
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerCancel);
    document.addEventListener("keydown", handleDocKeydown);
  }
```

The existing `handleDocClick` function is no longer wired up but stays in the file — pin/region/toolbar elements still use their own inline `addEventListener("click", ...)` for opening their popovers, and those bubble into our own UI guards safely.

- [ ] **Step 4: Add drag state and pointer handlers**

In `src/overlay.js`, add this block above the (now-unused) `function handleDocClick(e)`:

```js
  var DRAG_THRESHOLD = 6;
  var dragState = null; // { startX, startY, pointerId, started, originTarget }
  var previewEl = null;

  function isInOurUI(el) {
    return !!(
      el && el.closest &&
      el.closest(".f2c-pin, .f2c-popover, .f2c-toolbar, .f2c-region, .f2c-region-tag")
    );
  }

  function handlePointerDown(e) {
    if (!armed) {
      if (activePopoverId !== null && !isInOurUI(e.target)) closePopover();
      return;
    }
    if (e.button !== 0) return;
    if (isInOurUI(e.target)) return;
    if (activePopoverId !== null) {
      closePopover();
      return; // close popover, don't start a new pin in the same gesture
    }
    dragState = {
      startX: e.pageX || 0,
      startY: e.pageY || 0,
      pointerId: e.pointerId,
      started: false,
      originTarget: e.target,
    };
  }

  function handlePointerMove(e) {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    var dx = (e.pageX || 0) - dragState.startX;
    var dy = (e.pageY || 0) - dragState.startY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (!dragState.started) {
      if (dist <= DRAG_THRESHOLD) return;
      dragState.started = true;
      previewEl = document.createElement("div");
      previewEl.className = "f2c-region-preview";
      pinLayer.appendChild(previewEl);
    }
    var box = normalizeBox(dragState.startX, dragState.startY, e.pageX || 0, e.pageY || 0);
    previewEl.style.left = box.x + "px";
    previewEl.style.top = box.y + "px";
    previewEl.style.width = box.w + "px";
    previewEl.style.height = box.h + "px";
  }

  function handlePointerUp(e) {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    var startedDrag = dragState.started;
    var startX = dragState.startX;
    var startY = dragState.startY;
    var originTarget = dragState.originTarget;
    cleanupDrag();
    if (!startedDrag) {
      placePointPin(startX, startY, originTarget);
      return;
    }
    var box = normalizeBox(startX, startY, e.pageX || 0, e.pageY || 0);
    placeRegionPin(box, originTarget);
  }

  function handlePointerCancel() {
    cleanupDrag();
  }

  function cleanupDrag() {
    if (previewEl) {
      previewEl.remove();
      previewEl = null;
    }
    dragState = null;
  }

  function normalizeBox(x1, y1, x2, y2) {
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1),
      h: Math.abs(y2 - y1),
    };
  }

  function placeRegionPin(box, originTarget) {
    // Stub — Task 7 implements the DOM walk + summarize + persist
    var id = genId();
    var pin = {
      id: id,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      target: "<body>",
      contains: "(empty region)",
      note: "",
      ts: Date.now(),
      kind: "region",
    };
    pins = upsertPin(pins, pin);
    persist();
    syncToCompanion(pin);
    render();
  }
```

- [ ] **Step 5: Update `handleDocKeydown` to also abort an in-progress drag**

In `src/overlay.js`, replace `handleDocKeydown`:

```js
  function handleDocKeydown(e) {
    if (e.key === "Escape") {
      if (dragState) {
        cleanupDrag();
        return;
      }
      closePopover();
    }
  }
```

- [ ] **Step 6: Run tests**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm test -- tests/overlay.test.js`
Expected: PASS for the new drag-threshold tests. Existing point-pin tests still pass (small movements don't start a drag, so the click handler still fires).

- [ ] **Step 7: Commit**

```bash
cd /Users/brookebekoff/feedback-to-cli
git add src/overlay.js tests/overlay.test.js
git commit -m "feat(overlay): pointerdown/move/up flow with 6px drag threshold + preview"
```

---

### Task 7: Region commit — DOM walk for container + contains

**Files:**
- Modify: `src/overlay.js`
- Modify: `tests/overlay.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/overlay.test.js`:

```js
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
    // Stub getBoundingClientRect to return the inline-style positions
    stubRectsFromInlineStyle();

    fireEvent("pointerdown", { pageX: 110, pageY: 110, button: 0 });
    fireEvent("pointermove", { pageX: 480, pageY: 380 });
    fireEvent("pointerup", { pageX: 480, pageY: 380 });

    const pin = window.__f2c.pins()[0];
    expect(pin.kind).toBe("region");
    expect(pin.target).toBe("<section> About Body copy A B");
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm test -- tests/overlay.test.js`
Expected: FAIL — `placeRegionPin` stub still hardcodes `<body>` and `(empty region)`.

- [ ] **Step 3: Add the imports for `summarizeContainsList` to overlay's inlined helpers**

At the top of the IIFE in `src/overlay.js`, in the `// --- inlined core helpers` block, add `summarizeContainsList` from Task 1:

```js
  function summarizeContainsList(tags) {
    if (!Array.isArray(tags) || tags.length === 0) return "(empty region)";
    const counts = new Map();
    for (const tag of tags) {
      if (typeof tag !== "string" || tag.length === 0) continue;
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    if (counts.size === 0) return "(empty region)";
    const entries = Array.from(counts.entries());
    const visible = entries.slice(0, 8);
    const overflow = entries.length - 8;
    const parts = visible.map(([tag, n]) => (n > 1 ? `<${tag}> ×${n}` : `<${tag}>`));
    if (overflow > 0) parts.push(`+${overflow} more`);
    return parts.join(", ");
  }
```

(The "kept in sync with src/core.js" comment at the top of the file already establishes this duplication pattern — overlay is bundled standalone for the script-tag distribution.)

- [ ] **Step 4: Implement region capture**

In `src/overlay.js`, replace the stub `placeRegionPin` body with:

```js
  function placeRegionPin(box, originTarget) {
    var capture = captureRegion(box);
    var id = genId();
    var pin = {
      id: id,
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      target: capture.container,
      contains: capture.contains,
      note: "",
      ts: Date.now(),
      kind: "region",
    };
    pins = upsertPin(pins, pin);
    persist();
    syncToCompanion(pin);
    render();
    var tagEl = pinLayer
      ? pinLayer.querySelector('.f2c-region-tag[data-id="' + id + '"]')
      : null;
    openPopover(pin, tagEl);
  }

  var OVERLAY_SELECTOR = ".f2c-toolbar, .f2c-pin, .f2c-region, .f2c-region-tag, .f2c-popover, .f2c-toast, .f2c-pin-layer, .f2c-region-preview";

  function captureRegion(box) {
    var matches = [];
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (el) {
        if (el.closest && el.closest(OVERLAY_SELECTOR)) return NodeFilter.FILTER_REJECT;
        if (el === document.body) return NodeFilter.FILTER_SKIP;
        var rect = el.getBoundingClientRect();
        if (intersects(rect, box)) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      },
    });
    var node = walker.nextNode();
    while (node) {
      matches.push(node);
      node = walker.nextNode();
    }
    if (matches.length === 0) {
      return { container: "<body>", contains: "(empty region)" };
    }
    var common = closestCommonAncestor(matches);
    var directChildren = matches.filter(function (el) {
      return el.parentElement === common;
    });
    var tagSource = directChildren.length > 0 ? directChildren : matches;
    var tags = tagSource.map(function (el) {
      return el.tagName ? el.tagName.toLowerCase() : "";
    });
    return {
      container: targetSummary(common),
      contains: summarizeContainsList(tags),
    };
  }

  function intersects(r, box) {
    return !(
      r.right < box.x ||
      r.left > box.x + box.w ||
      r.bottom < box.y ||
      r.top > box.y + box.h
    );
  }

  function closestCommonAncestor(els) {
    if (els.length === 1) return els[0].parentElement || document.body;
    var ancestors = els.map(function (el) {
      var chain = [];
      var n = el;
      while (n) {
        chain.unshift(n);
        n = n.parentElement;
      }
      return chain;
    });
    var common = document.body;
    var minLen = Math.min.apply(null, ancestors.map(function (a) { return a.length; }));
    for (var i = 0; i < minLen; i++) {
      var candidate = ancestors[0][i];
      if (ancestors.every(function (chain) { return chain[i] === candidate; })) {
        common = candidate;
      } else {
        break;
      }
    }
    return common;
  }
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm test -- tests/overlay.test.js`
Expected: PASS for region capture cases.

- [ ] **Step 6: Commit**

```bash
cd /Users/brookebekoff/feedback-to-cli
git add src/overlay.js tests/overlay.test.js
git commit -m "feat(overlay): capture container + contains for region pins"
```

---

### Task 8: Render committed regions + tag click → popover

**Files:**
- Modify: `src/overlay.js`
- Modify: `tests/overlay.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/overlay.test.js`:

```js
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
    // popover already open after commit (Task 7 calls openPopover); close it first
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".f2c-popover")).toBeNull();
    document.querySelector(".f2c-region-tag").click();
    expect(document.querySelector(".f2c-popover")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm test -- tests/overlay.test.js`
Expected: FAIL — `render()` does not yet draw `.f2c-region` elements.

- [ ] **Step 3: Add region rendering to `render()`**

In `src/overlay.js`, replace the `render()` function with:

```js
  function render() {
    if (toolbar) {
      var countEl = toolbar.querySelector(".f2c-n");
      if (countEl) countEl.textContent = pins.length;
    }
    if (!pinLayer) return;
    Array.from(pinLayer.querySelectorAll(".f2c-pin, .f2c-region")).forEach(function (el) {
      el.remove();
    });
    pins.forEach(function (pin, i) {
      if (pin.kind === "region") {
        pinLayer.appendChild(renderRegion(pin, i + 1));
      } else {
        pinLayer.appendChild(renderPinDot(pin));
      }
    });
  }

  function renderRegion(pin, n) {
    var box = document.createElement("div");
    box.className = "f2c-region";
    box.dataset.id = pin.id;
    box.style.left = pin.x + "px";
    box.style.top = pin.y + "px";
    box.style.width = pin.w + "px";
    box.style.height = pin.h + "px";

    var tag = document.createElement("div");
    tag.className = "f2c-region-tag";
    tag.dataset.id = pin.id;
    tag.textContent = "#" + n;
    tag.title = pin.note || "(no note)";
    tag.addEventListener("click", function (e) {
      e.stopPropagation();
      openPopover(pin, tag);
    });

    box.appendChild(tag);
    return box;
  }
```

- [ ] **Step 4: Update `closePopover` to clear active state on region tags too**

Replace `closePopover` body with:

```js
  function closePopover() {
    document.querySelectorAll(".f2c-popover").forEach(function (p) {
      p.remove();
    });
    document.querySelectorAll(".f2c-pin, .f2c-region-tag").forEach(function (p) {
      p.classList.remove("f2c-active");
    });
    activePopoverId = null;
  }
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm test`
Expected: PASS for new rendering tests AND all existing tests.

- [ ] **Step 6: Commit**

```bash
cd /Users/brookebekoff/feedback-to-cli
git add src/overlay.js tests/overlay.test.js
git commit -m "feat(overlay): render committed regions with corner tags + click handler"
```

---

### Task 9: Popover anchoring + viewport-edge flip for regions

**Files:**
- Modify: `src/overlay.js`
- Modify: `tests/overlay.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/overlay.test.js`:

```js
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
    // viewport is 1000px; popover is 280px wide; region tag at x=900 → right edge clip
    fireEvent("pointerdown", { pageX: 900, pageY: 100, button: 0 });
    fireEvent("pointermove", { pageX: 980, pageY: 200 });
    fireEvent("pointerup", { pageX: 980, pageY: 200 });
    const pop = document.querySelector(".f2c-popover");
    expect(pop.classList.contains("f2c-popover-flip")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm test -- tests/overlay.test.js`
Expected: FAIL — no flip logic yet.

- [ ] **Step 3: Add flip CSS**

In `src/overlay.js` `injectStyles()`, append:

```js
      ".f2c-popover-flip { transform: translate(-288px, -8px); }",
```

(Default `.f2c-popover` already uses `transform: translate(8px, -8px)`; the flip variant pulls left by 280px popover width + 8px gap.)

- [ ] **Step 4: Update `openPopover` to detect viewport edge and flip**

In `src/overlay.js`, replace `openPopover`'s anchor-positioning logic. Find these lines near the top of `openPopover`:

```js
    var pop = document.createElement("div");
    pop.className = "f2c-popover";
    pop.style.left = pin.x + "px";
    pop.style.top = pin.y + "px";
```

Replace with:

```js
    var pop = document.createElement("div");
    pop.className = "f2c-popover";
    var anchorX = pin.x;
    var anchorY = pin.y;
    pop.style.left = anchorX + "px";
    pop.style.top = anchorY + "px";

    var POPOVER_WIDTH = 280;
    var GAP = 8;
    var viewportRight = (typeof window !== "undefined" ? window.innerWidth : 1000);
    var scrollX = (typeof window !== "undefined" ? window.scrollX || 0 : 0);
    if (anchorX + GAP + POPOVER_WIDTH > scrollX + viewportRight) {
      pop.classList.add("f2c-popover-flip");
    }
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm test -- tests/overlay.test.js`
Expected: PASS for flip cases AND all existing popover tests (point-pin popovers also benefit from the flip when near the right edge — that's intentional and consistent).

- [ ] **Step 6: Commit**

```bash
cd /Users/brookebekoff/feedback-to-cli
git add src/overlay.js tests/overlay.test.js
git commit -m "feat(overlay): flip popover anchor when near right viewport edge"
```

---

### Task 10: First-visit auto-arm

**Files:**
- Modify: `src/overlay.js`
- Modify: `tests/overlay.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/overlay.test.js`:

```js
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
    // simulate reload by clearing window state but keeping localStorage
    delete window.__f2c;
    document.body.innerHTML = "";
    await loadOverlay();
    expect(document.body.classList.contains("f2c-armed")).toBe(false);
    const armBtn = document.querySelector(".f2c-arm");
    expect(armBtn.textContent).toBe("off");
    expect(armBtn.classList.contains("f2c-armed-on")).toBe(false);
  });

  it("re-arms on first visit to a different pathname", async () => {
    await loadOverlay();
    delete window.__f2c;
    document.body.innerHTML = "";
    Object.defineProperty(window, "location", {
      value: { pathname: "/other", href: "http://localhost/other" },
      writable: true,
      configurable: true,
    });
    await loadOverlay();
    expect(document.body.classList.contains("f2c-armed")).toBe(true);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm test -- tests/overlay.test.js`
Expected: FAIL — overlay still hard-codes `armed = true`.

- [ ] **Step 3: Add `makeSeenKey` to inlined core helpers in overlay**

In `src/overlay.js`, add to the inlined helpers block at the top of the IIFE:

```js
  function makeSeenKey(ns, p) {
    return `feedback-to-cli:${ns}:${p}:seen`;
  }
```

- [ ] **Step 4: Replace the initial `armed` declaration**

In `src/overlay.js`, find:

```js
  var armed = true;
```

Replace with:

```js
  var seenKey = makeSeenKey(namespace, pathname);
  var hasSeen = false;
  try {
    hasSeen = !!localStorage.getItem(seenKey);
  } catch (_) {
    hasSeen = false;
  }
  var armed = !hasSeen;
  try {
    localStorage.setItem(seenKey, "1");
  } catch (_) {}
```

- [ ] **Step 5: Update `buildToolbar()` to reflect initial armed state**

In `src/overlay.js`, find this in `buildToolbar`:

```js
    toolbar.innerHTML =
      '<span class="f2c-count">' +
      '\u{1F4AC} <span class="f2c-n">0</span>' +
      "</span>" +
      '<button class="f2c-arm f2c-armed-on">on</button>' +
      '<button class="f2c-clear">clear</button>' +
      '<button class="f2c-copy f2c-primary">copy all</button>';
```

Replace with:

```js
    var armBtnClass = armed ? "f2c-arm f2c-armed-on" : "f2c-arm";
    var armBtnText = armed ? "on" : "off";
    toolbar.innerHTML =
      '<span class="f2c-count">' +
      '\u{1F4AC} <span class="f2c-n">0</span>' +
      "</span>" +
      '<button class="' + armBtnClass + '">' + armBtnText + '</button>' +
      '<button class="f2c-clear">clear</button>' +
      '<button class="f2c-copy f2c-primary">copy all</button>';
```

- [ ] **Step 6: Run tests**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm test -- tests/overlay.test.js`
Expected: PASS for auto-arm cases AND all existing tests.

- [ ] **Step 7: Commit**

```bash
cd /Users/brookebekoff/feedback-to-cli
git add src/overlay.js tests/overlay.test.js
git commit -m "feat(overlay): auto-arm on first visit per pathname, off on reload"
```

---

### Task 11: End-to-end Playwright spec for region pin flow

**Files:**
- Create: `tests/e2e/region-pin.spec.ts`

- [ ] **Step 1: Inspect the existing e2e setup**

Run: `cd /Users/brookebekoff/feedback-to-cli && cat tests/e2e.spec.ts | head -40`
Note the pattern (page setup, fixture HTML, how `dist/feedback-to-cli.js` is loaded). The new spec follows the same pattern.

- [ ] **Step 2: Build the bundle so the e2e test loads the latest overlay**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm run build`

- [ ] **Step 3: Create the spec file**

Create `tests/e2e/region-pin.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const overlayBundle = readFileSync(join(__dirname, "..", "..", "dist", "feedback-to-cli.js"), "utf8");

const fixture = `
<!doctype html>
<html><body>
  <section id="hero" style="position:absolute;left:50px;top:50px;width:600px;height:300px;background:#eee;">
    <h1 style="position:absolute;left:80px;top:80px;width:300px;height:40px;">Hello</h1>
    <p style="position:absolute;left:80px;top:140px;width:300px;height:40px;">World copy</p>
    <button style="position:absolute;left:80px;top:200px;width:100px;height:30px;">CTA</button>
  </section>
  <script>${"OVERLAY_PLACEHOLDER"}</script>
</body></html>
`;

test("drag → region pin → save note → copy markdown contains region fields", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setContent(fixture.replace("OVERLAY_PLACEHOLDER", overlayBundle));

  // Drag a region across the hero section
  await page.mouse.move(80, 80);
  await page.mouse.down();
  await page.mouse.move(420, 250, { steps: 10 });
  await page.mouse.up();

  // Region should render
  await expect(page.locator(".f2c-region")).toBeVisible();
  await expect(page.locator(".f2c-region-tag")).toHaveText("#1");

  // Popover opens after commit
  const popover = page.locator(".f2c-popover");
  await expect(popover).toBeVisible();

  // Type a note and save
  await popover.locator("textarea").fill("two-column on desktop");
  await popover.locator(".f2c-save").click();

  // Copy all, then read clipboard
  await page.locator(".f2c-copy").click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());

  expect(clipboard).toContain("## Pin #1");
  expect(clipboard).toContain("**Container:**");
  expect(clipboard).toContain("**Contains:**");
  expect(clipboard).toContain("**Size:**");
  expect(clipboard).toContain("two-column on desktop");
});

test("small click (≤6px) creates a point pin, not a region", async ({ page }) => {
  await page.setContent(fixture.replace("OVERLAY_PLACEHOLDER", overlayBundle));

  await page.mouse.move(200, 200);
  await page.mouse.down();
  await page.mouse.move(203, 202);
  await page.mouse.up();

  await expect(page.locator(".f2c-pin")).toBeVisible();
  await expect(page.locator(".f2c-region")).toHaveCount(0);
});
```

- [ ] **Step 4: Run the e2e suite**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm run test:e2e`
Expected: PASS for both new cases AND any existing e2e tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/brookebekoff/feedback-to-cli
git add tests/e2e/region-pin.spec.ts
git commit -m "test(e2e): cover region pin drag → save → copy flow"
```

---

### Task 12: Final regression sweep + bundle build

**Files:**
- (no source changes)

- [ ] **Step 1: Run the full test suite**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm test`
Expected: All vitest specs PASS.

- [ ] **Step 2: Run the e2e suite**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm run test:e2e`
Expected: All Playwright specs PASS.

- [ ] **Step 3: Build the dist bundle**

Run: `cd /Users/brookebekoff/feedback-to-cli && npm run build`
Expected: `dist/feedback-to-cli.js` rebuilt.

- [ ] **Step 4: Manual smoke test (optional but recommended)**

Open `examples/static-html/index.html` (or any local fixture that loads `dist/feedback-to-cli.js`) in a browser:
- First load → overlay armed (toolbar shows "on")
- Click anywhere → point pin
- Drag anywhere → region pin with corner tag
- Reload → overlay disarmed (toolbar shows "off")
- Toggle arm back on → drag works again
- "copy all" → clipboard contains a `Pin #N` for each, with region pins showing `Container/Contains/Size` lines

- [ ] **Step 5: Commit the rebuilt dist**

```bash
cd /Users/brookebekoff/feedback-to-cli
git add dist/
git commit -m "build: rebuild dist bundle with region pins + auto-arm"
```
