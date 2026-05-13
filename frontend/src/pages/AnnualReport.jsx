import React, { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import StarRating from "@/components/StarRating.jsx";
import Logo from "@/components/Logo.jsx";
import { Printer, Lock, ArrowLeft, Trophy } from "lucide-react";

const TERMS = ["1st Term", "2nd Term", "3rd Term"];

export default function AnnualReport() {
  const { studentId } = useParams();
  const [params] = useSearchParams();
  const year = params.get("year") || "2025/2026";
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/reports/annual/${studentId}`, { params: { year } })
      .then(({ data }) => setData(data))
      .catch((e) => {
        const msg = formatApiError(e.response?.data?.detail) || e.message;
        setError(msg);
        toast.error(msg);
      });
  }, [studentId, year]);

  if (error) return <div className="p-10 text-red-600" data-testid="annual-error">{error}</div>;
  if (!data) return <div className="p-10 text-slate-500">Loading annual report…</div>;

  if (data.debt_locked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" data-testid="annual-debt-lock">
        <div className="cs-card p-10 max-w-md text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-red-50 text-red-600 flex items-center justify-center"><Lock size={26} /></div>
          <h2 className="font-display text-2xl font-bold cs-text-navy mt-4">Annual report locked</h2>
          <p className="text-slate-600 mt-2 text-sm">{data.message}</p>
          <div className="mt-3 font-display text-3xl font-extrabold text-red-600">₦{Number(data.balance_due).toLocaleString()}</div>
          <Link to="/"><Button variant="outline" className="mt-6 rounded-full btn-anim"><ArrowLeft size={14} className="mr-2" /> Back</Button></Link>
        </div>
      </div>
    );
  }

  const { student, school, subjects, skill_ratings, overall_average, promotion_status, qr_code, principal_signature } = data;
  const promoted = promotion_status?.startsWith("Promoted");

  return (
    <div className="min-h-screen bg-slate-100 py-10 print:bg-white print:py-0" data-testid="annual-report">
      <div className="max-w-4xl mx-auto px-6 no-print mb-4 flex items-center justify-between">
        <Link to="/"><Button variant="outline" className="rounded-full btn-anim"><ArrowLeft size={14} className="mr-2" /> Back</Button></Link>
        <div className="text-xs text-slate-500">Annual session report · {year}</div>
        <Button onClick={() => window.print()} className="cs-bg-navy text-white hover:opacity-90 rounded-full btn-anim" data-testid="annual-print"><Printer size={14} className="mr-2" /> Print / Save PDF</Button>
      </div>

      <div className="max-w-4xl mx-auto bg-white shadow rounded-lg p-10 print:shadow-none print:rounded-none">
        <div className="flex items-start justify-between border-b pb-6">
          <div className="flex items-center gap-4">
            {school?.logo_url ? <img src={school.logo_url} alt="school" className="w-14 h-14 rounded object-contain bg-white" /> : <Logo size={50} withText={false} />}
            <div>
              <div className="font-display text-2xl font-bold cs-text-navy">{school?.name || "—"}</div>
              {school?.motto && <div className="text-xs italic text-slate-500">"{school.motto}"</div>}
              <div className="text-xs text-slate-500">{school?.address || ""}</div>
              <div className="text-xs text-slate-500">{school?.phone || ""}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="eyebrow">ANNUAL SESSION REPORT</div>
            <div className="text-xs text-slate-500 mt-1">Academic year {year}</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-[100px_1fr] gap-5">
          <div className="aspect-[3/4] bg-slate-100 rounded border flex items-center justify-center overflow-hidden">
            {student.passport_url ? (
              <img src={student.passport_url} alt="passport" className="w-full h-full object-cover" />
            ) : (
              <div className="text-[10px] text-slate-400 text-center px-1">PASSPORT<br />PHOTO</div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-xs text-slate-500">Name</div><div className="font-semibold cs-text-navy">{student.name}</div></div>
            <div><div className="text-xs text-slate-500">Class</div><div className="font-semibold cs-text-navy">{student.class_name}</div></div>
            <div><div className="text-xs text-slate-500">Age</div><div className="font-semibold cs-text-navy">{student.age}</div></div>
            <div><div className="text-xs text-slate-500">Gender</div><div className="font-semibold cs-text-navy">{student.gender}</div></div>
          </div>
        </div>

        <h3 className="mt-8 font-display font-semibold cs-text-navy">Cumulative performance — all three terms</h3>
        <table className="mt-2 w-full text-sm border">
          <thead className="cs-bg-navy text-white text-xs uppercase">
            <tr>
              <th className="p-2 text-left">Subject</th>
              {TERMS.map((t) => <th key={t} className="p-2">{t.replace(" Term", "")}</th>)}
              <th className="p-2">Average</th>
              <th className="p-2">Grade</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s.subject} className="even:bg-slate-50">
                <td className="p-2">{s.subject}</td>
                {TERMS.map((t) => <td key={t} className="p-2 text-center">{s.terms[t] != null ? s.terms[t] : <span className="text-slate-300">—</span>}</td>)}
                <td className="p-2 text-center font-semibold">{s.average}</td>
                <td className="p-2 text-center cs-text-blue font-bold">{s.grade}</td>
              </tr>
            ))}
            {!subjects.length && <tr><td className="p-3 text-center text-slate-400" colSpan={TERMS.length + 3}>No scores recorded for this session.</td></tr>}
          </tbody>
        </table>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <div className="cs-card p-4">
            <div className="text-xs text-slate-500">Session average</div>
            <div className="font-display text-3xl font-extrabold cs-text-navy">{overall_average}%</div>
          </div>
          <div className={`cs-card p-4 ${promoted ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="text-xs text-slate-500 flex items-center gap-1"><Trophy size={12} /> Promotion status</div>
            <div className={`font-display text-xl font-extrabold ${promoted ? "cs-text-green" : "text-amber-700"}`}>{promotion_status}</div>
          </div>
        </div>

        {skill_ratings?.length > 0 && (
          <>
            <h3 className="mt-8 font-display font-semibold cs-text-navy">Skills (averaged across the year)</h3>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {skill_ratings.map((s) => (
                <div key={s.skill_name} className="flex items-center justify-between border rounded p-3">
                  <div className="text-sm cs-text-navy">{s.skill_name}</div>
                  <StarRating value={s.rating} />
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-10 flex items-end justify-between border-t pt-6">
          <div>
            <div className="font-script text-3xl cs-text-navy">{principal_signature}</div>
            <div className="text-xs text-slate-500 border-t mt-1 pt-1">Principal's signature</div>
          </div>
          <div className="text-right">
            {qr_code && <img src={qr_code} alt="QR" className="w-24 h-24 ml-auto" data-testid="annual-qr" />}
            <div className="text-[10px] text-slate-500 mt-1">Scan to verify · Corner Streams</div>
          </div>
        </div>
      </div>
    </div>
  );
}
