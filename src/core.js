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
