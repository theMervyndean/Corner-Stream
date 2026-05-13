import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import {
  User, KeyRound, Eye, RotateCcw, GraduationCap, CreditCard, FileText, X,
  Mail, Phone, Calendar, UserCircle2, Copy,
} from "lucide-react";

/**
 * Detail view for a student. Shown when admin clicks a student row.
 * Loads bio + login + grades + term reports. Includes reveal/reset for
 * the linked student-login user.
 */
export default function StudentProfileDialog({ open, onOpenChange, student, onChanged }) {
  const [loginUser, setLoginUser] = useState(null);
  const [scores, setScores] = useState({});
  const [revealedPw, setRevealedPw] = useState(null);

  useEffect(() => {
    if (!open || !student) {
      setLoginUser(null); setScores({}); setRevealedPw(null);
      return;
    }
    (async () => {
      try {
        const [u, sc] = await Promise.all([
          api.get(`/users?role=student`).then((r) => r.data.users.find((u) => u.student_id === student.id)).catch(() => null),
          api.get(`/scores/${student.id}`).then((r) => r.data.scores || {}).catch(() => ({})),
        ]);
        setLoginUser(u);
        setScores(sc);
      } catch (e) { /* ignore */ }
    })();
  }, [open, student]);

  if (!student) return null;

  const fee = student.balance_due || 0;
  const debtLocked = fee > 0;

  const reveal = async () => {
    if (!loginUser) return toast.error("No login created yet for this student");
    try {
      const { data } = await api.get(`/users/${loginUser.id}/reveal-password`);
      setRevealedPw(data.password);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };
  const reset = async () => {
    if (!loginUser) return toast.error("No login created yet for this student");
    if (!window.confirm(`Generate a new password for ${student.name}?`)) return;
    try {
      const { data } = await api.post(`/users/${loginUser.id}/reset-password`);
      setRevealedPw(data.password);
      toast.success("New password generated — share it with the student");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };
  const copy = async (text, label) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); } catch { toast.error("Copy failed"); }
  };

  const allTerms = ["1st Term", "2nd Term", "3rd Term"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="student-profile-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 cs-text-navy">
            <UserCircle2 size={20} className="cs-text-blue" /> Student profile
          </DialogTitle>
        </DialogHeader>

        {/* Header card with passport */}
        <div className="flex gap-4 p-4 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white">
          <div className="w-24 h-32 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
            {student.passport_url
              ? <img src={student.passport_url} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-slate-400"><User size={32} /></div>}
          </div>
          <div className="flex-1">
            <h3 className="font-display font-bold text-xl cs-text-navy">{student.name}</h3>
            <div className="text-sm text-slate-600 mt-1">{student.class_name} · {student.gender || "—"} · {student.age || "—"} yrs</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {debtLocked
                ? <Badge className="bg-red-500 text-white">🔒 Debt locked: ₦{fee.toLocaleString()}</Badge>
                : <Badge className="cs-bg-green text-white">✓ Fees clear</Badge>}
              {loginUser
                ? <Badge variant="outline" className="cs-text-blue border-blue-300">Login active</Badge>
                : <Badge variant="outline" className="text-amber-700 border-amber-300">No login</Badge>}
            </div>
          </div>
        </div>

        {/* Bio + Parent */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="cs-card p-4">
            <div className="text-xs font-semibold text-slate-500 mb-2">Bio data</div>
            <div className="space-y-1 text-sm">
              <div><span className="text-slate-500">Full name:</span> <strong>{student.name}</strong></div>
              <div><span className="text-slate-500">Class:</span> <strong>{student.class_name}</strong></div>
              <div><span className="text-slate-500">Age:</span> {student.age || "—"}</div>
              <div><span className="text-slate-500">Gender:</span> {student.gender || "—"}</div>
              <div><span className="text-slate-500">Date added:</span> {student.created_at ? new Date(student.created_at).toLocaleDateString() : "—"}</div>
            </div>
          </div>
          <div className="cs-card p-4">
            <div className="text-xs font-semibold text-slate-500 mb-2">Parent / Guardian</div>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-1.5"><User size={12} className="text-slate-400" /> {student.parent_name || <span className="text-slate-400">Not provided</span>}</div>
              <div className="flex items-center gap-1.5"><Mail size={12} className="text-slate-400" /> {student.parent_email || <span className="text-slate-400">—</span>}</div>
              <div className="flex items-center gap-1.5"><Phone size={12} className="text-slate-400" /> {student.parent_phone || <span className="text-slate-400">—</span>}</div>
            </div>
          </div>
        </div>

        {/* Login credentials */}
        <div className="cs-card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-slate-500 flex items-center gap-1"><KeyRound size={12} /> School login</div>
            {loginUser && <Badge variant="outline" className="text-xs">
              {loginUser.password_changed_by_user ? "User-set" : "Auto"}
            </Badge>}
          </div>
          {loginUser ? (
            <div className="text-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Email:</span>
                <span className="flex items-center gap-1 font-mono text-xs">
                  {loginUser.email}
                  <button onClick={() => copy(loginUser.email, "Email")} className="text-slate-400 hover:cs-text-blue p-0.5 cs-noflip"><Copy size={11} /></button>
                </span>
              </div>
              {loginUser.username && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Username:</span>
                  <span className="font-mono text-xs">{loginUser.username}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Password:</span>
                <span className="flex items-center gap-1">
                  {revealedPw
                    ? (<>
                        <code className="bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-xs font-mono">{revealedPw}</code>
                        <button onClick={() => copy(revealedPw, "Password")} className="text-slate-400 hover:cs-text-blue p-0.5 cs-noflip"><Copy size={11} /></button>
                      </>)
                    : <code className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono">••••••••</code>}
                </span>
              </div>
              <div className="flex gap-2 pt-2">
                {!loginUser.password_changed_by_user && (
                  <Button size="sm" variant="outline" onClick={reveal} data-testid="profile-reveal-pw">
                    <Eye size={12} className="mr-1" /> Reveal
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={reset} data-testid="profile-reset-pw">
                  <RotateCcw size={12} className="mr-1" /> Reset
                </Button>
              </div>
              {loginUser.password_changed_by_user && !revealedPw && (
                <p className="text-[11px] text-slate-500">⚠️ Student has set their own password — Reset to generate a new one</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No login yet. Use <em>Create login</em> on the Students table.</p>
          )}
        </div>

        {/* Academics */}
        <div className="cs-card p-4">
          <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1"><GraduationCap size={12} /> Academic progress</div>
          {Object.keys(scores).length === 0
            ? <p className="text-sm text-slate-400">No scores recorded yet.</p>
            : (
              <div className="space-y-3 mt-2">
                {allTerms.map((term) => {
                  const subjects = scores[term] || {};
                  const entries = Object.entries(subjects);
                  if (!entries.length) return null;
                  const totals = entries.map(([, v]) => (v?.test || 0) + (v?.exam || 0));
                  const avg = totals.reduce((a, b) => a + b, 0) / (totals.length || 1);
                  return (
                    <div key={term} className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <strong className="text-sm cs-text-navy">{term}</strong>
                        <Badge className={avg >= 60 ? "cs-bg-green" : avg >= 45 ? "bg-amber-500" : "bg-red-500"}>
                          {avg.toFixed(1)} avg
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-xs">
                        {entries.map(([subj, v]) => (
                          <div key={subj} className="flex justify-between bg-slate-50 px-2 py-1 rounded">
                            <span className="text-slate-600 truncate">{subj}</span>
                            <strong>{(v?.test || 0) + (v?.exam || 0)}</strong>
                          </div>
                        ))}
                      </div>
                      <a href={`/report/${student.id}/${encodeURIComponent(term)}`} target="_blank" rel="noreferrer" className="text-[11px] cs-text-blue hover:underline flex items-center gap-1 mt-2">
                        <FileText size={10} /> View {term} report card
                      </a>
                    </div>
                  );
                })}
                <a href={`/report/annual/${student.id}`} target="_blank" rel="noreferrer" className="text-xs cs-text-blue hover:underline flex items-center gap-1">
                  <FileText size={11} /> Annual cumulative report →
                </a>
              </div>
            )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange?.(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
