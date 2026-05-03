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
