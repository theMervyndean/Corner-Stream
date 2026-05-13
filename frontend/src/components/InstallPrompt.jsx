import React, { useEffect, useState } from "react";
import { X, Smartphone } from "lucide-react";

const DISMISS_KEY = "cs_install_dismissed_v1";
const DISMISS_DAYS = 7; // hide for 7 days after a user closes the prompt

// Real Apple-style Share icon — square with up arrow
function AppleShareIcon({ size = 16, className = "" }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

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
        className="fixed left-3 right-3 bottom-3 sm:left-auto sm:right-4 sm:bottom-4 sm:max-w-sm z-[10000] cs-ios-banner-anim"
        data-testid="install-prompt-ios"
      >
        <div className="cs-card p-4 border-2 border-[#0056B3] shadow-2xl bg-white relative">
          <button
            onClick={dismiss}
            className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 p-1"
            aria-label="Dismiss"
            data-testid="install-prompt-dismiss"
          >
            <X size={16} />
          </button>

          <div className="flex items-start gap-3 pr-5">
            <div className="w-10 h-10 rounded-lg cs-bg-navy text-white flex items-center justify-center flex-shrink-0">
              <Smartphone size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-bold cs-text-navy text-sm">
                Install Corner Streams
              </div>
              <p className="text-[12px] text-slate-600 mt-0.5 leading-snug">
                Add to your iPhone home screen — no App Store.
              </p>
            </div>
          </div>

          {/* Step-by-step with proper Apple Share icon */}
          <ol className="mt-3 space-y-2 text-[13px] text-slate-800">
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full cs-bg-blue text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
              <span className="leading-snug">
                Tap the <span className="inline-flex items-center justify-center w-6 h-6 rounded border border-slate-300 align-middle mx-0.5 cs-text-blue"><AppleShareIcon size={14} /></span> <strong>Share</strong> button in Safari (toolbar at the <strong>bottom of the screen</strong>)
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full cs-bg-blue text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
              <span className="leading-snug">
                Scroll down and tap <strong>"Add to Home Screen"</strong>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full cs-bg-blue text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
              <span className="leading-snug">
                Tap <strong>Add</strong> in the top-right corner. Done!
              </span>
            </li>
          </ol>

          {/* Animated arrow pointing DOWN to Safari's bottom toolbar */}
          <div className="mt-3 flex flex-col items-center">
            <div className="text-[10px] text-slate-400 font-medium">↓ Safari toolbar is here ↓</div>
            <div className="cs-bounce-down mt-1">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0056B3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>

          <div className="mt-2 px-2 py-1.5 rounded bg-amber-50 border border-amber-200">
            <div className="text-[11px] text-amber-800 leading-tight">
              ⚠️ <strong>Must use Safari</strong> — Chrome on iPhone can't install apps.
            </div>
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
