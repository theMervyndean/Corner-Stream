import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import StarRating from "@/components/StarRating.jsx";
import Logo from "@/components/Logo.jsx";
import { Printer, Lock, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const remarkForGrade = (g) => ({
  A: "Excellent",
  B: "Very Good",
  C: "Good",
  D: "Fair",
  E: "Pass",
  F: "Poor — needs urgent attention",
}[g] || "—");

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

  const { student, school, scores, skill_ratings, average, promotion_status, qr_code, year, principal_signature,
    total_subjects, subjects_scored, principal_comment, teacher_comment } = data;
  const brand = school?.brand_color || "#002147";
  const caMax = school?.ca_max ?? 40;
  const examMax = school?.exam_max ?? 60;

  // ─── Dynamic CA columns driven by school.ca_weights ───
  // Prefer the per-column weight array; fall back to a single-column array
  // synthesised from the legacy ca_max scalar so old schools keep working.
  const caWeights = Array.isArray(school?.ca_weights) && school.ca_weights.length > 0
    ? school.ca_weights.map((n) => Number(n) || 0)
    : [caMax];
  const caCount = caWeights.length;
  // If the school is configured for multiple CA columns AND at least one
  // score row carries the granular ca_scores array, render the dynamic matrix.
  // Otherwise we keep the single-column "Total CA" layout for backward compat.
  const anyHasCaScores = (scores || []).some(
    (s) => Array.isArray(s.ca_scores) && s.ca_scores.length === caCount,
  );
  const useDynamicCAGrid = caCount > 1 && anyHasCaScores;
  const totalCols = useDynamicCAGrid ? caCount + 5 : 6; // +Subject, Exam, Total, Grade, Remark
  // Track whether any row is a legacy aggregate so we render the footnote once.
  const hasLegacyRow = useDynamicCAGrid && (scores || []).some(
    (s) => !Array.isArray(s.ca_scores) || s.ca_scores.length !== caCount,
  );

  return (
    <div className="min-h-screen bg-slate-100 py-10 print:bg-white print:py-0" data-testid="report-card">
      <div className="max-w-3xl mx-auto px-6 no-print mb-4 flex items-center justify-between">
        <Link to="/dashboard/parent"><Button variant="outline" className="rounded-full"><ArrowLeft size={14} className="mr-2" /> Back</Button></Link>
        <Button onClick={() => window.print()} style={{ backgroundColor: brand }} className="text-white hover:opacity-90 rounded-full" data-testid="print-btn"><Printer size={14} className="mr-2" /> Print / Save PDF</Button>
      </div>

      <div className="max-w-3xl mx-auto bg-white shadow rounded-lg p-10 print:shadow-none print:rounded-none border-t-8" style={{ borderTopColor: brand }}>
        {/* Header with school logo top-left in brand color */}
        <div className="flex items-start justify-between border-b pb-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-lg flex items-center justify-center overflow-hidden border-2" style={{ borderColor: brand, backgroundColor: `${brand}10` }} data-testid="report-school-logo">
              {school?.logo_url ? (
                <img src={school.logo_url} alt="logo" className="h-full w-full object-cover" />
              ) : (
                <Logo size={36} withText={false} />
              )}
            </div>
            <div>
              <div className="font-display text-2xl font-bold" style={{ color: brand }}>{school?.name || "—"}</div>
              <div className="text-xs text-slate-500">{school?.address || ""}</div>
              <div className="text-xs text-slate-500">{school?.phone || ""}{school?.motto ? ` · ${school.motto}` : ""}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="eyebrow" style={{ color: brand }}>DIGITAL REPORT</div>
            <div className="text-xs text-slate-500 mt-1">{term} · {year}</div>
          </div>
        </div>

        {/* Student bio */}
        <div className="mt-6 grid grid-cols-[100px_1fr] gap-5">
          <div className="aspect-[3/4] bg-slate-100 rounded border-2 flex items-center justify-center overflow-hidden" style={{ borderColor: `${brand}40` }}>
            {student.passport_url ? (
              <img src={student.passport_url} alt="passport" className="w-full h-full object-cover" />
            ) : (
              <div className="text-[10px] text-slate-400 text-center px-1">PASSPORT<br />PHOTO</div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-xs text-slate-500">Name</div><div className="font-semibold" style={{ color: brand }}>{student.name}</div></div>
            <div><div className="text-xs text-slate-500">Class</div><div className="font-semibold" style={{ color: brand }}>{student.class_name}</div></div>
            <div><div className="text-xs text-slate-500">Age</div><div className="font-semibold" style={{ color: brand }}>{student.age}</div></div>
            <div><div className="text-xs text-slate-500">Gender</div><div className="font-semibold" style={{ color: brand }}>{student.gender}</div></div>
            <div><div className="text-xs text-slate-500">Subjects scored</div><div className="font-semibold" style={{ color: brand }} data-testid="subjects-scored">{subjects_scored} of {total_subjects}</div></div>
            <div><div className="text-xs text-slate-500">Session</div><div className="font-semibold" style={{ color: brand }}>{year}</div></div>
          </div>
        </div>

        {/* Academic table */}
        <h3 className="mt-8 font-display font-semibold" style={{ color: brand }}>Academic performance</h3>
        <table className="mt-2 w-full text-sm border-2" style={{ borderColor: brand }} data-testid="report-academic-table">
          <thead className="text-white text-xs uppercase" style={{ backgroundColor: brand }}>
            <tr>
              <th className="p-2 text-left">Subject</th>
              {useDynamicCAGrid
                ? caWeights.map((w, i) => (
                    <th key={i} className="p-2" data-testid={`th-ca-${i + 1}`}>CA {i + 1} ({w})</th>
                  ))
                : <th className="p-2" data-testid="th-ca-total">Total CA ({caWeights.reduce((a, b) => a + b, 0) || caMax})</th>}
              <th className="p-2">Exam ({examMax})</th>
              <th className="p-2">Total</th>
              <th className="p-2">Grade</th>
              <th className="p-2">Remark</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((s) => {
              const rowHasCaScores = Array.isArray(s.ca_scores) && s.ca_scores.length === caCount;
              return (
                <tr key={s.id} className="even:bg-slate-50" data-testid={`report-row-${s.id}`}>
                  <td className="p-2 font-medium">{s.subject}</td>
                  {useDynamicCAGrid ? (
                    rowHasCaScores
                      ? s.ca_scores.map((v, i) => (
                          <td key={i} className="p-2 text-center" data-testid={`row-${s.id}-ca-${i + 1}`}>{v}</td>
                        ))
                      : caWeights.map((_, i) => (
                          i === 0
                            ? <td key={i} className="p-2 text-center italic text-slate-600" title="Legacy aggregated CA" data-testid={`row-${s.id}-ca-legacy`}>{s.ca_score}<sup>*</sup></td>
                            : <td key={i} className="p-2 text-center text-slate-400">—</td>
                        ))
                  ) : (
                    <td className="p-2 text-center" data-testid={`row-${s.id}-ca-total`}>{s.ca_score}</td>
                  )}
                  <td className="p-2 text-center">{s.exam_score}</td>
                  <td className="p-2 text-center font-semibold">{s.total}</td>
                  <td className="p-2 text-center font-bold" style={{ color: brand }}>{s.grade}</td>
                  <td className="p-2 text-xs text-slate-600">{remarkForGrade(s.grade)}</td>
                </tr>
              );
            })}
            {!scores.length && <tr><td className="p-3 text-center text-slate-400" colSpan={totalCols}>No scores recorded for this term yet.</td></tr>}
          </tbody>
        </table>
        {hasLegacyRow && (
          <div className="mt-1 text-[11px] text-slate-500 italic" data-testid="legacy-ca-footnote">
            <sup>*</sup> Legacy record stored as a single aggregated CA value (per-column breakdown not available).
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div className="p-3 rounded border-2" style={{ borderColor: brand }}><div className="text-xs text-slate-500">Average</div><div className="font-display text-xl font-bold" style={{ color: brand }}>{average}%</div></div>
          <div className="p-3 rounded border-2" style={{ borderColor: brand }}><div className="text-xs text-slate-500">Promotion status</div><div className={`font-display text-xl font-bold ${promotion_status === "Promoted" ? "cs-text-green" : "text-amber-600"}`}>{promotion_status}</div></div>
        </div>

        {/* Skills */}
        <h3 className="mt-8 font-display font-semibold" style={{ color: brand }}>Behavioural & skill ratings</h3>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {skill_ratings.map((s) => (
            <div key={s.id} className="flex items-center justify-between border-2 rounded p-3" style={{ borderColor: `${brand}40` }}>
              <div className="text-sm font-medium" style={{ color: brand }}>{s.skill_name}</div>
              <StarRating value={s.rating} />
            </div>
          ))}
          {!skill_ratings.length && <div className="text-sm text-slate-400 col-span-2">No skill ratings recorded.</div>}
        </div>

        {/* Comments */}
        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          <div className="p-4 rounded border-l-4" style={{ borderLeftColor: brand, backgroundColor: `${brand}08` }} data-testid="teacher-comment">
            <div className="eyebrow" style={{ color: brand }}>CLASS TEACHER'S COMMENT</div>
            <p className="text-sm text-slate-700 mt-1 italic">"{teacher_comment}"</p>
          </div>
          <div className="p-4 rounded border-l-4" style={{ borderLeftColor: brand, backgroundColor: `${brand}08` }} data-testid="principal-comment">
            <div className="eyebrow" style={{ color: brand }}>PRINCIPAL'S COMMENT</div>
            <p className="text-sm text-slate-700 mt-1 italic">"{principal_comment}"</p>
          </div>
        </div>

        {/* Footer: signature + QR */}
        <div className="mt-10 flex items-end justify-between border-t-2 pt-6" style={{ borderTopColor: `${brand}40` }}>
          <div>
            <div className="font-script text-3xl" style={{ color: brand }}>{principal_signature}</div>
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
