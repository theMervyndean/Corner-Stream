import React, { useState, useMemo } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import Navbar from "@/components/Navbar.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2, Copy, Upload, MessageCircle } from "lucide-react";

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

export default function PendingVerification() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const schoolEmail = params.get("email") || "";
  const schoolName = params.get("name") || "your school";
  const initialTier = params.get("tier") || "digital_reports";
  const initialDuration = params.get("duration") || "1_term";

  const [tier, setTier] = useState(initialTier);
  const [duration, setDuration] = useState(initialDuration);
  const [receiptFile, setReceiptFile] = useState(null);
  const [whatsappCode, setWhatsappCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

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
    if (!whatsappCode.trim()) { toast.error("Enter the 6-digit code Corner Streams sent you on WhatsApp."); return; }
    if (!schoolEmail) { toast.error("Missing school email — please register again."); return; }
    setSubmitting(true);
    try {
      await api.post("/payments/bank-receipt-public", {
        school_email: schoolEmail,
        tier, duration,
        amount_ngn: amount,
        file_data_url: receiptFile,
        whatsapp_code: whatsappCode.trim(),
        note: `School: ${schoolName} · Sender: ${schoolEmail}`,
      });
      setDone(true);
      toast.success("Receipt submitted — Super Admin will activate within hours.");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen">
        <Navbar variant="landing" />
        <div className="max-w-xl mx-auto px-6 pt-16 pb-20" data-testid="pending-done">
          <div className="cs-card p-10 text-center">
            <div className="mx-auto w-14 h-14 rounded-full cs-bg-green text-white flex items-center justify-center"><CheckCircle2 size={26} /></div>
            <h1 className="font-display text-3xl font-bold cs-text-navy mt-4">Receipt received</h1>
            <p className="text-slate-600 mt-3">
              Thank you. Super Admin is reviewing your payment now. Your dashboard will unlock within hours and you'll receive a WhatsApp confirmation on <b>your registered number</b>.
            </p>
            <p className="text-sm text-slate-500 mt-2">You can close this page and sign in once you receive the WhatsApp confirmation.</p>
            <Button onClick={() => navigate("/login")} className="cs-bg-navy text-white hover:opacity-90 rounded-full mt-6" data-testid="pending-go-login">Go to sign in</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar variant="landing" />
      <div className="max-w-3xl mx-auto px-6 pt-10 pb-20" data-testid="pending-page">
        <span className="eyebrow">FINAL STEP — ACTIVATE {schoolName.toUpperCase()}</span>
        <h1 className="font-display text-3xl font-bold cs-text-navy mt-1">Pay & verify to unlock your dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Three short steps. Most schools are activated the same day.</p>

        {/* Step 1: bank box */}
        <div className="cs-card mt-6 p-6 border-l-4" style={{ borderLeftColor: "#28A745" }}>
          <div className="eyebrow cs-text-green">STEP 1 · BANK TRANSFER</div>
          <h2 className="font-display text-lg font-bold cs-text-navy mt-1">Transfer to the Corner Streams account</h2>
          <div className="mt-4 rounded-lg p-4" style={{ backgroundColor: "#E8F5EB", border: "1px solid #28A745" }} data-testid="bank-details-box">
            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              <div><div className="text-xs text-slate-500">Bank</div><div className="font-semibold cs-text-navy">UBA</div></div>
              <div>
                <div className="text-xs text-slate-500">Account number</div>
                <div className="flex items-center gap-2">
                  <div className="font-mono font-semibold cs-text-navy" data-testid="bank-acct-num">2936722942</div>
                  <button onClick={() => copy("2936722942", "Account number")} type="button" className="text-slate-500 hover:cs-text-navy"><Copy size={14} /></button>
                </div>
              </div>
              <div><div className="text-xs text-slate-500">Account name</div><div className="font-semibold cs-text-navy text-xs sm:text-sm">Mervyndean Ifeanyichukwu Hilary</div></div>
            </div>
          </div>

          {/* Tier + duration selectors */}
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tier</Label>
              <select className="mt-1 w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white" value={tier} onChange={(e) => setTier(e.target.value)} data-testid="pending-tier">
                {TIERS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Duration</Label>
              <select className="mt-1 w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white" value={duration} onChange={(e) => setDuration(e.target.value)} data-testid="pending-duration">
                {DURATIONS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-3 text-sm">
            {amount ? (
              <div className="font-display text-2xl font-bold cs-text-navy" data-testid="pending-amount">Transfer exactly ₦{amount.toLocaleString()}</div>
            ) : (
              <div className="text-amber-700 text-sm">Not available — Unified Enterprise is Full Session only.</div>
            )}
          </div>
        </div>

        {/* Step 2: WhatsApp */}
        <div className="cs-card mt-5 p-6 border-l-4" style={{ borderLeftColor: "#0056B3" }}>
          <div className="eyebrow cs-text-blue">STEP 2 · WHATSAPP</div>
          <h2 className="font-display text-lg font-bold cs-text-navy mt-1">Message Super Admin to receive your code</h2>
          <p className="text-sm text-slate-600 mt-2">After transferring, WhatsApp <b>+234 814 188 0550</b> with your school name (<b>{schoolName}</b>) and the email used to register (<b>{schoolEmail}</b>). Super Admin will reply with a 6-digit activation code.</p>
          <a href={`https://wa.me/2348141880550?text=${encodeURIComponent(`Hello Corner Streams — I just paid for ${schoolName}. Sender's email: ${schoolEmail}. Tier: ${tier}, Duration: ${duration}, Amount: ${amount}. Please send my activation code.`)}`}
             target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-2 mt-3 rounded-full text-white font-semibold px-5 h-10 btn-anim"
             style={{ backgroundColor: "#25D366" }}
             data-testid="pending-whatsapp-link"><MessageCircle size={16} /> Open WhatsApp chat</a>
        </div>

        {/* Step 3: upload + code */}
        <form onSubmit={submit} className="cs-card mt-5 p-6 border-l-4" style={{ borderLeftColor: "#002147" }}>
          <div className="eyebrow cs-text-navy">STEP 3 · UPLOAD RECEIPT + ENTER CODE</div>
          <h2 className="font-display text-lg font-bold cs-text-navy mt-1">Submit for verification</h2>
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label className="text-xs">Bank transfer receipt (image or PDF · max 2MB) *</Label>
              <div className="mt-1 flex items-center gap-3 border border-dashed border-slate-300 rounded-lg p-3">
                <Upload size={16} className="text-slate-400" />
                <input type="file" accept="image/*,application/pdf" onChange={onFile} className="text-sm" data-testid="pending-receipt-file" />
                {receiptFile && <span className="text-xs cs-text-green font-semibold">Ready to upload</span>}
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">6-digit activation code from WhatsApp *</Label>
              <Input
                value={whatsappCode}
                onChange={(e) => setWhatsappCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                inputMode="numeric"
                className="font-mono text-lg tracking-widest"
                data-testid="pending-code"
              />
              <p className="text-[11px] text-slate-500 mt-1">Paste the 6-digit code Corner Streams sent you on WhatsApp.</p>
            </div>
          </div>
          <Button type="submit" disabled={submitting} className="cs-bg-navy text-white hover:opacity-90 w-full rounded-full h-12 mt-5 btn-anim text-base" data-testid="pending-submit">
            {submitting ? "Submitting…" : "Submit for verification"}
          </Button>
          <div className="text-xs text-slate-500 mt-3 text-center">
            Already activated? <Link to="/login" className="cs-text-blue font-semibold underline">Sign in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
