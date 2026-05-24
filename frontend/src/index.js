import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// ─── Global ResizeObserver loop-error suppression ───────────────────────────
// Chromium fires "ResizeObserver loop completed with undelivered notifications"
// as a benign noise event whenever observers cascade in a single frame (common
// with chart/table layout libraries). The CRA / webpack dev overlay treats it
// as a runtime crash and pops an ugly red overlay over the entire app. This
// listener swallows ONLY that specific message and lets every other error
// surface normally.
const RO_LOOP_MSG = "ResizeObserver loop completed with undelivered notifications";
const RO_LOOP_LEGACY = "ResizeObserver loop limit exceeded";
window.addEventListener("error", (e) => {
  if (e && typeof e.message === "string" && (e.message.includes(RO_LOOP_MSG) || e.message.includes(RO_LOOP_LEGACY))) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = String(e?.reason?.message || e?.reason || "");
  if (msg.includes(RO_LOOP_MSG) || msg.includes(RO_LOOP_LEGACY)) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

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
