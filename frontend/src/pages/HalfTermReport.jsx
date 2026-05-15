import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo.jsx";
import { Printer, Lock, ArrowLeft } from "lucide-react";

/**
 * Half-Term Report — shows ONLY CA scores (no exam yet).
 * Used at mid-term. Reuses the same /api/reports/{id} payload but ignores exam_score
 * and computes a "Half-term progress" grade scaled to the CA-only ceiling.
 */
export default function HalfTermReport() {
  const { studentId, term } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/reports/${studentId}`, { params: { term } })
      .then(({ data }) => setData(data))
      .catch((e) => {
        const msg = formatApiError(e.response?.data?.detail) || e.message;
        setError(msg);
        toast.error(msg);
      });
  }, [studentId, term]);

  if (error) return <div className="p-10 text-red-600" data-testid="half-error">{error}</div>;
  if (!data) return <div className="p-10 text-slate-500">Loading…</div>;

  if (data.debt_locked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" data-testid="half-debt-lock">
        <div className="cs-card p-10 max-w-md text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-red-50 text-red-600 flex items-center justify-center"><Lock size={26} /></div>
          <h2 className="font-display text-2xl font-bold cs-text-navy mt-4">Debt Lock engaged</h2>
          <p className="text-slate-600 mt-2 text-sm">{data.message}</p>
          <div className="mt-3 font-display text-3xl font-extrabold text-red-600">₦{Number(data.balance_due).toLocaleString()}</div>
          <Link to="/dashboard/school"><Button variant="outline" className="mt-6 rounded-full"><ArrowLeft size={14} className="mr-2" /> Back</Button></Link>
        </div>
      </div>
    );
  }

  const { student, school, scores, skill_ratings, year, total_subjects, subjects_scored } = data;
  const brand = school?.brand_color || "#002147";
  const caMax = school?.ca_max ?? 40;
  // CA-only average, scaled out of 100 so half-term grades feel familiar
  const caTotal = scores.reduce((sum, s) => sum + (Number(s.ca_score) || 0), 0);
  const caAvg = scores.length ? (caTotal / scores.length) : 0;
  const caAvgPct = caMax > 0 ? Math.round((caAvg / caMax) * 100 * 10) / 10 : 0;
  const status = caAvgPct >= 50 ? "On track" : "Needs attention";

  const halfRemark = (pct) =>
    pct >= 75 ? "Excellent progress" :
    pct >= 65 ? "Very good — keep it up" :
    pct >= 55 ? "Good — stay consistent" :
    pct >= 45 ? "Fair — push harder this half" :
    pct >= 40 ? "Below par — extra coaching advised" :
                "Poor — urgent parental attention";

  return (
    <div className="min-h-screen bg-slate-100 py-10 print:bg-white print:py-0" data-testid="half-report">
      <div className="max-w-3xl mx-auto px-6 no-print mb-4 flex items-center justify-between">
        <Link to="/dashboard/school"><Button variant="outline" className="rounded-full"><ArrowLeft size={14} className="mr-2" /> Back</Button></Link>
        <Button onClick={() => window.print()} style={{ backgroundColor: brand }} className="text-white hover:opacity-90 rounded-full" data-testid="half-print"><Printer size={14} className="mr-2" /> Print / Save PDF</Button>
      </div>

      <div className="max-w-3xl mx-auto bg-white shadow rounded-lg p-10 print:shadow-none print:rounded-none border-t-8" style={{ borderTopColor: brand }}>
        {/* Half-term watermark / eyebrow */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-lg flex items-center justify-center overflow-hidden border-2" style={{ borderColor: brand, backgroundColor: `${brand}10` }}>
              {school?.logo_url ? <img src={school.logo_url} alt="logo" className="h-full w-full object-cover" /> : <Logo size={36} withText={false} />}
            </div>
            <div>
              <div className="font-display text-2xl font-bold" style={{ color: brand }}>{school?.name || "—"}</div>
              <div className="text-xs text-slate-500">{school?.address || ""}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="inline-block px-3 py-1 rounded-full text-xs font-bold text-white" style={{ backgroundColor: brand }}>HALF-TERM PROGRESS</div>
            <div className="text-xs text-slate-500 mt-1">{term} · {year}</div>
          </div>
        </div>

        {/* Student bio */}
        <div className="grid grid-cols-[100px_1fr] gap-5 border-y py-4">
          <div className="aspect-[3/4] bg-slate-100 rounded border-2 flex items-center justify-center overflow-hidden" style={{ borderColor: `${brand}40` }}>
            {student.passport_url ? <img src={student.passport_url} alt="" className="w-full h-full object-cover" /> : <div className="text-[10px] text-slate-400 text-center">PASSPORT</div>}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-xs text-slate-500">Name</div><div className="font-semibold" style={{ color: brand }}>{student.name}</div></div>
            <div><div className="text-xs text-slate-500">Class</div><div className="font-semibold" style={{ color: brand }}>{student.class_name}</div></div>
            <div><div className="text-xs text-slate-500">Age</div><div className="font-semibold" style={{ color: brand }}>{student.age}</div></div>
            <div><div className="text-xs text-slate-500">Gender</div><div className="font-semibold" style={{ color: brand }}>{student.gender}</div></div>
            <div><div className="text-xs text-slate-500">Subjects assessed</div><div className="font-semibold" style={{ color: brand }}>{subjects_scored} of {total_subjects}</div></div>
            <div><div className="text-xs text-slate-500">Session</div><div className="font-semibold" style={{ color: brand }}>{year}</div></div>
          </div>
        </div>

        {/* CA-only table */}
        <h3 className="mt-6 font-display font-semibold" style={{ color: brand }}>Continuous Assessment ({caMax} max per subject)</h3>
        <table className="mt-2 w-full text-sm border-2" style={{ borderColor: brand }}>
          <thead className="text-white text-xs uppercase" style={{ backgroundColor: brand }}>
            <tr>
              <th className="p-2 text-left">Subject</th>
              <th className="p-2">CA Score ({caMax})</th>
              <th className="p-2">%</th>
              <th className="p-2">Remark</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((s) => {
              const pct = caMax > 0 ? Math.round((s.ca_score / caMax) * 100) : 0;
              return (
                <tr key={s.id} className="even:bg-slate-50">
                  <td className="p-2 font-medium">{s.subject}</td>
                  <td className="p-2 text-center font-semibold">{s.ca_score}</td>
                  <td className="p-2 text-center font-bold" style={{ color: brand }}>{pct}%</td>
                  <td className="p-2 text-xs text-slate-600">{halfRemark(pct)}</td>
                </tr>
              );
            })}
            {!scores.length && <tr><td className="p-3 text-center text-slate-400" colSpan={4}>No CA scores recorded for this term yet.</td></tr>}
          </tbody>
        </table>

        {/* Summary boxes */}
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div className="p-3 rounded border-2" style={{ borderColor: brand }}>
            <div className="text-xs text-slate-500">Half-term average</div>
            <div className="font-display text-xl font-bold" style={{ color: brand }}>{caAvgPct}%</div>
          </div>
          <div className="p-3 rounded border-2" style={{ borderColor: brand }}>
            <div className="text-xs text-slate-500">Status</div>
            <div className={`font-display text-xl font-bold ${caAvgPct >= 50 ? "cs-text-green" : "text-amber-600"}`}>{status}</div>
          </div>
        </div>

        {/* Behavioural */}
        {skill_ratings?.length > 0 && (
          <>
            <h3 className="mt-6 font-display font-semibold" style={{ color: brand }}>Behaviour & skills (mid-term)</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              {skill_ratings.map((s) => (
                <div key={s.id} className="flex items-center justify-between border rounded p-2" style={{ borderColor: `${brand}40` }}>
                  <span style={{ color: brand }}>{s.skill_name}</span>
                  <span className="font-bold">{s.rating}/5</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Note */}
        <div className="mt-6 p-3 rounded border-l-4 text-xs italic text-slate-600" style={{ borderLeftColor: brand, backgroundColor: `${brand}08` }}>
          This is a <b>half-term progress sheet</b> — based on Continuous Assessment only. The final term report (CA + Exam) will be issued at the end of {term}.
        </div>
      </div>
    </div>
  );
}
