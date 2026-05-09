import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar.jsx";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

export default function CheckoutReturn() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const [status, setStatus] = useState("polling"); // polling | paid | expired | error
  const [tries, setTries] = useState(0);
  const navigate = useNavigate();
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    if (!sessionId) {
      setStatus("error");
      return;
    }
    const poll = async (attempt = 0) => {
      if (cancelled.current) return;
      if (attempt >= 8) { setStatus("expired"); return; }
      try {
        const { data } = await api.get(`/payments/checkout/status/${sessionId}`);
        if (data.payment_status === "paid") { setStatus("paid"); return; }
        if (data.status === "expired") { setStatus("expired"); return; }
        setTries(attempt + 1);
        setTimeout(() => poll(attempt + 1), 2000);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("status check error", formatApiError(e.response?.data?.detail));
        setTimeout(() => poll(attempt + 1), 2500);
      }
    };
    poll();
    return () => { cancelled.current = true; };
  }, [sessionId]);

  return (
    <div className="min-h-screen">
      <Navbar variant="dashboard" />
      <div className="max-w-md mx-auto px-6 pt-20" data-testid="checkout-return">
        <div className="cs-card p-10 text-center">
          {status === "polling" && (
            <>
              <Loader2 size={36} className="mx-auto cs-text-blue animate-spin" />
              <h2 className="font-display text-2xl font-bold cs-text-navy mt-4">Confirming your payment</h2>
              <p className="text-sm text-slate-500 mt-2">Hold on a moment… (attempt {tries + 1}/8)</p>
            </>
          )}
          {status === "paid" && (
            <>
              <CheckCircle2 size={36} className="mx-auto cs-text-green" />
              <h2 className="font-display text-2xl font-bold cs-text-navy mt-4">Payment received</h2>
              <p className="text-sm text-slate-500 mt-2">Your subscription is now active. Welcome aboard!</p>
              <Button onClick={() => navigate("/dashboard/school")} className="mt-5 cs-bg-green text-white rounded-full hover:opacity-90" data-testid="return-to-dash">Go to dashboard</Button>
            </>
          )}
          {status === "expired" && (
            <>
              <XCircle size={36} className="mx-auto text-amber-500" />
              <h2 className="font-display text-2xl font-bold cs-text-navy mt-4">Session expired</h2>
              <p className="text-sm text-slate-500 mt-2">We couldn't confirm payment. Please try again or upload a bank receipt.</p>
              <Button onClick={() => navigate("/dashboard/school")} variant="outline" className="mt-5 rounded-full" data-testid="return-to-dash-expired">Back to dashboard</Button>
            </>
          )}
          {status === "error" && (
            <>
              <XCircle size={36} className="mx-auto text-red-500" />
              <h2 className="font-display text-2xl font-bold cs-text-navy mt-4">Missing session</h2>
              <Button onClick={() => navigate("/dashboard/school")} variant="outline" className="mt-5 rounded-full">Back to dashboard</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
