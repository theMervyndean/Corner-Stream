import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Lock, Copy, Upload, MessageCircle, CheckCircle2 } from "lucide-react";

const TIERS = [
  { v: "cbt_essentials", l: "CBT Essentials", prices: { "1_term": 40000, "2_terms": 70000, full_session: 110000 } },
  { v: "digital_reports", l: "Digital Reports", prices: { "1_term": 50000, "2_terms": 90000, full_session: 140000 } },
  { v: "financial_ledger", l: "Financial Ledger", prices: { "1_term": 40000, "2_terms": 70000, full_session: 110000 } },
  { v: "unified_enterprise", l: "Unified Enterprise", prices: { "1_term": null, "2_terms": null, full_session: 200000 } },
];
const DURATIONS = [
  { v: "1_term", l: "1 Term" },
  { v: "2_terms", l: "2 Terms" },
  { v: "full_session", l: "Full Session" },
];

/**
 * In-dashboard lock screen shown when school.verification_status !== "active".
 * Same UX as the public /pending page but lives inside the school admin dashboard.
 * On code-match: dashboard unlocks instantly (no super admin click needed).
 */
export default function LockedOverlay({ school, onUnlocked }) {
  const [tier, setTier] = useState("digital_reports");
  const [duration, setDuration] = useState("1_term");
  const [receiptFile, setReceiptFile] = useState(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const amount = useMemo(() => {
    const t = TIERS.find((x) => x.v === tier);
    return t?.prices?.[duration] ?? null;
  }, [tier, duration]);

  const copy = (text, label) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast.error("Receipt too large (max 2MB)"); return; }
    const reader = new FileReader();
    reader.onload = () => setReceiptFile(reader.result);
    reader.readAsDataURL(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!amount) { toast.error("This duration is not available for the selected tier."); return; }
    if (!receiptFile) { toast.error("Please upload your bank receipt."); return; }
    if (!code.trim()) { toast.error("Type the 6-digit code Corner Streams sent you on WhatsApp."); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post(`/payments/submit-verification?code=${encodeURIComponent(code.trim())}`, {
        tier, duration,
        amount_ngn: amount,
        file_data_url: receiptFile,
        note: `In-dashboard activation · ${school?.name || ""}`,
      });
      if (data.activated) {
        toast.success("Dashboard unlocked. Welcome to Corner Streams.");
        onUnlocked && onUnlocked();
      } else {
        toast.info(data.message || "Receipt received — Super Admin will activate within hours.");
      }
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge =
    school?.verification_status === "rejected"
      ? <span className="inline-block text-xs font-semibold px-2 py-1 rounded bg-red-100 text-red-700">REJECTED</span>
      : school?.verification_status === "pending_code"
      ? <span className="inline-block text-xs font-semibold px-2 py-1 rounded bg-amber-100 text-amber-700">AWAITING SUPER ADMIN</span>
      : <span className="inline-block text-xs font-semibold px-2 py-1 rounded bg-slate-100 text-slate-600">PENDING PAYMENT</span>;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm overflow-y-auto" data-testid="locked-overlay">
      <div className="min-h-screen flex items-start justify-center p-4 sm:p-10">
        <div className="cs-card bg-white w-full max-w-2xl p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-lg cs-bg-navy text-white flex items-center justify-center flex-shrink-0"><Lock size={22} /></div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="eyebrow">DASHBOARD LOCKED</span>
                {statusBadge}
              </div>
              <h2 className="font-display text-2xl font-bold cs-text-navy mt-1">
                Input password to access your school
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                {school?.name || "Your school"} is awaiting payment activation. Complete the 3 steps below and your dashboard unlocks immediately.
              </p>
            </div>
          </div>

          {/* STEP 1 — bank box */}
          <div className="mt-5 p-4 rounded-lg" style={{ backgroundColor: "#E8F5EB", border: "1px solid #28A745" }}>
            <div className="eyebrow cs-text-green">STEP 1 · TRANSFER</div>
            <div className="mt-2 grid sm:grid-cols-3 gap-3 text-sm">
              <div><div className="text-xs text-slate-500">Bank</div><div className="font-semibold cs-text-navy">UBA</div></div>
              <div>
                <div className="text-xs text-slate-500">Account number</div>
                <div className="flex items-center gap-2">
                  <div className="font-mono font-semibold cs-text-navy">2936722942</div>
                  <button onClick={() => copy("2936722942", "Account number")} type="button" className="text-slate-500 hover:cs-text-navy"><Copy size={14} /></button>
                </div>
              </div>
              <div><div className="text-xs text-slate-500">Account name</div><div className="font-semibold cs-text-navy text-xs sm:text-sm">Mervyndean Ifeanyichukwu Hilary</div></div>
            </div>
          </div>

          {/* tier + amount */}
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tier</Label>
              <select className="mt-1 w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white" value={tier} onChange={(e) => setTier(e.target.value)} data-testid="locked-tier">
                {TIERS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Duration</Label>
              <select className="mt-1 w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white" value={duration} onChange={(e) => setDuration(e.target.value)} data-testid="locked-duration">
                {DURATIONS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
              </select>
            </div>
          </div>
          {amount ? (
            <div className="mt-2 font-display text-xl font-bold cs-text-navy" data-testid="locked-amount">Transfer ₦{amount.toLocaleString()}</div>
          ) : (
            <div className="mt-2 text-amber-700 text-sm">Not available — Unified Enterprise is Full Session only.</div>
          )}

          {/* STEP 2 — WhatsApp deep link */}
          <div className="mt-5 p-4 rounded-lg border border-slate-200">
            <div className="eyebrow cs-text-blue">STEP 2 · WHATSAPP</div>
            <p className="text-sm text-slate-600 mt-1">
              After transferring, message <b>+234 814 188 0550</b> with your school name and email. You'll receive a 6-digit code by WhatsApp.
            </p>
            <a href={`https://wa.me/2348141880550?text=${encodeURIComponent(`Hello Corner Streams — I just paid for ${school?.name || ""}. Tier: ${tier}, Duration: ${duration}. Please send my activation code.`)}`}
               target="_blank" rel="noreferrer"
               className="inline-flex items-center gap-2 mt-2 rounded-full text-white font-semibold px-4 h-9 text-sm"
               style={{ backgroundColor: "#25D366" }}
               data-testid="locked-whatsapp-link"><MessageCircle size={14} /> Open WhatsApp</a>
          </div>

          {/* STEP 3 — receipt + code */}
          <form onSubmit={submit} className="mt-5 p-4 rounded-lg border-2 cs-border-navy" style={{ borderColor: "#002147" }}>
            <div className="eyebrow cs-text-navy">STEP 3 · UPLOAD RECEIPT + ENTER PASSWORD</div>
            <div className="mt-3 grid gap-3">
              <div>
                <Label className="text-xs">Bank transfer receipt (image or PDF · max 2MB)</Label>
                <div className="mt-1 flex items-center gap-2 border border-dashed border-slate-300 rounded p-2">
                  <Upload size={14} className="text-slate-400" />
                  <input type="file" accept="image/*,application/pdf" onChange={onFile} className="text-xs" data-testid="locked-receipt-file" />
                  {receiptFile && <CheckCircle2 size={14} className="text-green-600" />}
                </div>
              </div>
              <div>
                <Label className="text-xs">6-digit activation password (from WhatsApp)</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  inputMode="numeric"
                  className="font-mono text-lg tracking-widest text-center"
                  data-testid="locked-code"
                />
              </div>
            </div>
            <Button type="submit" disabled={submitting} className="cs-bg-navy text-white hover:opacity-90 w-full rounded-full h-11 mt-4 btn-anim" data-testid="locked-submit">
              {submitting ? "Submitting…" : "Unlock dashboard"}
            </Button>
          </form>

          <div className="mt-4 text-[11px] text-slate-500 text-center">
            Need help? WhatsApp +234 814 188 0550 with your school name.
          </div>
        </div>
      </div>
    </div>
  );
}
