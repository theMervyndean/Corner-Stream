import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// ─── Global ResizeObserver loop-error suppression ───────────────────────────
// Chromium fires "ResizeObserver loop completed with undelivered notifications"
// as a benign noise event whenever observers cascade in a single frame (common
// with chart/table layout libraries). The CRA / webpack dev overlay treats it
// as a runtime crash and pops an ugly red overlay over the entire app.
//
// Robust suppression requires THREE layers because the CRA overlay hooks into
// window.onerror BEFORE user-land listeners fire in the bubble phase:
//   1. capture-phase 'error' listener — runs before any bubble-phase handler
//   2. capture-phase 'unhandledrejection' listener — covers promise paths
//   3. wrap ResizeObserver itself with rAF so cascading notifications don't
//      synchronously re-trigger the loop on the next frame.
const RO_LOOP_MSG = "ResizeObserver loop completed with undelivered notifications";
const RO_LOOP_LEGACY = "ResizeObserver loop limit exceeded";
const isROError = (msg) => typeof msg === "string" && (msg.includes(RO_LOOP_MSG) || msg.includes(RO_LOOP_LEGACY));

window.addEventListener(
  "error",
  (e) => {
    if (isROError(e?.message)) {
      e.stopImmediatePropagation();
      e.stopPropagation();
      e.preventDefault();
      return false;
    }
  },
  true, // capture phase — beats CRA's bubble-phase overlay handler
);

window.addEventListener(
  "unhandledrejection",
  (e) => {
    const msg = String(e?.reason?.message || e?.reason || "");
    if (isROError(msg)) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  },
  true,
);

// Wrap ResizeObserver to debounce its callback into the next animation frame.
// This is the upstream-recommended fix that breaks the cascade BEFORE the
// browser fires the loop-error event in the first place.
if (typeof window !== "undefined" && typeof window.ResizeObserver !== "undefined") {
  const NativeRO = window.ResizeObserver;
  class DebouncedResizeObserver extends NativeRO {
    constructor(cb) {
      super((entries, observer) => {
        window.requestAnimationFrame(() => {
          if (!Array.isArray(entries) || !entries.length) return;
          try { cb(entries, observer); } catch (_err) { /* swallow per spec */ }
        });
      });
    }
  }
  window.ResizeObserver = DebouncedResizeObserver;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register PWA service worker — required by iOS Safari for "Add to Home Screen"
// to create a true installed app (not just a bookmark).
// We register on any HTTPS origin (preview, staging, production).
if ("serviceWorker" in navigator) {
  const isSecure = window.location.protocol === "https:" || window.location.hostname === "localhost";
  if (isSecure) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => console.log("[PWA] Service worker registered:", reg.scope))
        .catch((err) => console.warn("[PWA] Service worker failed:", err));
    });
  }
}
