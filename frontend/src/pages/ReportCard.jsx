import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import StarRating from "@/components/StarRating.jsx";
import Logo from "@/components/Logo.jsx";
import { Printer, Lock, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function ReportCard() {
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

  if (error) return <div className="p-10 text-red-600" data-testid="report-error">{error}</div>;
  if (!data) return <div className="p-10 text-slate-500">Loading…</div>;

  if (data.debt_locked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" data-testid="report-debt-lock">
        <div className="cs-card p-10 max-w-md text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-red-50 text-red-600 flex items-center justify-center"><Lock size={26} /></div>
          <h2 className="font-display text-2xl font-bold cs-text-navy mt-4">Debt Lock engaged</h2>
          <p className="text-slate-600 mt-2 text-sm">{data.message}</p>
          <div className="mt-3 font-display text-3xl font-extrabold text-red-600">₦{Number(data.balance_due).toLocaleString()}</div>
          <Link to="/dashboard/parent"><Button variant="outline" className="mt-6 rounded-full" data-testid="back-to-parent"><ArrowLeft size={14} className="mr-2" /> Back to portal</Button></Link>
        </div>
      </div>
    );
  }

  const { student, school, scores, skill_ratings, average, promotion_status, qr_code, year, principal_signature } = data;

  return (
    <div className="min-h-screen bg-slate-100 py-10 print:bg-white print:py-0" data-testid="report-card">
      <div className="max-w-3xl mx-auto px-6 no-print mb-4 flex items-center justify-between">
        <Link to="/dashboard/parent"><Button variant="outline" className="rounded-full"><ArrowLeft size={14} className="mr-2" /> Back</Button></Link>
        <Button onClick={() => window.print()} className="cs-bg-navy text-white hover:opacity-90 rounded-full" data-testid="print-btn"><Printer size={14} className="mr-2" /> Print / Save PDF</Button>
      </div>

      <div className="max-w-3xl mx-auto bg-white shadow rounded-lg p-10 print:shadow-none print:rounded-none">
        <div className="flex items-start justify-between border-b pb-6">
          <div className="flex items-center gap-4">
            <Logo size={50} withText={false} />
            <div>
              <div className="font-display text-2xl font-bold cs-text-navy">{school?.name || "—"}</div>
              <div className="text-xs text-slate-500">{school?.address || ""}</div>
              <div className="text-xs text-slate-500">{school?.phone || ""}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="eyebrow">DIGITAL REPORT</div>
            <div className="text-xs text-slate-500 mt-1">{term} · {year}</div>
          </div>
        </div>

        {/* Student bio */}
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

        {/* Academic table */}
        <h3 className="mt-8 font-display font-semibold cs-text-navy">Academic performance</h3>
        <table className="mt-2 w-full text-sm border">
          <thead className="cs-bg-navy text-white text-xs uppercase">
            <tr><th className="p-2 text-left">Subject</th><th className="p-2">CA (40)</th><th className="p-2">Exam (60)</th><th className="p-2">Total</th><th className="p-2">Grade</th></tr>
          </thead>
          <tbody>
            {scores.map((s) => (
              <tr key={s.id} className="even:bg-slate-50">
                <td className="p-2">{s.subject}</td>
                <td className="p-2 text-center">{s.ca_score}</td>
                <td className="p-2 text-center">{s.exam_score}</td>
                <td className="p-2 text-center font-semibold">{s.total}</td>
                <td className="p-2 text-center cs-text-blue font-bold">{s.grade}</td>
              </tr>
            ))}
            {!scores.length && <tr><td className="p-3 text-center text-slate-400" colSpan={5}>No scores recorded for this term yet.</td></tr>}
          </tbody>
        </table>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div className="cs-card p-3"><div className="text-xs text-slate-500">Average</div><div className="font-display text-xl font-bold cs-text-navy">{average}%</div></div>
          <div className="cs-card p-3"><div className="text-xs text-slate-500">Promotion status</div><div className={`font-display text-xl font-bold ${promotion_status === "Promoted" ? "cs-text-green" : "text-amber-600"}`}>{promotion_status}</div></div>
        </div>

        {/* Skills */}
        <h3 className="mt-8 font-display font-semibold cs-text-navy">Behavioural & skill ratings</h3>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {skill_ratings.map((s) => (
            <div key={s.id} className="flex items-center justify-between border rounded p-3">
              <div className="text-sm cs-text-navy">{s.skill_name}</div>
              <StarRating value={s.rating} />
            </div>
          ))}
          {!skill_ratings.length && <div className="text-sm text-slate-400 col-span-2">No skill ratings recorded.</div>}
        </div>

        {/* Footer: signature + QR */}
        <div className="mt-10 flex items-end justify-between border-t pt-6">
          <div>
            <div className="font-script text-3xl cs-text-navy">{principal_signature}</div>
            <div className="text-xs text-slate-500 border-t mt-1 pt-1">Principal's signature</div>
          </div>
          <div className="text-right">
            {qr_code && <img src={qr_code} alt="QR" className="w-24 h-24 ml-auto" data-testid="qr-image" />}
            <div className="text-[10px] text-slate-500 mt-1">Scan to verify · Corner Streams</div>
          </div>
        </div>
      </div>
    </div>
  );
}
