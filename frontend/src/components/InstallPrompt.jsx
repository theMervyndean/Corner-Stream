import React, { useEffect, useState } from "react";
import { X, Smartphone, Share } from "lucide-react";

const DISMISS_KEY = "cs_install_dismissed_v1";
const DISMISS_DAYS = 7; // hide for 7 days after a user closes the prompt

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true ||
    document.referrer.startsWith("android-app://")
  );
}

function isIOS() {
  const ua = window.navigator.userAgent || "";
  // iPad on iPadOS 13+ reports as Mac — also detect via touch + Mac
  const iPadOS = /Mac/.test(ua) && typeof document !== "undefined" && "ontouchend" in document;
  return /iPhone|iPad|iPod/.test(ua) || iPadOS;
}

function isSafari() {
  const ua = window.navigator.userAgent || "";
  // Safari but NOT Chrome / CriOS / FxiOS / EdgiOS
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome/i.test(ua);
}

function isDismissed() {
  try {
    const ts = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
    if (!ts) return false;
    const age = (Date.now() - ts) / (1000 * 60 * 60 * 24);
    return age < DISMISS_DAYS;
  } catch {
    return false;
  }
}

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [variant, setVariant] = useState(null); // 'android' | 'ios'
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    if (isStandalone()) return; // already installed
    if (isDismissed()) return;

    // Android / Chrome desktop: capture install prompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVariant("android");
      // Slight delay so the banner doesn't pop instantly on first paint
      setTimeout(() => setShow(true), 1500);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS Safari: no install event — show manual instructions
    if (isIOS() && isSafari()) {
      setVariant("ios");
      setTimeout(() => setShow(true), 2500);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {
      // ignore localStorage errors (private browsing, etc.)
    }
    setShow(false);
  };

  const installAndroid = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch {
      // ignore — install dialog cancellation is fine
    }
    setDeferredPrompt(null);
    setShow(false);
  };

  if (!show || !variant) return null;

  // ---------- iOS banner ----------
  if (variant === "ios") {
    return (
      <div
        className="fixed left-3 right-3 bottom-3 sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm z-[10000]"
        data-testid="install-prompt-ios"
      >
        <div className="cs-card p-4 border-2 border-[#0056B3]/20 shadow-2xl bg-white">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg cs-bg-navy text-white flex items-center justify-center flex-shrink-0">
              <Smartphone size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-bold cs-text-navy text-sm">
                Install Corner Streams
              </div>
              <p className="text-[12px] text-slate-600 mt-1 leading-snug">
                Get the app on your home screen — no App Store needed.
              </p>
              <ol className="text-[12px] text-slate-700 mt-2 space-y-1 leading-snug">
                <li>
                  1. Tap the <Share size={12} className="inline -mt-0.5 cs-text-blue" /> <span className="font-semibold">Share</span> icon below
                </li>
                <li>
                  2. Scroll & tap <span className="font-semibold cs-text-blue">"Add to Home Screen"</span>
                </li>
                <li>
                  3. Tap <span className="font-semibold cs-text-blue">Add</span> — done!
                </li>
              </ol>
              <div className="mt-2 text-[10px] text-slate-400 italic">
                Tip: only works in Safari, not Chrome on iPhone.
              </div>
            </div>
            <button
              onClick={dismiss}
              className="text-slate-400 hover:text-slate-600 flex-shrink-0 p-1"
              aria-label="Dismiss"
              data-testid="install-prompt-dismiss"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Android / desktop Chrome banner ----------
  return (
    <div
      className="fixed left-3 right-3 bottom-3 sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm z-[10000]"
      data-testid="install-prompt-android"
    >
      <div className="cs-card p-4 border-2 border-[#28A745]/30 shadow-2xl bg-white">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg cs-bg-green text-white flex items-center justify-center flex-shrink-0">
            <Smartphone size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold cs-text-navy text-sm">
              Install Corner Streams
            </div>
            <p className="text-[12px] text-slate-600 mt-1 leading-snug">
              Add to your home screen for one-tap access.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={installAndroid}
                className="px-3 py-1.5 rounded-full cs-bg-green text-white text-xs font-semibold hover:opacity-90"
                data-testid="install-prompt-install"
              >
                Install
              </button>
              <button
                onClick={dismiss}
                className="px-3 py-1.5 rounded-full text-slate-500 text-xs font-semibold hover:bg-slate-100"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="text-slate-400 hover:text-slate-600 flex-shrink-0 p-1"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
