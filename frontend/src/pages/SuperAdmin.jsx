import React, { useEffect, useState, useMemo } from "react";
import Navbar from "@/components/Navbar.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import {
  Building2, Users, GraduationCap, Inbox, AlertTriangle, ShieldCheck,
  Receipt, BarChart3, UserPlus, KeyRound, Eye, Menu, X, ChevronRight,
  Calendar, Pause, Play, Award, Wallet, BookOpen, Layers, Settings2,
} from "lucide-react";
import { ChartCard, GrowthArea, DonutChart, BarSimple } from "@/components/Charts.jsx";

const NAV = [
  { key: "schools",     label: "Schools",             icon: Building2 },
  { key: "users",       label: "Users",               icon: Users },
  { key: "students",    label: "Students",            icon: GraduationCap },
  { key: "leads",       label: "Leads",               icon: Inbox },
  { key: "open_leads",  label: "Open Leads",          icon: AlertTriangle },
  { key: "awaiting",    label: "Awaiting Activation", icon: ShieldCheck },
  { key: "receipts",    label: "Bank Receipts",       icon: Receipt },
  { key: "analytics",   label: "Analytics",           icon: BarChart3 },
  { key: "add_super",   label: "Add Super Admin",     icon: UserPlus },
];

export default function SuperAdmin() {
  const [tab, setTab] = useState("schools");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // State buckets
  const [stats, setStats] = useState(null);
  const [schools, setSchools] = useState([]);
  const [usersAll, setUsersAll] = useState([]);
  const [studentsAll, setStudentsAll] = useState([]);
  const [leads, setLeads] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [verifQueue, setVerifQueue] = useState([]);

  // Dialogs
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [override, setOverride] = useState({ user_email: "", new_password: "" });
  const [viewReceipt, setViewReceipt] = useState(null);
  const [generatedCode, setGeneratedCode] = useState(null);
  const [newSuper, setNewSuper] = useState({ email: "", name: "", password: "" });

  const refresh = async () => {
    try {
      const [s, sc, u, st, l, r, an, vq] = await Promise.all([
        api.get("/superadmin/stats"),
        api.get("/superadmin/schools"),
        api.get("/superadmin/users"),
        api.get("/superadmin/students"),
        api.get("/leads"),
        api.get("/payments/bank-receipts"),
        api.get("/analytics/super"),
        api.get("/superadmin/verification-queue"),
      ]);
      setStats(s.data);
      setSchools(sc.data.schools || []);
      setUsersAll(u.data.users || []);
      setStudentsAll(st.data.students || []);
      setLeads(l.data.leads || []);
      setReceipts(r.data.receipts || []);
      setAnalytics(an.data);
      setVerifQueue(vq.data.items || []);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };
  useEffect(() => { refresh(); }, []);

  // ---- handlers (preserved from prior version) ----
  const toggleKill = async (id, current) => {
    try { await api.post(`/superadmin/schools/${id}/kill-switch`, { kill_switch: !current });
      toast.success(`Kill-switch ${!current ? "ENGAGED" : "released"}`); refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const submitOverride = async () => {
    try { await api.post("/superadmin/password-override", override);
      toast.success("Password updated"); setOverrideOpen(false); setOverride({ user_email: "", new_password: "" });
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const resolveLead = async (id) => {
    try { await api.put(`/leads/${id}/resolve`); toast.success("Lead resolved"); refresh(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const decideReceipt = async (id, decision) => {
    try { await api.post(`/payments/bank-receipts/${id}/decision`, { decision });
      toast.success(decision === "approve" ? "Receipt approved & subscription activated" : "Receipt rejected"); refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const openReceipt = async (id) => {
    try { const { data } = await api.get(`/payments/bank-receipts/${id}`); setViewReceipt(data.receipt); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const generateCode = async (schoolId, schoolName, whatsapp) => {
    try { const { data } = await api.post(`/superadmin/schools/${schoolId}/whatsapp-code`);
      setGeneratedCode({ code: data.code, school_name: schoolName, whatsapp_phone: whatsapp || data.whatsapp_phone }); refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const verifyDecision = async (schoolId, decision) => {
    try { await api.post(`/superadmin/schools/${schoolId}/verify`, { decision });
      toast.success(decision === "approve" ? "School activated. Dashboard unlocked." : "School marked rejected."); refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const addSuperAdmin = async () => {
    if (!newSuper.email || !newSuper.password || !newSuper.name) { toast.error("Email, name and password required"); return; }
    try { await api.post("/superadmin/add-super-admin", newSuper);
      toast.success(`Super admin ${newSuper.email} created`); setNewSuper({ email: "", name: "", password: "" }); refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  const updateTier = async (schoolId, tier) => {
    if (!window.confirm(`Switch this school to ${tier.replace(/_/g, " ")}? Subscription expiry resets to today + full session.`)) return;
    try {
      await api.patch(`/superadmin/schools/${schoolId}/tier`, { tier, duration: "full_session" });
      toast.success(`Tier updated → ${tier.replace(/_/g, " ")}`);
      refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const cancelSubscription = async (schoolId, schoolName) => {
    if (!window.confirm(`Cancel subscription for ${schoolName}? This pauses the dashboard AND marks the school as rejected. Use with care.`)) return;
    try {
      await api.post(`/superadmin/schools/${schoolId}/kill-switch`, { kill_switch: true });
      await api.post(`/superadmin/schools/${schoolId}/verify`, { decision: "reject", note: "Subscription cancelled by Super Admin" });
      toast.success("Subscription cancelled");
      refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  // ---- derived counts ----
  const openLeads = useMemo(() => leads.filter((l) => !l.resolved), [leads]);
  const badge = (key) => {
    if (key === "open_leads") return openLeads.length;
    if (key === "awaiting") return verifQueue.length;
    return 0;
  };

  const pickPane = (k) => { setTab(k); setDrawerOpen(false); };

  // ---- panes ----
  const KpiRow = () => stats && (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {[
        { i: Building2, l: "Schools", v: stats.schools },
        { i: Users, l: "Users", v: stats.users },
        { i: GraduationCap, l: "Students", v: stats.students },
        { i: Inbox, l: "Leads", v: stats.leads },
        { i: AlertTriangle, l: "Open leads", v: stats.open_leads },
        { i: ShieldCheck, l: "Awaiting", v: stats.pending_schools ?? 0 },
      ].map((s, i) => {
        const Icon = s.i;
        return (
          <div key={i} className="cs-card p-3 flex items-center gap-3" data-testid={`super-stat-${i}`}>
            <div className="w-9 h-9 rounded-md cs-bg-navy text-white flex items-center justify-center"><Icon size={16} /></div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 truncate">{s.l}</div>
              <div className="font-display text-xl font-bold cs-text-navy">{s.v}</div>
            </div>
          </div>
        );
      })}
    </div>
  );

  // Schools pane: tier filter + responsive card grid
  const TIER_META = [
    { key: "cbt_essentials",     label: "CBT Exams",          icon: BookOpen,  color: "#0056B3" },
    { key: "financial_ledger",   label: "Financial Reports",  icon: Wallet,    color: "#28A745" },
    { key: "digital_reports",    label: "Digital Results",    icon: Award,     color: "#002147" },
    { key: "unified_enterprise", label: "Unified Enterprise", icon: Layers,    color: "#7c3aed" },
  ];
  const [tierFilter, setTierFilter] = useState("all");

  const SchoolsPane = () => {
    const counts = useMemo(() => {
      const c = { all: schools.length };
      TIER_META.forEach((t) => { c[t.key] = schools.filter((s) => s.subscription_tier === t.key).length; });
      return c;
    }, []);
    const filtered = tierFilter === "all" ? schools : schools.filter((s) => s.subscription_tier === tierFilter);

    const SchoolCard = ({ s }) => {
      const tierMeta = TIER_META.find((t) => t.key === s.subscription_tier);
      const active = s.verification_status === "active" && !s.kill_switch;
      const expires = s.subscription_expires_at ? new Date(s.subscription_expires_at) : null;
      const daysLeft = expires ? Math.ceil((expires - new Date()) / (1000 * 60 * 60 * 24)) : null;
      const expColor = daysLeft == null ? "text-slate-400"
        : daysLeft < 0 ? "text-red-600"
        : daysLeft <= 14 ? "text-red-600"
        : daysLeft <= 30 ? "text-amber-600"
        : "text-slate-600";
      const TierIcon = tierMeta?.icon || Building2;
      const [tierOpen, setTierOpen] = useState(false);
      return (
        <div className="cs-card p-5 flex flex-col gap-3 border-t-4" style={{ borderTopColor: tierMeta?.color || "#64748b" }} data-testid={`school-card-${s.id}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-display font-bold cs-text-navy text-base truncate" title={s.name}>{s.name}</div>
              <div className="text-[11px] text-slate-500 capitalize">{s.school_type || "—"} · Registered {(s.created_at || "").slice(0, 10)}</div>
            </div>
            <Badge className={active ? "cs-bg-green text-white" : s.kill_switch ? "bg-red-500 text-white" : "bg-amber-500 text-white"} data-testid={`school-status-${s.id}`}>
              {active ? "Active" : s.kill_switch ? "Paused" : s.verification_status || "Pending"}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md p-2 flex items-center gap-2" style={{ backgroundColor: `${tierMeta?.color || "#64748b"}15` }}>
              <TierIcon size={14} style={{ color: tierMeta?.color || "#64748b" }} />
              <div className="min-w-0">
                <div className="text-[10px] text-slate-500 uppercase">Plan</div>
                <div className="font-semibold truncate" style={{ color: tierMeta?.color || "#64748b" }}>{tierMeta?.label || (s.subscription_tier || "—").replace(/_/g, " ")}</div>
              </div>
            </div>
            <div className="rounded-md p-2 flex items-center gap-2 bg-slate-50">
              <Calendar size={14} className="text-slate-500 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] text-slate-500 uppercase">Expires</div>
                <div className={`font-semibold ${expColor}`} data-testid={`school-deadline-${s.id}`}>
                  {expires ? expires.toISOString().slice(0, 10) : "—"}
                  {daysLeft != null && <span className="ml-1 text-[10px]">({daysLeft < 0 ? "expired" : `${daysLeft}d`})</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t">
            <Switch checked={!!s.kill_switch} onCheckedChange={() => toggleKill(s.id, s.kill_switch)} data-testid={`kill-${s.id}`} title={s.kill_switch ? "Resume school" : "Pause school"} />
            <span className="text-[10px] text-slate-500 -ml-1 flex-1">{s.kill_switch ? "Paused" : "Active"}</span>
            <Button size="sm" variant="outline" onClick={() => setTierOpen((v) => !v)} className="text-xs" data-testid={`upgrade-btn-${s.id}`}>
              <Settings2 size={12} className="mr-1" /> Plan
            </Button>
            <Button size="sm" variant="destructive" onClick={() => cancelSubscription(s.id, s.name)} className="text-xs" data-testid={`cancel-btn-${s.id}`}>Cancel</Button>
          </div>

          {tierOpen && (
            <div className="mt-1 grid grid-cols-2 gap-2 p-2 rounded-md bg-slate-50 border">
              {TIER_META.map((t) => {
                const TIcon = t.icon;
                const isCurrent = s.subscription_tier === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => { setTierOpen(false); if (!isCurrent) updateTier(s.id, t.key); }}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-[11px] font-semibold transition ${isCurrent ? "bg-white border-2" : "bg-white border hover:shadow-sm"}`}
                    style={{ borderColor: isCurrent ? t.color : undefined, color: t.color }}
                    disabled={isCurrent}
                    data-testid={`tier-opt-${s.id}-${t.key}`}
                  >
                    <TIcon size={12} /> {t.label}{isCurrent && " ✓"}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    };

    return (
      <div>
        {/* Tier filter row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5" data-testid="school-tier-filters">
          <button
            onClick={() => setTierFilter("all")}
            className={`cs-card p-3 text-left transition ${tierFilter === "all" ? "ring-2 ring-slate-900 shadow-md" : "hover:shadow-md"}`}
            data-testid="tier-filter-all"
          >
            <div className="text-[10px] uppercase tracking-wider text-slate-500">All schools</div>
            <div className="font-display text-2xl font-bold cs-text-navy mt-1">{counts.all}</div>
          </button>
          {TIER_META.map((t) => {
            const Icon = t.icon;
            const isActive = tierFilter === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTierFilter(t.key)}
                className={`cs-card p-3 text-left transition border-l-4 ${isActive ? "shadow-md ring-2" : "hover:shadow-md"}`}
                style={{ borderLeftColor: t.color, ...(isActive ? { ringColor: t.color } : {}) }}
                data-testid={`tier-filter-${t.key}`}
              >
                <div className="flex items-center gap-2">
                  <Icon size={14} style={{ color: t.color }} />
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 truncate">{t.label}</div>
                </div>
                <div className="font-display text-2xl font-bold mt-1" style={{ color: t.color }}>{counts[t.key]}</div>
              </button>
            );
          })}
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="school-cards-grid">
          {filtered.map((s) => <SchoolCard key={s.id} s={s} />)}
          {!filtered.length && (
            <div className="col-span-full cs-card p-10 text-center text-slate-500">
              {tierFilter === "all" ? "No schools registered." : `No schools on the ${TIER_META.find((t) => t.key === tierFilter)?.label} plan yet.`}
            </div>
          )}
        </div>
      </div>
    );
  };

  const UsersPane = () => (
    <div className="cs-card overflow-x-auto">
      <Table>
        <TableHeader><TableRow className="cs-bg-navy hover:cs-bg-navy">
          <TableHead className="text-white">Email</TableHead>
          <TableHead className="text-white">Name</TableHead>
          <TableHead className="text-white">Role</TableHead>
          <TableHead className="text-white">School</TableHead>
          <TableHead className="text-white">Created</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {usersAll.map((u, i) => (
            <TableRow key={u.id} className={i % 2 ? "bg-slate-50" : ""} data-testid={`user-row-${u.id}`}>
              <TableCell className="text-xs">{u.email}</TableCell>
              <TableCell className="text-sm">{u.name || "—"}</TableCell>
              <TableCell className="text-xs"><Badge className="cs-bg-blue text-white">{u.role}</Badge></TableCell>
              <TableCell className="text-xs">{u.school_name}</TableCell>
              <TableCell className="text-[11px] text-slate-500">{(u.created_at || "").slice(0, 10)}</TableCell>
            </TableRow>
          ))}
          {!usersAll.length && <TableRow><TableCell colSpan={5} className="text-center text-slate-500 py-8">No users.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );

  const StudentsPane = () => (
    <div className="cs-card overflow-x-auto">
      <Table>
        <TableHeader><TableRow className="cs-bg-navy hover:cs-bg-navy">
          <TableHead className="text-white">Name</TableHead>
          <TableHead className="text-white">Class</TableHead>
          <TableHead className="text-white">School</TableHead>
          <TableHead className="text-white">Age/Gender</TableHead>
          <TableHead className="text-white">Balance</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {studentsAll.map((s, i) => (
            <TableRow key={s.id} className={i % 2 ? "bg-slate-50" : ""} data-testid={`student-row-${s.id}`}>
              <TableCell className="font-medium text-sm">{s.name}</TableCell>
              <TableCell className="text-xs">{s.class_name}</TableCell>
              <TableCell className="text-xs">{s.school_name}</TableCell>
              <TableCell className="text-xs">{s.gender}, {s.age}</TableCell>
              <TableCell className="text-xs">{(s.balance_due || 0) > 0 ? <Badge className="bg-amber-500 text-white">₦{Number(s.balance_due).toLocaleString()}</Badge> : <Badge className="cs-bg-green text-white">Clear</Badge>}</TableCell>
            </TableRow>
          ))}
          {!studentsAll.length && <TableRow><TableCell colSpan={5} className="text-center text-slate-500 py-8">No students.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );

  const LeadsPane = ({ openOnly = false }) => {
    const rows = openOnly ? openLeads : leads;
    return (
      <div className="cs-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="cs-bg-navy hover:cs-bg-navy">
            <TableHead className="text-white">Name</TableHead>
            <TableHead className="text-white">Email</TableHead>
            <TableHead className="text-white">School</TableHead>
            <TableHead className="text-white">Message</TableHead>
            <TableHead className="text-white">Status</TableHead>
            <TableHead className="text-white"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((l, i) => (
              <TableRow key={l.id} className={i % 2 ? "bg-slate-50" : ""} data-testid={`lead-row-${l.id}`}>
                <TableCell className="text-sm">{l.name}</TableCell>
                <TableCell className="text-xs">{l.email}</TableCell>
                <TableCell className="text-xs">{l.school || "—"}</TableCell>
                <TableCell className="text-xs max-w-md truncate" title={l.message}>{l.message}</TableCell>
                <TableCell>{l.resolved ? <Badge className="cs-bg-green text-white">Resolved</Badge> : <Badge className="bg-amber-500 text-white">Open</Badge>}</TableCell>
                <TableCell>{!l.resolved && <Button size="sm" variant="outline" onClick={() => resolveLead(l.id)} data-testid={`lead-resolve-${l.id}`}>Resolve</Button>}</TableCell>
              </TableRow>
            ))}
            {!rows.length && <TableRow><TableCell colSpan={6} className="text-center text-slate-500 py-8">{openOnly ? "No open leads." : "No leads."}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    );
  };

  const AwaitingPane = () => (
    <div className="cs-card overflow-x-auto">
      <Table>
        <TableHeader><TableRow className="cs-bg-navy hover:cs-bg-navy">
          <TableHead className="text-white">School</TableHead>
          <TableHead className="text-white">Admin</TableHead>
          <TableHead className="text-white">WhatsApp</TableHead>
          <TableHead className="text-white">Status</TableHead>
          <TableHead className="text-white">Code</TableHead>
          <TableHead className="text-white">Receipt</TableHead>
          <TableHead className="text-white">Typed</TableHead>
          <TableHead className="text-white">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {verifQueue.map((q, i) => {
            const codeMatches = q.verification_code && q.latest_receipt?.whatsapp_code && q.verification_code === q.latest_receipt.whatsapp_code;
            return (
              <TableRow key={q.school_id} className={i % 2 ? "bg-slate-50" : ""} data-testid={`verif-row-${q.school_id}`}>
                <TableCell className="font-medium text-sm">{q.school_name}</TableCell>
                <TableCell className="text-xs">{q.admin_email}</TableCell>
                <TableCell className="text-xs font-mono">{q.whatsapp_phone || "—"}</TableCell>
                <TableCell><Badge className={q.verification_status === "pending_payment" ? "bg-amber-500 text-white" : "cs-bg-blue text-white"}>{q.verification_status}</Badge></TableCell>
                <TableCell className="font-mono text-sm">{q.verification_code ? <span className="cs-text-blue font-bold">{q.verification_code}</span> : <span className="text-slate-400">—</span>}</TableCell>
                <TableCell>{q.latest_receipt ? <Button size="sm" variant="outline" onClick={() => openReceipt(q.latest_receipt.id)}><Eye size={14} /></Button> : <span className="text-xs text-slate-400">—</span>}</TableCell>
                <TableCell>{q.latest_receipt?.whatsapp_code ? <span className={`font-mono text-sm font-bold ${codeMatches ? "cs-text-green" : "text-amber-600"}`}>{q.latest_receipt.whatsapp_code} {codeMatches && "✓"}</span> : <span className="text-xs text-slate-400">—</span>}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => generateCode(q.school_id, q.school_name, q.whatsapp_phone)} data-testid={`verif-gen-${q.school_id}`}>{q.verification_code ? "Regenerate" : "Generate"}</Button>
                    {q.latest_receipt && <>
                      <Button size="sm" className="cs-bg-green text-white hover:opacity-90" onClick={() => verifyDecision(q.school_id, "approve")} data-testid={`verif-approve-${q.school_id}`}>Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => verifyDecision(q.school_id, "reject")} data-testid={`verif-reject-${q.school_id}`}>Reject</Button>
                    </>}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {!verifQueue.length && <TableRow><TableCell colSpan={8} className="text-center text-slate-500 py-10">No schools awaiting activation.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );

  const ReceiptsPane = () => (
    <div className="cs-card overflow-x-auto">
      <Table>
        <TableHeader><TableRow className="cs-bg-navy hover:cs-bg-navy">
          <TableHead className="text-white">When</TableHead>
          <TableHead className="text-white">From</TableHead>
          <TableHead className="text-white">Tier</TableHead>
          <TableHead className="text-white">Amount</TableHead>
          <TableHead className="text-white">Status</TableHead>
          <TableHead className="text-white">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {receipts.map((r, i) => (
            <TableRow key={r.id} className={i % 2 ? "bg-slate-50" : ""} data-testid={`receipt-row-${r.id}`}>
              <TableCell className="text-[11px] text-slate-500">{(r.created_at || "").slice(0, 16).replace("T", " ")}</TableCell>
              <TableCell className="text-xs">{r.submitted_by}</TableCell>
              <TableCell className="text-xs">{(r.tier || "").replace(/_/g, " ")}</TableCell>
              <TableCell className="text-sm font-semibold">₦{Number(r.amount_ngn || 0).toLocaleString()}</TableCell>
              <TableCell><Badge className={r.status === "approved" ? "cs-bg-green text-white" : r.status === "rejected" ? "bg-red-500 text-white" : "bg-amber-500 text-white"}>{r.status}</Badge></TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => openReceipt(r.id)} data-testid={`rcp-view-${r.id}`}><Eye size={12} /></Button>
                  {r.status === "pending" && <>
                    <Button size="sm" className="cs-bg-green text-white hover:opacity-90" onClick={() => decideReceipt(r.id, "approve")} data-testid={`rcp-approve-${r.id}`}>Approve</Button>
                    <Button size="sm" variant="destructive" onClick={() => decideReceipt(r.id, "reject")} data-testid={`rcp-reject-${r.id}`}>Reject</Button>
                  </>}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {!receipts.length && <TableRow><TableCell colSpan={6} className="text-center text-slate-500 py-8">No receipts yet.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );

  const AnalyticsPane = () => analytics ? (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Schools by tier">
        <DonutChart data={(analytics.schools_by_tier || []).map((d) => ({ name: d.tier?.replace(/_/g, " ") || "—", value: d.count }))} />
      </ChartCard>
      <ChartCard title="MRR (₦) over time">
        <GrowthArea data={(analytics.mrr_over_time || []).map((d) => ({ name: d.month, value: d.mrr }))} />
      </ChartCard>
      <ChartCard title="Schools created per month" className="lg:col-span-2">
        <BarSimple data={(analytics.schools_per_month || []).map((d) => ({ name: d.month, value: d.count }))} />
      </ChartCard>
    </div>
  ) : <div className="text-slate-500">Loading analytics…</div>;

  const AddSuperAdminPane = () => (
    <div className="cs-card p-6 max-w-xl">
      <div className="font-display font-bold cs-text-navy text-lg">Create another Super Admin</div>
      <p className="text-xs text-slate-500 mt-1">Only Mervyn-trusted accounts. The new account has full God-mode access.</p>
      <div className="mt-4 space-y-3">
        <div><Label>Email</Label><Input type="email" value={newSuper.email} onChange={(e) => setNewSuper({ ...newSuper, email: e.target.value })} data-testid="newsuper-email" /></div>
        <div><Label>Name</Label><Input value={newSuper.name} onChange={(e) => setNewSuper({ ...newSuper, name: e.target.value })} data-testid="newsuper-name" /></div>
        <div><Label>Password</Label><Input type="password" value={newSuper.password} onChange={(e) => setNewSuper({ ...newSuper, password: e.target.value })} data-testid="newsuper-password" /></div>
        <Button onClick={addSuperAdmin} className="cs-bg-navy text-white hover:opacity-90 rounded-full" data-testid="newsuper-submit"><UserPlus size={14} className="mr-2" /> Create Super Admin</Button>
      </div>
    </div>
  );

  const pane = {
    schools: <SchoolsPane />,
    users: <UsersPane />,
    students: <StudentsPane />,
    leads: <LeadsPane openOnly={false} />,
    open_leads: <LeadsPane openOnly={true} />,
    awaiting: <AwaitingPane />,
    receipts: <ReceiptsPane />,
    analytics: <AnalyticsPane />,
    add_super: <AddSuperAdminPane />,
  }[tab];

  const currentLabel = NAV.find((n) => n.key === tab)?.label || "Super Admin Dashboard";

  // ---- SIDEBAR (shared markup for desktop + mobile drawer) ----
  const SidebarContent = ({ onClickItem }) => (
    <div className="h-full flex flex-col" style={{ background: "linear-gradient(180deg, #001a38 0%, #002147 100%)" }}>
      <div className="px-3 py-5 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-md cs-bg-green text-white flex items-center justify-center flex-shrink-0"><ShieldCheck size={18} /></div>
          <div className="hidden lg:block">
            <div className="font-display font-bold text-white text-sm leading-tight">Corner Streams</div>
            <div className="text-[10px] text-white/60 uppercase tracking-wider">Super Admin</div>
          </div>
        </div>
        <button className="lg:hidden text-white/70 hover:text-white" onClick={() => setDrawerOpen(false)} data-testid="super-drawer-close"><X size={18} /></button>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = tab === n.key;
          const b = badge(n.key);
          return (
            <button
              key={n.key}
              onClick={() => onClickItem(n.key)}
              data-testid={`super-nav-${n.key}`}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition ${active ? "bg-white/15 text-white font-semibold" : "text-white/70 hover:bg-white/5 hover:text-white"}`}
              title={n.label}
            >
              <Icon size={18} className="flex-shrink-0" />
              <span className="lg:inline hidden">{n.label}</span>
              <span className="inline lg:hidden flex-1 text-left">{n.label}</span>
              {b > 0 && <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0">{b}</Badge>}
              {active && <ChevronRight size={14} className="ml-auto hidden lg:inline" />}
            </button>
          );
        })}
      </nav>
      <div className="p-2 border-t border-white/10">
        <Button onClick={() => setOverrideOpen(true)} className="w-full bg-white/10 hover:bg-white/20 text-white rounded-md text-xs h-9 justify-start gap-2 border border-white/10" data-testid="open-pw-override">
          <KeyRound size={14} /> <span className="hidden lg:inline">Password override</span><span className="inline lg:hidden">Password override</span>
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar variant="dashboard" />

      {/* Desktop sidebar: ≥640 icon-only strip, ≥1024 full label */}
      <aside className="hidden sm:block fixed left-0 top-14 bottom-0 z-30 w-16 lg:w-56 border-r" data-testid="super-sidebar-desktop">
        <SidebarContent onClickItem={(k) => setTab(k)} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="sm:hidden fixed inset-0 z-40" data-testid="super-drawer">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 shadow-xl">
            <SidebarContent onClickItem={pickPane} />
          </aside>
        </div>
      )}

      <main className="sm:ml-16 lg:ml-56 px-4 sm:px-6 lg:px-8 py-6" data-testid="super-admin">
        {/* Mobile header with hamburger */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div className="flex items-center gap-3">
            <button className="sm:hidden p-2 rounded-md border border-slate-200 bg-white" onClick={() => setDrawerOpen(true)} data-testid="super-hamburger"><Menu size={18} /></button>
            <div>
              <span className="eyebrow">CORNER STREAMS</span>
              <h1 className="font-display text-2xl sm:text-3xl font-bold cs-text-navy mt-1" data-testid="super-title">Super Admin Dashboard</h1>
              <p className="text-xs text-slate-500 mt-0.5">{currentLabel}</p>
            </div>
          </div>
        </div>

        <KpiRow />

        <div className="mt-2">
          <h2 className="font-display text-lg font-bold cs-text-navy mb-3">{currentLabel}</h2>
          {pane}
        </div>
      </main>

      {/* Password override dialog */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Password override</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="user email" value={override.user_email} onChange={(e) => setOverride({ ...override, user_email: e.target.value })} data-testid="pw-override-email" />
            <Input type="password" placeholder="new password" value={override.new_password} onChange={(e) => setOverride({ ...override, new_password: e.target.value })} data-testid="pw-override-password" />
          </div>
          <DialogFooter><Button onClick={submitOverride} className="cs-bg-navy text-white" data-testid="pw-override-submit">Update password</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generated code dialog */}
      <Dialog open={!!generatedCode} onOpenChange={(o) => !o && setGeneratedCode(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>WhatsApp this code to the school</DialogTitle></DialogHeader>
          {generatedCode && (
            <div className="space-y-4">
              <div className="text-sm text-slate-600">Send this code to <b>{generatedCode.school_name}</b> on WhatsApp.</div>
              <div className="text-center"><div className="font-mono text-5xl tracking-widest font-bold cs-text-navy py-4 bg-slate-50 rounded-lg border" data-testid="generated-code">{generatedCode.code}</div></div>
              <div className="text-xs text-slate-500">Send to: <b>{generatedCode.whatsapp_phone || "(no number)"}</b></div>
              {generatedCode.whatsapp_phone && (
                <a href={`https://wa.me/${generatedCode.whatsapp_phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hello — your Corner Streams activation code for ${generatedCode.school_name} is: ${generatedCode.code}. Paste it on the verification page to unlock your dashboard.`)}`}
                   target="_blank" rel="noreferrer"
                   className="inline-flex items-center justify-center w-full rounded-full text-white font-semibold h-10 btn-anim"
                   style={{ backgroundColor: "#25D366" }}>Open WhatsApp with this message</a>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View receipt dialog */}
      <Dialog open={!!viewReceipt} onOpenChange={(o) => !o && setViewReceipt(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Receipt</DialogTitle></DialogHeader>
          {viewReceipt && (
            <div className="space-y-3 text-sm">
              <div><span className="text-xs text-slate-500">From:</span> {viewReceipt.submitted_by}</div>
              <div><span className="text-xs text-slate-500">Tier:</span> {viewReceipt.tier} · {viewReceipt.duration}</div>
              <div><span className="text-xs text-slate-500">Amount:</span> ₦{Number(viewReceipt.amount_ngn || 0).toLocaleString()}</div>
              {viewReceipt.note && <div><span className="text-xs text-slate-500">Note:</span> {viewReceipt.note}</div>}
              {viewReceipt.whatsapp_code && <div><span className="text-xs text-slate-500">Code typed:</span> <span className="font-mono font-bold">{viewReceipt.whatsapp_code}</span></div>}
              {viewReceipt.file_data_url && <img src={viewReceipt.file_data_url} alt="receipt" className="w-full rounded border" />}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
