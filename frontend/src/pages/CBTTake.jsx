import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import Logo from "@/components/Logo.jsx";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Clock, ChevronLeft, ChevronRight, Send, CheckCircle2 } from "lucide-react";

function fmtTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function CBTTake() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [idx, setIdx] = useState(0);
  const [secLeft, setSecLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.post(`/cbt/exams/${examId}/start`);
        setExam(data.exam);
        setAttempt(data.attempt);
        setAnswers(new Array(data.exam.questions.length).fill(-1));
        setSecLeft(data.exam.duration_min * 60);
      } catch (e) {
        const msg = formatApiError(e.response?.data?.detail) || e.message;
        toast.error(msg);
        navigate("/dashboard/student");
      }
    })();
  }, [examId, navigate]);

  // Timer
  useEffect(() => {
    if (!exam || result) return;
    const t = setInterval(() => {
      setSecLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          if (!submittedRef.current) submit(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [exam, result]);

  const setAnswer = (qi, oi) => {
    const next = [...answers];
    next[qi] = oi;
    setAnswers(next);
  };

  const answeredCount = answers.filter((a) => a >= 0).length;

  const submit = async (auto = false) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const { data } = await api.post(`/cbt/attempts/${attempt.id}/submit`, { answers });
      setResult(data.review);
      if (auto) toast.warning("Time up — auto-submitted.");
      else toast.success(`Submitted. You scored ${data.review.score_pct}%`);
    } catch (e) {
      submittedRef.current = false;
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  };

  if (!exam) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading exam…</div>;

  if (result) {
    const passed = result.score_pct >= 50;
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-10">
        <div className="cs-card p-10 max-w-lg w-full text-center" data-testid="cbt-result">
          <div className={`mx-auto w-16 h-16 rounded-full ${passed ? "cs-bg-green" : "bg-amber-500"} text-white flex items-center justify-center`}>
            <CheckCircle2 size={28} />
          </div>
          <h2 className="font-display text-3xl font-bold cs-text-navy mt-5">Exam submitted</h2>
          <p className="text-slate-600 mt-2">{exam.title}</p>
          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="cs-card p-3"><div className="text-xs text-slate-500">Score</div><div className="font-display font-bold text-2xl cs-text-navy">{result.score_pct}%</div></div>
            <div className="cs-card p-3"><div className="text-xs text-slate-500">Correct</div><div className="font-display font-bold text-2xl cs-text-navy">{result.raw_score}</div></div>
            <div className="cs-card p-3"><div className="text-xs text-slate-500">Total</div><div className="font-display font-bold text-2xl cs-text-navy">{result.total_qs}</div></div>
          </div>
          <p className="text-xs text-slate-500 mt-5">Your exam score has been auto-recorded for {exam.subject}.</p>
          <Button onClick={() => navigate("/dashboard/student")} className="mt-6 cs-bg-navy text-white rounded-full hover:opacity-90 btn-anim" data-testid="cbt-return">Back to dashboard</Button>
          <Button onClick={() => navigate(`/cbt/review/${attempt.id}`)} variant="outline" className="mt-3 rounded-full btn-anim" data-testid="cbt-review-link">Review my answers</Button>
        </div>
      </div>
    );
  }

  const q = exam.questions[idx];
  const lowTime = secLeft < 60;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Sticky header */}
      <div className="bg-white border-b sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-3">
          <Logo size={28} />
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 font-mono font-bold text-lg ${lowTime ? "text-red-600" : "cs-text-navy"}`} data-testid="cbt-timer">
              <Clock size={18} /> {fmtTime(secLeft)}
            </div>
            <div className="text-xs text-slate-500">·</div>
            <div className="text-sm text-slate-600">{answeredCount}/{exam.questions.length} answered</div>
            <Button onClick={() => setConfirmOpen(true)} disabled={submitting} className="cs-bg-green text-white hover:opacity-90 rounded-full ml-3" data-testid="cbt-submit-btn">
              <Send size={14} className="mr-1" /> Submit
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 grid lg:grid-cols-[1fr_220px] gap-6">
        {/* Question card */}
        <div className="cs-card p-7" data-testid="cbt-question">
          <div className="text-xs uppercase tracking-wider cs-text-blue font-bold flex items-center gap-2">
            <span>Question {idx + 1} of {exam.questions.length}</span>
            {q.type === "true_false" && (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">TRUE / FALSE</span>
            )}
          </div>
          <h2 className="font-display text-xl font-semibold cs-text-navy mt-2 leading-snug">{q.question}</h2>
          {q.image_url && (
            <div className="mt-4">
              <img src={q.image_url} alt="" className="max-h-72 max-w-full rounded-lg border" data-testid={`cbt-q-image-${idx}`} />
            </div>
          )}
          <div className={`mt-6 ${q.type === "true_false" ? "grid grid-cols-2 gap-3" : "space-y-3"}`}>
            {q.options.map((opt, oi) => {
              const sel = answers[idx] === oi;
              if (q.type === "true_false") {
                return (
                  <button
                    key={oi}
                    onClick={() => setAnswer(idx, oi)}
                    className={`p-5 rounded-lg border-2 text-center font-display text-lg font-bold transition-all ${sel ? "border-[#0056B3] bg-blue-50 cs-text-navy" : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"}`}
                    data-testid={`cbt-option-${idx}-${oi}`}
                  >{opt}</button>
                );
              }
              return (
                <button
                  key={oi}
                  onClick={() => setAnswer(idx, oi)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${sel ? "border-[#0056B3] bg-blue-50" : "border-slate-200 hover:border-slate-300 bg-white"}`}
                  data-testid={`cbt-option-${idx}-${oi}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold ${sel ? "cs-bg-blue text-white border-transparent" : "border-slate-300 text-slate-500"}`}>
                      {String.fromCharCode(65 + oi)}
                    </div>
                    <div className="flex-1 cs-text-navy">{opt}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-7 flex items-center justify-between">
            <Button variant="outline" disabled={idx === 0} onClick={() => setIdx(idx - 1)} className="rounded-full" data-testid="cbt-prev"><ChevronLeft size={14} className="mr-1" /> Previous</Button>
            <Button disabled={idx === exam.questions.length - 1} onClick={() => setIdx(idx + 1)} className="cs-bg-navy text-white rounded-full hover:opacity-90" data-testid="cbt-next">Next <ChevronRight size={14} className="ml-1" /></Button>
          </div>
        </div>

        {/* Question palette */}
        <div className="cs-card p-4 h-fit lg:sticky lg:top-20">
          <div className="text-xs uppercase tracking-wider text-slate-500 font-bold">Questions</div>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {exam.questions.map((_, i) => {
              const a = answers[i];
              const isCurrent = i === idx;
              return (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  className={`h-9 rounded text-xs font-bold transition ${isCurrent ? "ring-2 ring-[#0056B3]" : ""} ${a >= 0 ? "cs-bg-green text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                  data-testid={`cbt-nav-${i}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="mt-4 text-[10px] text-slate-500 space-y-1">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm cs-bg-green" /> answered</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-slate-200" /> unanswered</div>
          </div>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Submit exam?</DialogTitle></DialogHeader>
          <div className="text-sm text-slate-600">
            You answered {answeredCount} of {exam.questions.length} questions. Once submitted you cannot retake this exam.
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} data-testid="cbt-cancel-submit">Continue exam</Button>
            <Button className="cs-bg-green text-white hover:opacity-90" onClick={() => submit(false)} disabled={submitting} data-testid="cbt-confirm-submit">
              {submitting ? "Submitting…" : "Yes, submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
