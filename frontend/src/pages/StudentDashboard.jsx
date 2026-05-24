import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar.jsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth.jsx";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { BookOpen, FileText, Lock, Play, Trophy, AlertTriangle, Mail, Paperclip, MessageSquare, LayoutDashboard } from "lucide-react";

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [exams, setExams] = useState([]);
  const [subjects, setSubjects] = useState([]);

  // ─── Messages & Materials (read-only, local-only) ───
  const [tab, setTab] = useState("overview"); // "overview" | "messages"
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const loadMessages = async () => {
    setMsgsLoading(true);
    try {
      const { data } = await api.get("/messages/my-stream");
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
      setUnreadCount(Number(data?.unread_count) || 0);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally { setMsgsLoading(false); }
  };
  useEffect(() => {
    // Always load once on mount so the unread badge is accurate even on overview.
    loadMessages();
  }, []);
  useEffect(() => {
    if (tab === "messages") loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const openMessage = async (m) => {
    if (m?.unread) {
      try { await api.post(`/messages/${m.id}/read`); } catch { /* silent */ }
      loadMessages();
    }
  };

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
        // Subjects only — academic progress analytics are restricted to the Parent Portal.
        const { data: subData } = await api.get(`/subjects`, { params: { class_name: student.class_name } });
        const list = subData.class_subjects?.[0]?.subjects || [];
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

        {/* ─── Top navigation pill (Overview | Messages & Materials) ─── */}
        <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 pb-1" data-testid="student-tabnav">
          {[
            { k: "overview", l: "Overview", I: LayoutDashboard },
            { k: "messages", l: "Messages & Materials", I: Mail, badge: unreadCount },
          ].map((t) => {
            const Icon = t.I;
            const active = tab === t.k;
            return (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-t-md text-sm transition-colors ${active ? "cs-bg-navy text-white font-semibold" : "text-slate-600 hover:bg-slate-100"}`}
                data-testid={`student-tab-${t.k}`}
              >
                <Icon size={14} />
                <span>{t.l}</span>
                {t.badge > 0 && (
                  <span className="inline-flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] h-[18px]" data-testid="student-msgs-badge">
                    {t.badge > 99 ? "99+" : `+${t.badge}`}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {tab === "overview" && (
        <>

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
          <p className="text-sm text-slate-500 mt-1">Take your exams here. Each test is timed.</p>          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Trophy size={16} className="cs-text-green" />
                          <span className="font-semibold cs-text-navy">Score: {score}%</span>
                          <Badge className="cs-bg-green text-white ml-auto">Done</Badge>
                        </div>
                        <Button
                          onClick={() => navigate(`/cbt/review/${e.attempt.id}`)}
                          variant="outline"
                          className="w-full rounded-full btn-anim text-xs"
                          data-testid={`review-exam-${e.id}`}
                        >
                          Review answers
                        </Button>
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

        {/* Progress charts and academic result access — restricted to Parent Portal */}
        <div className="mt-10 cs-card p-6 bg-slate-50/80 border border-slate-200" data-testid="student-results-locked-notice">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center flex-shrink-0">
              <Lock size={22} />
            </div>
            <div className="flex-1">
              <h3 className="font-display font-semibold text-slate-700 text-lg">Academic results are private</h3>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                Academic reports, termly grades, and mid-term results are restricted and only visible through the Parent Portal account.
              </p>
              <p className="text-xs text-slate-500 mt-3">
                If you need to discuss your performance, please ask your parent or guardian to log in to their portal, or speak to your class teacher directly.
              </p>
            </div>
          </div>
        </div>
        </>
        )}

        {tab === "messages" && (
          <div className="mt-6 cs-card p-6" data-testid="student-messages-pane">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-11 h-11 rounded-lg cs-bg-blue text-white flex items-center justify-center flex-shrink-0"><MessageSquare size={18} /></div>
              <div className="flex-1">
                <h3 className="font-display font-semibold cs-text-navy text-lg">Messages & Materials</h3>
                <p className="text-sm text-slate-500 mt-1" data-testid="student-msg-summary">
                  <span className="font-semibold cs-text-navy">{unreadCount}</span> unread · <span className="font-semibold">{messages.length}</span> total
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={loadMessages} disabled={msgsLoading} data-testid="student-msg-refresh">
                {msgsLoading ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
            <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1" data-testid="student-msg-list">
              {messages.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center text-sm text-slate-500" data-testid="student-msg-empty">
                  {msgsLoading ? "Loading…" : "No messages yet. Your teachers will post announcements, assignments and learning materials here."}
                </div>
              ) : messages.map((m) => (
                <button
                  key={m.id}
                  onClick={() => openMessage(m)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${m.unread ? "bg-emerald-50/50 border-emerald-200 hover:bg-emerald-50" : "bg-white border-slate-200 hover:bg-slate-50"}`}
                  data-testid={`student-msg-row-${m.id}`}
                >
                  <div className="flex items-start gap-2">
                    {m.unread && <span className="mt-1.5 w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <Badge className={m.message_type === "assignment" ? "cs-bg-blue text-white" : m.message_type === "material" ? "cs-bg-green text-white" : "cs-bg-navy text-white"}>{m.message_type}</Badge>
                        <span className="text-[11px] text-slate-500">
                          {m.target_role === "all" ? "Everyone" : m.target_role}{m.target_class ? ` · ${m.target_class}` : ""}
                        </span>
                      </div>
                      <div className="text-sm cs-text-navy whitespace-pre-wrap">{m.content}</div>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-500">
                        {m.attachment_url && (
                          <a
                            href={m.attachment_url}
                            target="_blank"
                            rel="noreferrer"
                            download
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 cs-text-blue hover:underline font-semibold"
                            data-testid={`student-msg-attachment-${m.id}`}
                          >
                            <Paperclip size={11} /> Download attachment
                          </a>
                        )}
                        <span>{m.created_at ? new Date(m.created_at).toLocaleString() : ""}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
