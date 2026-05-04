# Region Selection + First-Visit Auto-Arm

**Date:** 2026-05-04
**Status:** Approved, ready for implementation plan
**Scope:** Single increment to `src/overlay.js` (+ small test additions). No companion server changes.

## Why

Today, leaving feedback means clicking a single DOM node. That works when the feedback is about *this exact button*, but breaks down when the feedback is about *this whole hero section* or *the spacing in this card group*. Users either drop multiple pins to fence in the area or write paragraph-long notes describing what they mean.

Two changes:

1. **Region pins.** Drag to draw a rectangle; the rectangle is the feedback target. The AI gets a structured summary of what's inside.
2. **First-visit auto-arm.** The plugin arms itself the first time you open a localhost page, then defaults to off on every reload after. Removes the "wait, why is this overlay on every page forever" friction without losing the discoverability of the toolbar.

## Decisions (locked during brainstorming)

| # | Question | Decision |
|---|---|---|
| 1 | How to enter region mode? | Implicit gesture: drag >6px = region, ≤6px = point pin (today's behavior) |
| 2 | What does the region's `target` capture? | Closest common ancestor + child element list with counts |
| 3 | Visual rendering? | 2px dashed `#4f2d65` border + `rgba(79,45,101,0.12)` fill + numbered corner tag |
| 4 | Markdown output shape? | Same `## Pin #N` heading; regions get extra `Container/Contains/Size` fields |
| 5 | Editable after creation? | Immutable. Delete and redraw to change. |
| 6 | Auto-arm scope? | Per `(namespace, pathname)`, matching how pins are scoped |

## Architecture

All work lives in `src/overlay.js` with helper extraction to `src/core.js` for testability. No new files. No companion server changes (the `/pin` endpoint passes the pin object through unchanged, so new fields ride along automatically).

### Pin data shape (backwards compatible)

```js
{
  id, x, y, target, note, ts,            // existing — point pins look identical
  kind: 'point' | 'region',              // missing/undefined → 'point' (legacy)
  w, h,                                  // present only when kind === 'region'
  contains,                              // string like "<h2>, <p>, <button> ×2", region only
}
```

For regions, `(x, y)` is the **top-left corner** of the rectangle. `target` holds the closest common ancestor (e.g., `<section> About us`); `contains` holds the deduped child tag summary.

Old pins in `localStorage` (no `kind` field) are treated as `'point'`. Old `.feedback-to-cli/*.md` files keep their format because the composer is identical for point pins.

### Drag-detection mechanics

Replace the current single `click` listener with a `pointerdown` → `pointermove` → `pointerup` flow:

- **`pointerdown`** on armed body (not on toolbar/pin/region/popover): record `startX, startY`, capture pointer, mark `dragCandidate = true`. Nothing visible yet.
- **`pointermove`**: if `dragCandidate` and `dist > 6px`, switch to `dragging`. Show a live preview rectangle (same dashed border + translucent fill as the final region) anchored at the start point, sized to follow the pointer. Drag in any direction is supported — bounds are normalized to top-left + width/height on commit.
- **`pointerup`**:
  - if `dist ≤ 6px` → existing point-pin logic (extracted from `handleDocClick` into a shared `placePointPin(e)` helper)
  - if `dist > 6px` → commit a region pin: compute bounds, capture container + contains, persist, sync, render, open popover.
- **Escape during drag** → cancel preview, no pin created.
- **`pointercancel`** (system gesture, e.g., trackpad swipe) → treated like Escape.

Pointer events (not mouse events) so trackpad and touch behave correctly. The 6px threshold prevents accidental tiny drags.

### Region target capture

When the drag commits, walk every element whose bounding rect intersects the region box:

- **`target`** (Container): closest common ancestor of those elements. Walk up from the deepest common parent using `Element.contains()`.
- **`contains`**: unique tag list from those elements, with `×N` for tags appearing 2+ times. Capped at 8 entries; overflow becomes `+N more`.
- **Empty region** (covers only whitespace/body): fall back to `<body>` as container, `(empty region)` as contains.
- Skip our own overlay nodes (`.f2c-toolbar`, `.f2c-pin`, `.f2c-region`, `.f2c-region-tag`, `.f2c-popover`, `.f2c-toast`) when computing both.

### Visual rendering

**Live preview during drag:**
- Same dashed `2px #4f2d65` border + `rgba(79,45,101,0.12)` fill as the final region
- No corner tag yet (it's not a pin until pointerup)
- Renders inside the existing `.f2c-pin-layer` so it scrolls with the page

**Committed region:**
- Absolute-positioned `<div class="f2c-region">` at `(x, y)` with `width: w; height: h`
- Same border + fill as the preview
- A small `<div class="f2c-region-tag">` in the **top-left corner** — purple square (`#4f2d65`), `#N` in JetBrains Mono, brutalist drop-shadow matching the dot pin style
- `pointer-events: all` only on the tag, not the region body — so the translucent fill doesn't block clicks on the page underneath when the popover is closed
- Hover on the tag: `scale(1.15)` with a `0.1s` transition (same intent as the dot pin hover, but without the centering translate since the region tag is positioned at the corner, not centered on a point)

**Popover anchoring:**
- Anchored to the **bottom-left of the region tag**, with the existing `translate(8px, -8px)` offset adjusted so it doesn't overlap the region
- If the popover would clip past the right edge of the viewport, flip to the right side of the tag (small viewport-edge check using `getBoundingClientRect()`)

**Style additions** appended to the existing `injectStyles()` block. No rewrite of existing styles.

### Markdown output

`composeMarkdown()` (in `src/core.js`) gets one branch per pin based on `kind`. Numbering stays sequential across both types.

**Point pin (unchanged):**
```md
## Pin #1
**Target:** `<button> List Yours →`
**Note:** make this primary, not ghost
```

**Region pin (new shape):**
```md
## Pin #2
**Container:** `<section> About us`
**Contains:** `<h2>, <p>, <button> ×2`
**Size:** 320×180 at (140, 480)
**Note:** make this a 2-col grid on desktop
```

Empty notes still render `_(empty)_`. The companion server's `.feedback-to-cli/<page>.md` files use the exact same composer, so disk and clipboard stay in sync.

### First-visit auto-arm

Add one new `localStorage` key per page: `feedback-to-cli:${ns}:${pathname}:seen` (boolean string `"1"`).

In `boot()`, before applying the armed state:

```js
const seenKey = makeSeenKey(namespace, pathname);
const hasSeen = !!localStorage.getItem(seenKey);
armed = !hasSeen;                              // first visit → true; reload after → false
localStorage.setItem(seenKey, "1");            // mark this page seen
document.body.classList.toggle("f2c-armed", armed);
```

Toolbar reflects the initial state correctly:
- `arm` button text = `"on"` / `"off"` based on initial `armed`
- `f2c-armed-on` class toggled to match

Existing toggle handler is unchanged — once you flip it manually, it stays where you put it for the rest of the session. The `clear` button does **not** reset the seen flag (clearing pins is about content, not first-run state).

### Drag interactions / guards

- Dragging from inside an open popover or toolbar → ignored (existing `closest()` guard extended to `.f2c-region, .f2c-region-tag, .f2c-popover`)
- Dragging across or onto an existing pin/region → ignored at `pointerdown`, treated as a click on that pin/region
- `pointercancel` treated like Escape — abort preview, no pin

## Testing

Extend the existing Vitest suite in `tests/`:

**`core.test.js`** (new cases):
- `composeMarkdown` produces the existing shape for point pins (regression)
- `composeMarkdown` produces `Container/Contains/Size` lines for region pins
- Mixed list (point, region, point) numbers sequentially: `Pin #1, Pin #2, Pin #3`
- New helper `summarizeRegion(elements)` returns correct container + contains for: single child, multiple children of varied tags, repeated tags (count suffix), empty list, >8 unique tags (overflow `+N more`)
- Helper `makeSeenKey(ns, pathname)` returns expected key format

**`overlay.test.js`** (new cases):
- 6px threshold: simulated pointerdown → 5px pointermove → pointerup creates a point pin; 7px pointermove creates a region pin
- Escape during drag aborts preview, no pin in `pins`
- `pointercancel` during drag aborts preview, no pin
- Region click (on tag) opens popover anchored correctly
- Popover viewport-edge flip when region is near the right edge
- First boot on a fresh path → `armed === true`, body has `.f2c-armed`, `seen` key set
- Second boot on same path (seen key present) → `armed === false`, body lacks `.f2c-armed`
- Different pathname → armed again on first visit there
- User toggles off mid-session → reload → still off (no regression from auto-arm logic)

**Playwright** (new spec `tests/e2e/region-pin.spec.ts`):
- End-to-end: drag → region commits → popover opens → type note → save → `Copy all` → clipboard contains expected markdown with `Container/Contains/Size`

## Out of scope (explicitly)

- Resizable / repositionable regions (immutable by decision #5; redo via delete + redraw)
- Region nesting / overlap rules — overlapping regions are allowed and just paint on top of each other
- Companion server changes — `/pin` is generic enough; new fields ride along
- Migration of existing `localStorage` pins — they keep working as point pins via the legacy `kind === undefined` branch
