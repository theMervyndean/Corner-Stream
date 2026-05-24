import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar.jsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth.jsx";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Lock, FileText, AlertTriangle, Mail, Paperclip, MessageSquare, LayoutDashboard } from "lucide-react";
import { ChartCard, LineSeries } from "@/components/Charts.jsx";

function ChildProgress({ studentId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let active = true;
    api.get(`/analytics/student/${studentId}`)
      .then(({ data }) => { if (active) setData(data); })
      .catch(() => { /* silent — chart is optional */ });
    return () => { active = false; };
  }, [studentId]);
  if (!data || !data.series || data.series.length === 0) return null;
  return (
    <div className="mt-4" data-testid={`child-progress-${studentId}`}>
      <ChartCard title="Term progression" subtitle="Average across all subjects">
        <LineSeries data={data.series} xKey="term" yKey="average" color="#28A745" />
      </ChartCard>
    </div>
  );
}

export default function ParentPortal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [children, setChildren] = useState([]);

  // ─── Messages & Materials (read-only, local-only) ───
  const [tab, setTab] = useState("overview");
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
    api.get("/students").then(({ data }) => setChildren(data.students || []))
      .catch((e) => toast.error(formatApiError(e.response?.data?.detail) || e.message));
    // Initial unread badge load — does not block the overview render.
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

  return (
    <div className="min-h-screen">
      <Navbar variant="dashboard" />
      <div className="max-w-5xl mx-auto px-6 py-10" data-testid="parent-portal">
        <span className="eyebrow">PARENT PORTAL</span>
        <h1 className="font-display text-3xl font-bold cs-text-navy mt-1">Welcome, {user?.name}</h1>
        <p className="text-sm text-slate-500 mt-1">Access your child's results and fee balance.</p>

        {/* ─── Top navigation pill (Overview | Messages & Materials) ─── */}
        <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 pb-1" data-testid="parent-tabnav">
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
                data-testid={`parent-tab-${t.k}`}
              >
                <Icon size={14} />
                <span>{t.l}</span>
                {t.badge > 0 && (
                  <span className="inline-flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] h-[18px]" data-testid="parent-msgs-badge">
                    {t.badge > 99 ? "99+" : `+${t.badge}`}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {tab === "overview" && (
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
                {!debt && <ChildProgress studentId={c.id} />}
              </div>
            );
          })}
          {!children.length && (
            <div className="cs-card p-8 col-span-full text-center text-slate-500">
              No children linked to your email yet. Please ask the school admin to add your email to your child's profile.
            </div>
          )}
        </div>
        )}

        {tab === "messages" && (
          <div className="mt-6 cs-card p-6" data-testid="parent-messages-pane">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-11 h-11 rounded-lg cs-bg-blue text-white flex items-center justify-center flex-shrink-0"><MessageSquare size={18} /></div>
              <div className="flex-1">
                <h3 className="font-display font-semibold cs-text-navy text-lg">Messages & Materials</h3>
                <p className="text-sm text-slate-500 mt-1" data-testid="parent-msg-summary">
                  <span className="font-semibold cs-text-navy">{unreadCount}</span> unread · <span className="font-semibold">{messages.length}</span> total
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={loadMessages} disabled={msgsLoading} data-testid="parent-msg-refresh">
                {msgsLoading ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
            <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1" data-testid="parent-msg-list">
              {messages.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center text-sm text-slate-500" data-testid="parent-msg-empty">
                  {msgsLoading ? "Loading…" : "No messages yet. Class teachers and the school admin will post updates here."}
                </div>
              ) : messages.map((m) => (
                <button
                  key={m.id}
                  onClick={() => openMessage(m)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${m.unread ? "bg-emerald-50/50 border-emerald-200 hover:bg-emerald-50" : "bg-white border-slate-200 hover:bg-slate-50"}`}
                  data-testid={`parent-msg-row-${m.id}`}
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
                            data-testid={`parent-msg-attachment-${m.id}`}
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
