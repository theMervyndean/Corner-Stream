import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, ArrowLeft, Trophy } from "lucide-react";

export default function CBTReview() {
  const { attemptId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/cbt/attempts/${attemptId}/review`)
      .then(({ data }) => setData(data))
      .catch((e) => {
        const msg = formatApiError(e.response?.data?.detail) || e.message;
        setError(msg);
        toast.error(msg);
      });
  }, [attemptId]);

  if (error) return <div className="p-10 text-red-600" data-testid="review-error">{error}</div>;
  if (!data) return <div className="p-10 text-slate-500">Loading review…</div>;

  const passed = (data.score_pct || 0) >= 50;

  return (
    <div className="min-h-screen bg-slate-100 py-10" data-testid="cbt-review">
      <div className="max-w-3xl mx-auto px-6 mb-4 flex items-center justify-between">
        <Link to="/dashboard/student"><Button variant="outline" className="rounded-full btn-anim"><ArrowLeft size={14} className="mr-2" /> Back</Button></Link>
        <div className="text-xs text-slate-500">CBT review · {data.exam.subject}</div>
      </div>

      <div className="max-w-3xl mx-auto bg-white shadow rounded-lg p-8">
        <div className="flex items-start justify-between border-b pb-5">
          <div>
            <span className="eyebrow">{passed ? "PASSED" : "BELOW PASS MARK"}</span>
            <h1 className="font-display text-2xl font-bold cs-text-navy mt-1">{data.exam.title}</h1>
            <div className="text-xs text-slate-500 mt-1">{data.exam.term} · {data.exam.year} · {data.exam.class_name}</div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 justify-end">
              <Trophy size={20} className={passed ? "cs-text-green" : "text-amber-500"} />
              <div className={`font-display font-extrabold text-3xl ${passed ? "cs-text-green" : "text-amber-600"}`}>{data.score_pct}%</div>
            </div>
            <div className="text-xs text-slate-500 mt-1">{data.raw_score}/{data.total_qs} correct</div>
          </div>
        </div>

        <div className="mt-6 space-y-5">
          {data.questions.map((q, qi) => {
            const myAnswer = data.answers[qi];
            const correctIdx = q.correct_idx;
            const isCorrect = myAnswer === correctIdx;
            return (
              <div key={qi} className={`border-l-4 rounded p-4 ${isCorrect ? "border-l-[#28A745] bg-green-50" : "border-l-red-500 bg-red-50"}`} data-testid={`review-q-${qi}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {isCorrect ? <CheckCircle2 size={20} className="cs-text-green" /> : <XCircle size={20} className="text-red-500" />}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs uppercase tracking-wider cs-text-blue font-bold">Question {qi + 1}</div>
                    <div className="font-medium cs-text-navy mt-1">{q.question}</div>
                    <div className="mt-3 space-y-2">
                      {q.options.map((opt, oi) => {
                        const youPicked = myAnswer === oi;
                        const correct = correctIdx === oi;
                        const tone = correct ? "border-[#28A745] bg-white" : youPicked ? "border-red-400 bg-white" : "border-slate-200 bg-white";
                        return (
                          <div key={oi} className={`flex items-center gap-2 p-2 rounded border ${tone}`}>
                            <div className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${correct ? "cs-bg-green text-white" : youPicked ? "bg-red-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                              {String.fromCharCode(65 + oi)}
                            </div>
                            <div className="flex-1 text-sm cs-text-navy">{opt}</div>
                            {correct && <span className="text-[10px] font-bold cs-text-green uppercase">Correct</span>}
                            {!correct && youPicked && <span className="text-[10px] font-bold text-red-600 uppercase">Your pick</span>}
                          </div>
                        );
                      })}
                      {myAnswer === -1 && <div className="text-xs text-slate-500 italic">You did not answer this question.</div>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
