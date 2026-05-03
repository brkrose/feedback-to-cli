(function () {
  if (typeof window === "undefined") return;
  if (window.__f2c && !globalThis.__F2C_TEST__) return;

  // --- inlined core helpers (kept in sync with src/core.js) ---
  function slugForPath(p) {
    if (!p || p === "/") return "root";
    const stripped = p.replace(/^\//, "");
    if (stripped === "") return "root";
    return stripped.replace(/\//g, "_");
  }

  function makeKey(ns, p) {
    return `feedback-to-cli:${ns}:${p}`;
  }

  function upsertPin(pins, pin) {
    const idx = pins.findIndex((p) => p.id === pin.id);
    if (idx === -1) return [...pins, pin];
    const next = pins.slice();
    next[idx] = pin;
    return next;
  }

  function deletePin(pins, id) {
    return pins.filter((p) => p.id !== id);
  }

  function composeMarkdown(pathname, pins) {
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

  // --- config from script tag ---
  var script =
    document.currentScript ||
    Array.from(document.scripts).find(
      (s) => s.dataset && s.dataset.namespace !== undefined
    ) ||
    Array.from(document.scripts).find((s) =>
      /feedback-to-cli/.test(s.src || "")
    );
  var namespace =
    (script && script.dataset && script.dataset.namespace) || "default";
  var companionPort = Number(
    (script && script.dataset && script.dataset.companionPort) || 9091
  );
  var pathname = location.pathname;
  var key = makeKey(namespace, pathname);

  // --- state ---
  var pins = [];
  try {
    pins = JSON.parse(localStorage.getItem(key)) || [];
  } catch (_) {
    pins = [];
  }
  var companionUp = false;
  var activePopoverId = null;
  var armed = true;

  // --- persist + sync ---
  function persist() {
    localStorage.setItem(key, JSON.stringify(pins));
  }

  function syncToCompanion(pin) {
    if (!companionUp) return;
    fetch("http://127.0.0.1:" + companionPort + "/pin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page: pathname, pin: pin }),
    }).catch(function () {});
  }

  function syncClearToCompanion() {
    if (!companionUp) return;
    fetch("http://127.0.0.1:" + companionPort + "/clear", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page: pathname }),
    }).catch(function () {});
  }

  // --- actions ---
  function savePin(pin) {
    pins = upsertPin(pins, pin);
    persist();
    syncToCompanion(pin);
    render();
  }

  function removePin(id) {
    pins = deletePin(pins, id);
    persist();
    syncToCompanion({ id: id, note: null });
    render();
  }

  function clearAll() {
    pins = [];
    persist();
    syncClearToCompanion();
    render();
  }

  function markdown() {
    return composeMarkdown(pathname, pins);
  }

  async function copyMarkdown() {
    var md = markdown();
    try {
      await navigator.clipboard.writeText(md);
      flashToast("Copied markdown to clipboard");
    } catch (_) {
      flashToast("Copy failed — see console");
      console.log(md);
    }
  }

  // --- styles ---
  function injectStyles() {
    if (document.getElementById("f2c-styles")) return;
    var style = document.createElement("style");
    style.id = "f2c-styles";
    style.textContent = [
      ".f2c-pin {",
      "  position: absolute;",
      "  width: 26px; height: 26px;",
      "  background: #4f2d65; color: white;",
      "  border: 2px solid #0a0a0a;",
      "  border-radius: 50%;",
      "  font: 700 11px 'JetBrains Mono', monospace;",
      "  display: flex; align-items: center; justify-content: center;",
      "  box-shadow: 2px 2px 0 #0a0a0a;",
      "  cursor: pointer; z-index: 9998;",
      "  transform: translate(-13px, -13px);",
      "  transition: transform 0.1s;",
      "  pointer-events: all;",
      "}",
      ".f2c-pin:hover { transform: translate(-13px, -13px) scale(1.15); }",
      ".f2c-pin.f2c-active { background: #ff7a2b; color: #0a0a0a; }",

      ".f2c-popover {",
      "  position: absolute; z-index: 9999;",
      "  width: 280px; background: white;",
      "  border: 2px solid #0a0a0a;",
      "  box-shadow: 4px 4px 0 #4f2d65;",
      "  padding: 12px;",
      "  transform: translate(8px, -8px);",
      "  pointer-events: all;",
      "}",
      ".f2c-popover .f2c-meta {",
      "  font: 700 10px 'JetBrains Mono', monospace;",
      "  color: #4f2d65; text-transform: uppercase;",
      "  letter-spacing: 0.06em; margin-bottom: 6px;",
      "  display: flex; justify-content: space-between; align-items: center;",
      "}",
      ".f2c-popover .f2c-target {",
      "  font: 11px 'JetBrains Mono', monospace;",
      "  color: #6e6e68; background: #fdfaf3;",
      "  border: 1px solid #ececea; padding: 4px 6px;",
      "  margin-bottom: 8px; max-height: 32px; overflow: hidden;",
      "  text-overflow: ellipsis; white-space: nowrap;",
      "}",
      ".f2c-popover textarea {",
      "  width: 100%; min-height: 70px;",
      "  border: 2px solid #0a0a0a; padding: 6px 8px;",
      "  font: 12px system-ui, sans-serif;",
      "  resize: vertical; box-sizing: border-box;",
      "  box-shadow: inset 1px 1px 0 #ececea;",
      "}",
      ".f2c-popover textarea:focus { outline: 2px solid #4f2d65; outline-offset: -1px; }",
      ".f2c-popover .f2c-actions {",
      "  display: flex; gap: 6px; margin-top: 8px; justify-content: flex-end;",
      "}",
      ".f2c-popover button {",
      "  font: 700 10px 'JetBrains Mono', monospace;",
      "  text-transform: uppercase; letter-spacing: 0.06em;",
      "  padding: 5px 10px; border: 2px solid #0a0a0a;",
      "  background: white; cursor: pointer;",
      "  box-shadow: 2px 2px 0 #0a0a0a;",
      "}",
      ".f2c-popover button.f2c-save { background: #d8e8d3; }",
      ".f2c-popover button.f2c-del { background: #ffd6d8; }",
      ".f2c-popover button:active { transform: translate(1px, 1px); box-shadow: none; }",

      ".f2c-toolbar {",
      "  position: fixed; bottom: 16px; right: 16px; z-index: 10000;",
      "  background: #0a0a0a; color: white;",
      "  border: 2px solid #0a0a0a;",
      "  box-shadow: 4px 4px 0 #4f2d65;",
      "  padding: 10px 12px;",
      "  display: flex; gap: 10px; align-items: center;",
      "  font: 700 11px 'JetBrains Mono', monospace;",
      "  user-select: none;",
      "}",
      ".f2c-toolbar .f2c-count {",
      "  background: #4f2d65; padding: 4px 8px;",
      "  border: 1px solid #fdfaf3; color: white;",
      "}",
      ".f2c-toolbar button {",
      "  font: 700 10px 'JetBrains Mono', monospace;",
      "  text-transform: uppercase; letter-spacing: 0.06em;",
      "  padding: 5px 10px; border: 2px solid #fdfaf3;",
      "  background: transparent; color: #fdfaf3; cursor: pointer;",
      "  box-shadow: 2px 2px 0 rgba(255,255,255,0.15);",
      "}",
      ".f2c-toolbar button.f2c-primary { background: #ff7a2b; color: #0a0a0a; border-color: #0a0a0a; box-shadow: 2px 2px 0 #0a0a0a; }",
      ".f2c-toolbar button:hover:not(.f2c-primary) { background: #4f2d65; }",
      ".f2c-toolbar button.f2c-primary:hover { background: #ff9651; }",
      ".f2c-toolbar button.f2c-armed-on { background: #4f2d65; color: #fdfaf3; border-color: #fdfaf3; }",

      ".f2c-toast {",
      "  position: fixed; bottom: 80px; right: 16px; z-index: 10001;",
      "  background: #d8e8d3; color: #0a0a0a;",
      "  border: 2px solid #0a0a0a;",
      "  box-shadow: 2px 2px 0 #0a0a0a;",
      "  padding: 10px 14px;",
      "  font: 700 11px 'JetBrains Mono', monospace;",
      "  animation: f2c-fade 2.4s ease-out forwards;",
      "}",
      "@keyframes f2c-fade {",
      "  0% { opacity: 0; transform: translateY(8px); }",
      "  15%, 75% { opacity: 1; transform: translateY(0); }",
      "  100% { opacity: 0; transform: translateY(-8px); }",
      "}",

      ".f2c-pin-layer {",
      "  position: absolute; top: 0; left: 0;",
      "  width: 100%; height: 100%;",
      "  pointer-events: none; z-index: 9998;",
      "}",

      "body.f2c-armed * { cursor: crosshair !important; }",
      "body.f2c-armed .f2c-pin, body.f2c-armed .f2c-popover,",
      "body.f2c-armed .f2c-toolbar, body.f2c-armed .f2c-toolbar * { cursor: pointer !important; }",
    ].join("\n");
    document.head.appendChild(style);
  }

  // --- helpers ---
  function targetSummary(el) {
    if (!el) return "(unknown)";
    var tag = el.tagName ? el.tagName.toLowerCase() : "?";
    var txt = ((el.textContent || "").trim().replace(/\s+/g, " ")).slice(0, 60);
    var suffix = (el.textContent || "").length > 60 ? "\u2026" : "";
    return "<" + tag + "> " + txt + suffix;
  }

  function genId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return String(Date.now()) + Math.random().toString(36).slice(2);
  }

  // --- DOM references ---
  var toolbar = null;
  var pinLayer = null;

  function closePopover() {
    document.querySelectorAll(".f2c-popover").forEach(function (p) {
      p.remove();
    });
    document.querySelectorAll(".f2c-pin").forEach(function (p) {
      p.classList.remove("f2c-active");
    });
    activePopoverId = null;
  }

  function renderPinDot(pin) {
    var el = document.createElement("div");
    el.className = "f2c-pin";
    el.textContent = "#";
    el.style.left = pin.x + "px";
    el.style.top = pin.y + "px";
    el.title = pin.note || "(no note)";
    el.dataset.id = pin.id;
    el.style.pointerEvents = "all";
    el.addEventListener("click", function (e) {
      e.stopPropagation();
      openPopover(pin, el);
    });
    return el;
  }

  function openPopover(pin, pinEl) {
    closePopover();
    if (pinEl) pinEl.classList.add("f2c-active");
    activePopoverId = pin.id;

    var pop = document.createElement("div");
    pop.className = "f2c-popover";
    pop.style.left = pin.x + "px";
    pop.style.top = pin.y + "px";

    var savedLabel = pin.note ? "\u2713 saved" : "\u25cb new";
    var safeTarget = (pin.target || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    var safeNote = (pin.note || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    pop.innerHTML =
      '<div class="f2c-meta">' +
      "<span>pin #" + safeTarget.slice(0, 12) + "</span>" +
      "<span>" + savedLabel + "</span>" +
      "</div>" +
      '<div class="f2c-target">' + safeTarget + "</div>" +
      '<textarea placeholder="note for claude...">' + safeNote + "</textarea>" +
      '<div class="f2c-actions">' +
      '<button class="f2c-del">delete</button>' +
      '<button class="f2c-save">save</button>' +
      "</div>";

    pop.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    document.body.appendChild(pop);

    var ta = pop.querySelector("textarea");
    if (ta) {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);

      ta.addEventListener("keydown", function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          var saveBtn = pop.querySelector(".f2c-save");
          if (saveBtn) saveBtn.click();
        }
      });
    }

    pop.querySelector(".f2c-save").addEventListener("click", function () {
      var note = ta ? ta.value.trim() : "";
      var updated = Object.assign({}, pin, { note: note });
      savePin(updated);
      closePopover();
      flashToast(note ? "pin saved" : "pin note cleared");
    });

    pop.querySelector(".f2c-del").addEventListener("click", function () {
      removePin(pin.id);
      closePopover();
      flashToast("pin deleted");
    });
  }

  function render() {
    // Update toolbar count
    if (toolbar) {
      var countEl = toolbar.querySelector(".f2c-n");
      if (countEl) countEl.textContent = pins.length;
    }

    // Re-render pin layer
    if (!pinLayer) return;
    // Remove existing pin dots (not popovers, those live on body)
    Array.from(pinLayer.querySelectorAll(".f2c-pin")).forEach(function (el) {
      el.remove();
    });
    pins.forEach(function (pin) {
      pinLayer.appendChild(renderPinDot(pin));
    });
  }

  function flashToast(msg) {
    var t = document.createElement("div");
    t.className = "f2c-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () {
      t.remove();
    }, 2400);
  }

  // --- companion detection ---
  function detectCompanion() {
    return fetch("http://127.0.0.1:" + companionPort + "/ping")
      .then(function (r) {
        companionUp = !!(r && r.ok);
      })
      .catch(function () {
        companionUp = false;
      });
  }

  // --- expose API ---
  window.__f2c = {
    key: key,
    pins: function () {
      return pins.slice();
    },
    savePin: savePin,
    removePin: removePin,
    clear: clearAll,
    markdown: markdown,
    copyMarkdown: copyMarkdown,
    get companionUp() {
      return companionUp;
    },
  };

  // --- boot ---
  function buildToolbar() {
    // Remove any existing toolbar from a previous IIFE run in test mode
    var existing = document.querySelector("[data-f2c-toolbar]");
    if (existing) existing.remove();

    toolbar = document.createElement("div");
    toolbar.className = "f2c-toolbar";
    toolbar.setAttribute("data-f2c-toolbar", "");
    toolbar.innerHTML =
      '<span class="f2c-count">' +
      '\u{1F4AC} <span class="f2c-n">0</span>' +
      "</span>" +
      '<button class="f2c-arm f2c-armed-on">on</button>' +
      '<button class="f2c-clear">clear</button>' +
      '<button class="f2c-copy f2c-primary">copy all</button>';

    toolbar.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    toolbar.querySelector(".f2c-arm").addEventListener("click", function () {
      armed = !armed;
      var btn = toolbar.querySelector(".f2c-arm");
      btn.textContent = armed ? "on" : "off";
      btn.classList.toggle("f2c-armed-on", armed);
      document.body.classList.toggle("f2c-armed", armed);
    });

    toolbar.querySelector(".f2c-clear").addEventListener("click", function () {
      if (!pins.length) {
        flashToast("no pins to clear");
        return;
      }
      clearAll();
      document.querySelectorAll(".f2c-popover").forEach(function (p) {
        p.remove();
      });
      activePopoverId = null;
      flashToast("all pins cleared");
    });

    toolbar.querySelector(".f2c-copy").addEventListener("click", function () {
      if (!pins.length) {
        flashToast("no pins to copy");
        return;
      }
      copyMarkdown().catch(function () {});
    });

    document.body.appendChild(toolbar);
  }

  function buildPinLayer() {
    var existing = document.querySelector(".f2c-pin-layer");
    if (existing) existing.remove();

    pinLayer = document.createElement("div");
    pinLayer.className = "f2c-pin-layer";
    document.body.appendChild(pinLayer);
  }

  function attachDocumentListeners() {
    // Use a named ref so re-runs in test mode don't double-stack handlers
    // (jsdom resets between imports, so this is just defensive)
    document.addEventListener("click", handleDocClick);
    document.addEventListener("keydown", handleDocKeydown);
  }

  function handleDocClick(e) {
    if (!armed) {
      closePopover();
      return;
    }
    if (
      e.target.closest &&
      e.target.closest(".f2c-pin, .f2c-popover, .f2c-toolbar")
    ) {
      return;
    }
    if (activePopoverId !== null) {
      closePopover();
      return;
    }
    // Place new pin
    var id = genId();
    var target = targetSummary(e.target);
    var pin = {
      id: id,
      x: e.pageX || 0,
      y: e.pageY || 0,
      target: target,
      note: "",
      ts: Date.now(),
    };
    pins = upsertPin(pins, pin);
    persist();
    syncToCompanion(pin);
    render();
    // Open popover for the newly placed pin
    var pinEl = pinLayer
      ? pinLayer.querySelector('[data-id="' + id + '"]')
      : null;
    openPopover(pin, pinEl);
  }

  function handleDocKeydown(e) {
    if (e.key === "Escape") closePopover();
  }

  function boot() {
    injectStyles();
    buildToolbar();
    buildPinLayer();
    attachDocumentListeners();

    // Initial armed state
    document.body.classList.toggle("f2c-armed", armed);

    detectCompanion().then(function () {
      if (companionUp) {
        pins.forEach(function (p) {
          syncToCompanion(p);
        });
      }
      render();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
