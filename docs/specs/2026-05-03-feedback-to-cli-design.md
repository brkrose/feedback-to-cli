# feedback-to-cli — design

> Drop one script tag on any locally-served page and get click-to-pin feedback that exports straight to your AI assistant.

**Status:** design approved 2026-05-03
**Repo:** `brkrose/feedback-to-cli` (to be created), MIT
**Distribution:** npm + unpkg as `feedback-to-cli`

---

## Why

Building product with an AI assistant means a lot of "see this, fix this" loops. Today the loop is: screenshot → describe in words → paste. Lossy and slow.

`feedback-to-cli` collapses that to: click on the thing → type a sentence → "copy all" → paste markdown back to your CLI. With the optional companion process, the paste step disappears too — pins land in `.feedback-to-cli/<page>.md` that the assistant reads directly.

The audience is anyone vibe-coding with Claude Code, Cursor, Copilot CLI, or similar. The tool is framework-agnostic by design — anything that renders HTML on `localhost` works.

---

## Architecture

One npm package, two install paths.

### The script (primary)

`feedback-to-cli.js` — self-contained IIFE published to npm + unpkg. Drop-in:

```html
<script src="https://unpkg.com/feedback-to-cli@1"></script>
```

- Mounts a click-to-pin overlay on top of the host page.
- Pins persist in `localStorage` keyed by `pathname`.
- Toolbar bottom-right with pin count, on/off toggle, clear, "copy all".
- "Copy all" emits markdown to the clipboard.

Works on static HTML, Next.js dev, Vite dev, Astro dev — any page rendered locally. The user adds the script tag deliberately so we don't need to gate by `NODE_ENV`; the user controls when it's loaded.

### The companion (optional)

`npx feedback-to-cli serve` — a small Node script (Node `http` only, no deps). Listens on `127.0.0.1:9091`. The overlay auto-detects it once at boot via `GET /ping`. If detected, every pin save also POSTs to the companion, which writes/updates `.feedback-to-cli/<page-slug>.md` in the cwd of the companion.

Both paths work independently. The script alone is fully usable; the companion is a power-user upgrade.

---

## Repo structure

```
feedback-to-cli/
  src/
    overlay.js                 # source IIFE (~300 lines, lifted from sublease-app's _feedback.js)
  bin/
    cli.js                     # `feedback-to-cli serve` entry
  dist/
    feedback-to-cli.js         # built (minified overlay), prepublish
  examples/
    static-html/index.html     # plain HTML with the script tag
    nextjs/README.md           # snippet for app/layout.tsx
    vite/README.md             # snippet for index.html
  tests/
    overlay.test.ts            # vitest in jsdom — markdown export, pin upsert logic
    cli.test.ts                # vitest spawning server on random port — ping/pin/clear
    e2e.spec.ts                # playwright — load static-html, place pin, assert clipboard
  README.md                    # pitch + install + gif demo
  package.json                 # name, bin, files, exports, unpkg
  LICENSE                      # MIT
  .github/workflows/release.yml  # tag → npm publish (v2)
```

`package.json` essentials:

```jsonc
{
  "name": "feedback-to-cli",
  "version": "0.1.0",
  "type": "module",
  "bin": { "feedback-to-cli": "./bin/cli.js" },
  "files": ["dist", "bin", "README.md", "LICENSE"],
  "exports": { ".": "./dist/feedback-to-cli.js" },
  "unpkg": "dist/feedback-to-cli.js"
}
```

---

## Data flow

### Pin lifecycle

1. User clicks anywhere on the host page → pin placed at `(pageX, pageY)`, popover opens with the targeted element's tag + first 60 chars of text.
2. User types a note → "save" → pin written to `localStorage["feedback-to-cli:<namespace>:<pathname>"]`.
3. If the companion was detected at boot, the same save fires `POST http://localhost:9091/pin` with `{page, pin}`. Companion appends/upserts in `.feedback-to-cli/<page-slug>.md`.
4. "Copy all" composes a markdown doc of all pins for the current pathname → clipboard. Always works whether the companion is up or not.

### Companion HTTP API

