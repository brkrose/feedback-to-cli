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
