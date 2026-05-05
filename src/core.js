/**
 * @typedef {Object} Pin
 * @property {string} id
 * @property {string} target
 * @property {string} note
 * @property {number} ts
 * @property {number} x
 * @property {number} y
 */

const SLUG_MAX = 80;

export function slugForPath(pathname) {
  if (typeof pathname !== "string" || !pathname || pathname === "/") return "root";
  const stripped = pathname.replace(/^\//, "");
  if (stripped === "") return "root";
  return stripped.replace(/[^a-z0-9_-]/gi, "_").slice(0, SLUG_MAX);
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

const NOTE_MAX = 4000;
const TARGET_MAX = 200;

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function stripControl(s) {
  return typeof s === "string" ? s.replace(CONTROL_CHARS, "") : "";
}

function singleLine(s) {
  return stripControl(s).replace(/[\r\n]+/g, " ").trim();
}

function fenceFor(s) {
  const runs = s.match(/`+/g);
  const longest = runs ? Math.max(...runs.map((r) => r.length)) : 0;
  return "`".repeat(Math.max(3, longest + 1));
}

function inlineCode(s) {
  const runs = s.match(/`+/g);
  const longest = runs ? Math.max(...runs.map((r) => r.length)) : 0;
  const fence = "`".repeat(Math.max(1, longest + 1));
  const padded = s.startsWith("`") || s.endsWith("`") ? ` ${s} ` : s;
  return `${fence}${padded}${fence}`;
}

export function composeMarkdown(pathname, pins) {
  const lines = [];
  const safePath = singleLine(pathname);
  lines.push(`# Feedback on ${safePath}`, "");
  lines.push(`Total pins: ${pins.length}`, "");
  pins.forEach((pin, i) => {
    const note = stripControl(pin.note).slice(0, NOTE_MAX);
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
  return lines.join("\n").trimEnd() + "\n";
}

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

export function makeSeenKey(namespace, pathname) {
  return `feedback-to-cli:${namespace}:${pathname}:seen`;
}
