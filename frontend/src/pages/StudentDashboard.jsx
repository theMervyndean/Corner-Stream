import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar.jsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth.jsx";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { BookOpen, FileText, Lock, Play, Trophy, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [exams, setExams] = useState([]);
  const [subjects, setSubjects] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [meRes, examsRes] = await Promise.all([
          api.get("/students/me"),
          api.get("/cbt/exams"),
        ]);
        const student = meRes.data.student;
        setMe(student);
        setExams(examsRes.data.exams || []);
        const subRes = await api.get(`/subjects`, { params: { class_name: student.class_name } });
        const list = subRes.data.class_subjects?.[0]?.subjects || [];
        setSubjects(list);
      } catch (e) {
        toast.error(formatApiError(e.response?.data?.detail) || e.message);
      }
    })();
  }, []);

  const debt = (me?.balance_due || 0) > 0;

  if (!me) return <div className="min-h-screen"><Navbar variant="dashboard" /><div className="p-10 text-slate-500">Loading…</div></div>;

  return (
    <div className="min-h-screen">
      <Navbar variant="dashboard" />
      <div className="max-w-6xl mx-auto px-6 py-8" data-testid="student-dashboard">
        {/* Greeting card */}
        <div className="cs-card p-7 flex flex-wrap items-center gap-6">
          <div className="w-24 h-32 rounded-md border bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
            {me.passport_url ? (
              <img src={me.passport_url} alt="passport" className="w-full h-full object-cover" />
            ) : (
              <div className="text-[10px] text-slate-400 text-center px-1">PASSPORT<br />PHOTO</div>
            )}
          </div>
          <div className="flex-1 min-w-[240px]">
            <span className="eyebrow">STUDENT PORTAL</span>
            <h1 className="font-display text-3xl font-bold cs-text-navy mt-1">Hello, {me.name.split(" ")[0]}</h1>
            <div className="text-sm text-slate-500 mt-1">{me.class_name} · {me.gender}, {me.age} years</div>
          </div>
          <div className="text-right">
            {debt ? (
              <>
                <div className="text-xs text-amber-700 font-bold flex items-center justify-end gap-1"><AlertTriangle size={12} /> FEES OUTSTANDING</div>
                <div className="font-display text-2xl font-extrabold text-red-600">₦{me.balance_due.toLocaleString()}</div>
              </>
            ) : (
              <Badge className="cs-bg-green text-white">Fees clear</Badge>
            )}
          </div>
        </div>

        {/* Subjects */}
        <div className="mt-8">
          <h2 className="font-display text-xl font-bold cs-text-navy">My subjects</h2>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {subjects.length ? subjects.map((s) => (
              <div key={s} className="cs-card p-4 flex items-center gap-2" data-testid={`subject-${s}`}>
                <div className="w-8 h-8 rounded-md cs-bg-blue text-white flex items-center justify-center"><BookOpen size={14} /></div>
                <div className="text-sm cs-text-navy font-medium">{s}</div>
              </div>
            )) : <div className="text-sm text-slate-500">No subjects assigned to your class yet.</div>}
          </div>
        </div>

        {/* CBT exams */}
        <div className="mt-10">
          <h2 className="font-display text-xl font-bold cs-text-navy">Computer-based tests</h2>
          <p className="text-sm text-slate-500 mt-1">Take your exams here. Each test is timed.</p>
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {exams.length ? exams.map((e) => {
              const completed = !!e.attempt?.completed_at;
              const score = e.attempt?.score_pct;
              return (
                <div key={e.id} className="cs-card p-5 flex flex-col" data-testid={`exam-card-${e.id}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-md cs-bg-navy text-white flex items-center justify-center"><FileText size={14} /></div>
                    <div className="text-xs uppercase tracking-wider text-slate-500">{e.subject}</div>
                  </div>
                  <h3 className="font-display font-bold text-lg cs-text-navy mt-3">{e.title}</h3>
                  <div className="text-xs text-slate-500 mt-1">{e.term} · {e.year} · {e.question_count} questions · {e.duration_min} min</div>
                  <div className="mt-5">
                    {completed ? (
                      <div className="flex items-center gap-2 text-sm">
                        <Trophy size={16} className="cs-text-green" />
                        <span className="font-semibold cs-text-navy">Score: {score}%</span>
                        <Badge className="cs-bg-green text-white ml-auto">Done</Badge>
                      </div>
                    ) : (
                      <Button
                        onClick={() => navigate(`/cbt/${e.id}`)}
                        className="cs-bg-green text-white hover:opacity-90 rounded-full w-full"
                        data-testid={`take-exam-${e.id}`}
                      >
                        <Play size={14} className="mr-1" /> Take exam
                      </Button>
                    )}
                  </div>
                </div>
              );
            }) : <div className="text-sm text-slate-500">No exams published yet.</div>}
          </div>
        </div>

        {/* Result Checker */}
        <div className="mt-10 cs-card p-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="font-display font-bold cs-text-navy text-lg">Term result</h3>
            <p className="text-sm text-slate-500 mt-1">View your full digital report card with QR verification.</p>
          </div>
          {debt ? (
            <Button disabled className="bg-slate-200 text-slate-500 rounded-full" data-testid="student-result-locked">
              <Lock size={14} className="mr-2" /> Locked — clear fees
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => navigate(`/report/${me.id}/1st%20Term`)}
                className="cs-bg-navy text-white hover:opacity-90 rounded-full btn-anim"
                data-testid="student-result-checker"
              >
                <CheckCircle2 size={14} className="mr-2" /> Term report
              </Button>
              <Button
                onClick={() => navigate(`/report/annual/${me.id}`)}
                variant="outline"
                className="rounded-full btn-anim"
                data-testid="student-annual-checker"
              >
                <CheckCircle2 size={14} className="mr-2" /> Annual session
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
