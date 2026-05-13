import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

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
