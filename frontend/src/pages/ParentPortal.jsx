import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar.jsx";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth.jsx";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Lock, FileText, AlertTriangle } from "lucide-react";

export default function ParentPortal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [children, setChildren] = useState([]);

  useEffect(() => {
    api.get("/students").then(({ data }) => setChildren(data.students || []))
      .catch((e) => toast.error(formatApiError(e.response?.data?.detail) || e.message));
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar variant="dashboard" />
      <div className="max-w-5xl mx-auto px-6 py-10" data-testid="parent-portal">
        <span className="eyebrow">PARENT PORTAL</span>
        <h1 className="font-display text-3xl font-bold cs-text-navy mt-1">Welcome, {user?.name}</h1>
        <p className="text-sm text-slate-500 mt-1">Access your child's results and fee balance.</p>

        <div className="mt-8 grid sm:grid-cols-2 gap-5">
          {children.map((c) => {
            const debt = (c.balance_due || 0) > 0;
            return (
              <div key={c.id} className="cs-card p-6 flex flex-col" data-testid={`child-card-${c.id}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-display font-bold text-xl cs-text-navy">{c.name}</div>
                    <div className="text-sm text-slate-500">{c.class_name} · {c.gender}, {c.age}</div>
                  </div>
                  {debt ? (
                    <div className="text-right">
                      <div className="text-xs text-amber-600 font-semibold flex items-center gap-1"><AlertTriangle size={14} /> DEBT LOCK</div>
                      <div className="font-display font-bold text-red-600 text-lg">₦{c.balance_due.toLocaleString()}</div>
                    </div>
                  ) : (
                    <span className="text-xs cs-text-green font-bold">FEES CLEAR</span>
                  )}
                </div>

                <div className="mt-5 flex flex-col gap-2">
                  <Button
                    onClick={() => navigate(`/report/${c.id}/1st%20Term`)}
                    disabled={debt}
                    className={`flex-1 rounded-full btn-anim ${debt ? "bg-slate-200 text-slate-500 cursor-not-allowed" : "cs-bg-green text-white hover:opacity-90"}`}
                    data-testid={`result-checker-${c.id}`}
                  >
                    {debt ? <><Lock size={14} className="mr-2" /> Term result locked</> : <><FileText size={14} className="mr-2" /> Term result</>}
                  </Button>
                  <Button
                    onClick={() => navigate(`/report/annual/${c.id}`)}
                    disabled={debt}
                    variant="outline"
                    className={`flex-1 rounded-full btn-anim ${debt ? "opacity-50 cursor-not-allowed" : ""}`}
                    data-testid={`annual-checker-${c.id}`}
                  >
                    {debt ? <><Lock size={14} className="mr-2" /> Annual locked</> : <><FileText size={14} className="mr-2" /> Annual session report</>}
                  </Button>
                </div>

                {debt && (
                  <div className="mt-4 text-xs bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded">
                    Result Checker is disabled until the outstanding balance is settled. Please contact the school bursary.
                  </div>
                )}
              </div>
            );
          })}
          {!children.length && (
            <div className="cs-card p-8 col-span-full text-center text-slate-500">
              No children linked to your email yet. Please ask the school admin to add your email to your child's profile.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