Three routes, no deps beyond Node `http`:

- `GET /ping` → `200 {ok:true}` (used for one-time detection at script boot — if the user starts the companion mid-session, they need a page reload for the overlay to start posting)
- `POST /pin` `{page, pin: {id, target, note, ts}}` → upserts the pin block in `.feedback-to-cli/<slug>.md` keyed by `pin.id`. Deletes the block when `note === null`.
- `POST /clear` `{page}` → wipes the file for that page.

CORS: `Access-Control-Allow-Origin: *`. Safe because the server only binds `127.0.0.1` and the user starts it themselves.

Slug rule: `pathname` with leading `/` stripped, remaining `/` → `_`, empty → `root`. So `/home` → `home.md`, `/east-village/abc` → `east-village_abc.md`, `/` → `root.md`.

### Markdown export format

What lands in the clipboard AND in `.feedback-to-cli/<slug>.md`:

```md
# Feedback on /home

Total pins: 3

## Pin #1
**Target:** `<button> List Yours →`
**Note:** make this primary, not ghost

## Pin #2
**Target:** `<h1> NYC's only short-term rental search…`
**Note:** _(empty)_

## Pin #3
**Target:** `<section> Just listed`
**Note:** rail title should be sentence case
```

Pins sorted by `id` ascending. Empty notes show `_(empty)_` so it's visible they exist but unfilled.

---

## Customization

Two `data-*` attributes on the script tag, nothing else:

```html
<script
  src="https://unpkg.com/feedback-to-cli@1"
  data-namespace="my-app"          <!-- optional: prefix for localStorage key, default "default" -->
  data-companion-port="9091"       <!-- optional: change if 9091 is taken -->
></script>
```

No theming, no positioning, no programmatic API. Toolbar always bottom-right; pin colors stay the brutalist plum/orange palette inherited from `_feedback.js`. Defer theming to v2 if anyone asks.

---

## Testing

- **`tests/overlay.test.ts`** — vitest in jsdom. Coverage: pin upsert, pin delete, markdown composition, localStorage key composition (with + without `data-namespace`), companion-detection branch (mocked `fetch`).
- **`tests/cli.test.ts`** — vitest spawning the companion on a random port. Coverage: `GET /ping` returns ok, `POST /pin` writes the file with correct slug, `POST /clear` removes it, two pins on the same page upsert correctly without duplication.
- **`tests/e2e.spec.ts`** — playwright. Loads `examples/static-html/index.html`, places a pin via click, types a note, clicks "copy all", asserts clipboard contents.

---

## Out of scope for v1

- **Screenshot capture per pin** — needs `html2canvas` (heavy) or `getDisplayMedia` (consent prompt). v2 backlog.
- **Framework-specific adapters** (Next.js component, Vite plugin, Astro integration) — script tag works in all of them. Add only if usage signals demand.
- **Multi-user / cloud sync** — single-developer dev tool. localStorage only.
- **SPA cross-page aggregation in export** — copy-all is per-pathname; user navigates and copies again.
- **Auto-disable in production** — user controls the script tag. They can wrap it however they want (`{process.env.NODE_ENV === 'development' && <script>}`).
- **Theming, positioning, programmatic API** — see "Customization" above.

---

## Distribution + launch

1. **Repo:** create `brkrose/feedback-to-cli` public, MIT.
2. **First release:** `0.1.0` on npm, auto-mirrored to `https://unpkg.com/feedback-to-cli`.
3. **README:** screencast gif (place a pin, copy markdown, paste in Claude Code), one-line install, the "to-CLI" pitch.
4. **Soft launch:** post in vibe-coding circles (X, Hacker News Show HN, indie-hackers). Cross-link from `brookebuilds.stuff` portfolio.

---

## Success criteria

- A new user can install the script tag and place their first pin in <60 seconds from landing on the README.
- Markdown export is concise enough that pasting 5 pins into Claude Code produces actionable, reviewable feedback without trimming.
- Companion process starts in <1s and writes a pin to disk in <50ms.
- Zero runtime deps in the published bundle (vanilla JS only). One devDep tree (vitest + playwright).
