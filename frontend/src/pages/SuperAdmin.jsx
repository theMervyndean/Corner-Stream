import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar.jsx";
import { useAuth } from "@/lib/auth.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import {
  Building2, Users, GraduationCap, Inbox, AlertTriangle, ShieldCheck,
  Receipt, BarChart3, UserPlus, KeyRound, Eye, Menu, X, ChevronRight,
  Calendar, Award, Wallet, BookOpen, Layers, Settings2, Search, FilterX,
  LogOut, ChevronLeft, Headphones,
} from "lucide-react";
import { ChartCard, GrowthArea, DonutChart, BarSimple } from "@/components/Charts.jsx";

const PAGE_SIZE = 12; // cards per page on long lists

const NAV = [
  { key: "schools",    label: "Schools",             icon: Building2 },
  { key: "users",      label: "Users",               icon: Users },
  { key: "students",   label: "Students",            icon: GraduationCap },
  { key: "leads",      label: "Leads",               icon: Inbox },
  { key: "open_leads", label: "Open Leads",          icon: AlertTriangle },
  { key: "awaiting",   label: "Awaiting Activation", icon: ShieldCheck },
  { key: "receipts",   label: "Bank Receipts",       icon: Receipt },
  { key: "analytics",  label: "Analytics",           icon: BarChart3 },
  { key: "add_super",  label: "Add Super Admin",     icon: UserPlus },
];

const TIER_META = [
  { key: "cbt_essentials",     label: "CBT Exams",          icon: BookOpen, color: "#0056B3" },
  { key: "financial_ledger",   label: "Financial Reports",  icon: Wallet,   color: "#28A745" },
  { key: "digital_reports",    label: "Digital Results",    icon: Award,    color: "#002147" },
  { key: "unified_enterprise", label: "Unified Enterprise", icon: Layers,   color: "#7c3aed" },
];

// helper: school initials for logo placeholder
const initialsOf = (name) => (name || "?").split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
// helper: date in ISO yyyy-mm-dd
const ymd = (s) => (s ? new Date(s).toISOString().slice(0, 10) : "");
// helper: date range match
const inRange = (iso, from, to) => {
  if (!iso) return !(from || to);
  const d = ymd(iso);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
};

export default function SuperAdmin() {
  const { user: authUser, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("schools");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Pagination state per long list
  const [schoolsPage, setSchoolsPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const [receiptsPage, setReceiptsPage] = useState(1);

  // Support-access (impersonation) state
  const [supportTarget, setSupportTarget] = useState(null);   // school object
  const [supportLoading, setSupportLoading] = useState(false);

  // Data buckets
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

  // Schools-pane controls
  const [tierFilter, setTierFilter] = useState("all");
  const [schoolSearch, setSchoolSearch] = useState("");
  const [schoolFrom, setSchoolFrom] = useState("");
  const [schoolTo, setSchoolTo] = useState("");
  const [tierPickerForId, setTierPickerForId] = useState(null);

  // Users-pane controls
  const [userSearch, setUserSearch] = useState("");
  const [userFrom, setUserFrom] = useState("");
  const [userTo, setUserTo] = useState("");

  // Receipts-pane controls
  const [receiptSearch, setReceiptSearch] = useState("");
  const [receiptFrom, setReceiptFrom] = useState("");
  const [receiptTo, setReceiptTo] = useState("");

  // ---- fetch ----
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
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  useEffect(() => { refresh(); }, []);

  // ---- handlers ----
  const toggleKill = async (id, current) => {
    try {
      await api.post(`/superadmin/schools/${id}/kill-switch`, { kill_switch: !current });
      toast.success(`Kill-switch ${!current ? "ENGAGED" : "released"}`); refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const submitOverride = async () => {
    try {
      await api.post("/superadmin/password-override", override);
      toast.success("Password updated"); setOverrideOpen(false); setOverride({ user_email: "", new_password: "" });
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const resolveLead = async (id) => {
    try { await api.put(`/leads/${id}/resolve`); toast.success("Lead resolved"); refresh(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const decideReceipt = async (id, decision) => {
    try {
      await api.post(`/payments/bank-receipts/${id}/decision`, { decision });
      toast.success(decision === "approve" ? "Receipt approved & subscription activated" : "Receipt rejected"); refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const openReceipt = async (id) => {
    try { const { data } = await api.get(`/payments/bank-receipts/${id}`); setViewReceipt(data.receipt); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const generateCode = async (schoolId, schoolName, whatsapp) => {
    try {
      const { data } = await api.post(`/superadmin/schools/${schoolId}/whatsapp-code`);
      setGeneratedCode({ code: data.code, school_name: schoolName, whatsapp_phone: whatsapp || data.whatsapp_phone });
      refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const verifyDecision = async (schoolId, decision) => {
    try {
      await api.post(`/superadmin/schools/${schoolId}/verify`, { decision });
      toast.success(decision === "approve" ? "School activated. Dashboard unlocked." : "School marked rejected."); refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const updateTier = async (schoolId, tier) => {
    if (!window.confirm(`Switch to ${tier.replace(/_/g, " ")}? Subscription expiry resets.`)) return;
    try {
      await api.patch(`/superadmin/schools/${schoolId}/tier`, { tier, duration: "full_session" });
      toast.success(`Tier updated → ${tier.replace(/_/g, " ")}`); refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const cancelSubscription = async (schoolId, schoolName) => {
    if (!window.confirm(`Cancel subscription for ${schoolName}? This pauses + rejects the school.`)) return;
    try {
      await api.post(`/superadmin/schools/${schoolId}/kill-switch`, { kill_switch: true });
      await api.post(`/superadmin/schools/${schoolId}/verify`, { decision: "reject", note: "Cancelled by Super Admin" });
      toast.success("Subscription cancelled"); refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const addSuperAdmin = async () => {
    if (!newSuper.email || !newSuper.password || !newSuper.name) { toast.error("Email, name and password required"); return; }
    try {
      await api.post("/superadmin/add-super-admin", newSuper);
      toast.success(`Super admin ${newSuper.email} created`);
      setNewSuper({ email: "", name: "", password: "" }); refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  const handleLogout = async () => {
    try { await logout(); } catch {}
    navigate("/");
  };

  const confirmSupportAccess = async () => {
    if (!supportTarget) return;
    setSupportLoading(true);
    try {
      const { data } = await api.post(`/superadmin/schools/${supportTarget.id}/impersonate`);
      // Preserve the original super-admin token so the user can return later if a UI is added
      const currentToken = localStorage.getItem("cs_token");
      if (currentToken) localStorage.setItem("cs_super_token_backup", currentToken);
      localStorage.setItem("cs_token", data.token);
      toast.success(`Now viewing ${data.school_name} as school admin`);
      setSupportTarget(null);
      // Hard reload so the app picks up the new token via /auth/me
      window.location.href = "/dashboard/school";
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSupportLoading(false);
    }
  };

  // ---- derivations ----
  const openLeads = useMemo(() => leads.filter((l) => !l.resolved), [leads]);
  const badge = (key) => key === "open_leads" ? openLeads.length : key === "awaiting" ? verifQueue.length : 0;

  // Per-school student count + staff count (staff = school_admin + teacher)
  const studentsBySchool = useMemo(() => {
    const m = {};
    studentsAll.forEach((s) => { m[s.school_id] = (m[s.school_id] || 0) + 1; });
    return m;
  }, [studentsAll]);
  const staffBySchool = useMemo(() => {
    const m = {};
    usersAll.forEach((u) => {
      if (["school_admin", "teacher"].includes(u.role) && u.school_id) m[u.school_id] = (m[u.school_id] || 0) + 1;
    });
    return m;
  }, [usersAll]);

  // Filtered lists
  const filteredSchools = useMemo(() => {
    const q = schoolSearch.trim().toLowerCase();
    return schools.filter((s) => {
      if (tierFilter !== "all" && s.subscription_tier !== tierFilter) return false;
      if (q && !(s.name || "").toLowerCase().includes(q)) return false;
      if ((schoolFrom || schoolTo) && !inRange(s.created_at, schoolFrom, schoolTo)) return false;
      return true;
    });
  }, [schools, tierFilter, schoolSearch, schoolFrom, schoolTo]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return usersAll.filter((u) => {
      const blob = `${u.email || ""} ${u.name || ""} ${u.role || ""} ${u.school_name || ""}`.toLowerCase();
      if (q && !blob.includes(q)) return false;
      if ((userFrom || userTo) && !inRange(u.created_at, userFrom, userTo)) return false;
      return true;
    });
  }, [usersAll, userSearch, userFrom, userTo]);

  const filteredReceipts = useMemo(() => {
    const q = receiptSearch.trim().toLowerCase();
    return receipts.filter((r) => {
      const blob = `${r.submitted_by || ""} ${r.tier || ""} ${r.status || ""}`.toLowerCase();
      if (q && !blob.includes(q)) return false;
      if ((receiptFrom || receiptTo) && !inRange(r.created_at, receiptFrom, receiptTo)) return false;
      return true;
    });
  }, [receipts, receiptSearch, receiptFrom, receiptTo]);

  // Reset pagination whenever filters change (prevents "Page 5 of 1" empty states)
  useEffect(() => { setSchoolsPage(1); }, [tierFilter, schoolSearch, schoolFrom, schoolTo]);
  useEffect(() => { setUsersPage(1); }, [userSearch, userFrom, userTo]);
  useEffect(() => { setReceiptsPage(1); }, [receiptSearch, receiptFrom, receiptTo]);

  // Paginated slices
  const pagedSchools = useMemo(() => filteredSchools.slice((schoolsPage - 1) * PAGE_SIZE, schoolsPage * PAGE_SIZE), [filteredSchools, schoolsPage]);
  const pagedUsers = useMemo(() => filteredUsers.slice((usersPage - 1) * PAGE_SIZE, usersPage * PAGE_SIZE), [filteredUsers, usersPage]);
  const pagedReceipts = useMemo(() => filteredReceipts.slice((receiptsPage - 1) * PAGE_SIZE, receiptsPage * PAGE_SIZE), [filteredReceipts, receiptsPage]);

  const schoolsTotalPages = Math.max(1, Math.ceil(filteredSchools.length / PAGE_SIZE));
  const usersTotalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const receiptsTotalPages = Math.max(1, Math.ceil(filteredReceipts.length / PAGE_SIZE));

  // Reusable Pager
  const renderPager = ({ page, totalPages, onPrev, onNext, totalItems, testidPrefix }) => {
    if (totalItems <= PAGE_SIZE) return null;
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, totalItems);
    return (
      <div className="mt-4 flex items-center justify-between gap-3 cs-card p-3" data-testid={`${testidPrefix}-pager`}>
        <div className="text-xs text-slate-500">
          Showing <span className="font-semibold cs-text-navy">{start}–{end}</span> of <span className="font-semibold cs-text-navy">{totalItems}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onPrev} disabled={page <= 1} className="text-xs" data-testid={`${testidPrefix}-prev`}>
            <ChevronLeft size={14} className="mr-1" /> Previous
          </Button>
          <span className="text-xs text-slate-600 px-2">Page <span className="font-semibold cs-text-navy">{page}</span> of {totalPages}</span>
          <Button size="sm" variant="outline" onClick={onNext} disabled={page >= totalPages} className="text-xs" data-testid={`${testidPrefix}-next`}>
            Next <ChevronRight size={14} className="ml-1" />
          </Button>
        </div>
      </div>
    );
  };

  const currentLabel = NAV.find((n) => n.key === tab)?.label || "Super Admin Dashboard";
  const pickPane = (k) => { setTab(k); setDrawerOpen(false); };

  // -------- Reusable filter bar (inline JSX, not a component) --------
  const renderFilterBar = ({ searchVal, onSearch, from, onFrom, to, onTo, onClear, placeholder, testidPrefix }) => (
    <div className="cs-card p-3 mb-4 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center" data-testid={`${testidPrefix}-filterbar`}>
      <div className="relative flex-1 min-w-0">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input placeholder={placeholder} value={searchVal} onChange={(e) => onSearch(e.target.value)} className="pl-9" data-testid={`${testidPrefix}-search`} />
      </div>
      <div className="flex items-center gap-2">
        <Input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className="w-[150px]" data-testid={`${testidPrefix}-from`} />
        <span className="text-slate-400 text-xs">to</span>
        <Input type="date" value={to} onChange={(e) => onTo(e.target.value)} className="w-[150px]" data-testid={`${testidPrefix}-to`} />
        <Button variant="outline" size="sm" onClick={onClear} title="Clear filters" data-testid={`${testidPrefix}-clear`}><FilterX size={14} /></Button>
      </div>
    </div>
  );

  // -------- Sidebar markup --------
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
        <div className="border-t border-white/10 my-2" />
        <Button onClick={() => setOverrideOpen(true)} className="w-full bg-white/10 hover:bg-white/20 text-white rounded-md text-xs h-9 justify-start gap-2 border border-white/10 transition-all duration-200 px-2.5" data-testid="open-pw-override">
          <KeyRound size={14} className="flex-shrink-0" /> <span className="hidden lg:inline">Password override</span>
        </Button>
        <Button onClick={handleLogout} className="w-full bg-red-500/15 hover:bg-red-500/30 text-white rounded-md text-xs h-9 justify-start gap-2 border border-red-400/30 transition-all duration-200 px-2.5" data-testid="sidebar-logout">
          <LogOut size={14} className="flex-shrink-0" /> <span className="hidden lg:inline">Logout</span>
        </Button>
      </nav>
      <div className="p-2 border-t border-white/10 space-y-2 hidden">
        {/* Buttons moved inline above the nav for proximity */}
      </div>
    </div>
  );

  // -------- Pane bodies as direct JSX (no nested components → inputs keep focus) --------
  let paneBody = null;

  if (tab === "schools") {
    const counts = { all: schools.length };
    TIER_META.forEach((t) => { counts[t.key] = schools.filter((s) => s.subscription_tier === t.key).length; });
    paneBody = (
      <div>
        {/* Tier filter row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4" data-testid="school-tier-filters">
          <button onClick={() => setTierFilter("all")} className={`cs-card p-3 text-left transition ${tierFilter === "all" ? "ring-2 ring-slate-900 shadow-md" : "hover:shadow-md"}`} data-testid="tier-filter-all">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">All schools</div>
            <div className="font-display text-2xl font-bold cs-text-navy mt-1">{counts.all}</div>
          </button>
          {TIER_META.map((t) => {
            const Icon = t.icon; const isActive = tierFilter === t.key;
            return (
              <button key={t.key} onClick={() => setTierFilter(t.key)} className={`cs-card p-3 text-left transition border-l-4 ${isActive ? "shadow-md ring-2" : "hover:shadow-md"}`} style={{ borderLeftColor: t.color }} data-testid={`tier-filter-${t.key}`}>
                <div className="flex items-center gap-2">
                  <Icon size={14} style={{ color: t.color }} />
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 truncate">{t.label}</div>
                </div>
                <div className="font-display text-2xl font-bold mt-1" style={{ color: t.color }}>{counts[t.key]}</div>
              </button>
            );
          })}
        </div>

        {renderFilterBar({
          searchVal: schoolSearch, onSearch: setSchoolSearch,
          from: schoolFrom, onFrom: setSchoolFrom, to: schoolTo, onTo: setSchoolTo,
          onClear: () => { setSchoolSearch(""); setSchoolFrom(""); setSchoolTo(""); },
          placeholder: "Search school name…", testidPrefix: "schools",
        })}

        {/* Cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4" data-testid="school-cards-grid">
          {pagedSchools.map((s) => {
            const tierMeta = TIER_META.find((t) => t.key === s.subscription_tier);
            const active = s.verification_status === "active" && !s.kill_switch;
            const expires = s.subscription_expires_at ? new Date(s.subscription_expires_at) : null;
            const daysLeft = expires ? Math.ceil((expires - new Date()) / 86400000) : null;
            const expColor = daysLeft == null ? "text-slate-400" : daysLeft < 0 ? "text-red-600" : daysLeft <= 14 ? "text-red-600" : daysLeft <= 30 ? "text-amber-600" : "text-slate-600";
            const TierIcon = tierMeta?.icon || Building2;
            const studentCount = studentsBySchool[s.id] || 0;
            const staffCount = staffBySchool[s.id] || 0;
            const pickerOpen = tierPickerForId === s.id;
            return (
              <div key={s.id} className="cs-card p-5 flex flex-col gap-3 border-t-4" style={{ borderTopColor: tierMeta?.color || "#64748b" }} data-testid={`school-card-${s.id}`}>
                <div className="flex items-start gap-3">
                  {/* Logo placeholder */}
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0 overflow-hidden" style={{ backgroundColor: tierMeta?.color || "#002147" }} data-testid={`school-logo-${s.id}`}>
                    {s.logo_url ? <img src={s.logo_url} alt="" className="w-full h-full object-cover" /> : initialsOf(s.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-bold cs-text-navy text-base truncate" title={s.name}>{s.name}</div>
                    <div className="text-[11px] text-slate-500 capitalize">{s.school_type || "—"} · Registered {ymd(s.created_at)}</div>
                  </div>
                  <Badge className={active ? "cs-bg-green text-white" : s.kill_switch ? "bg-red-500 text-white" : "bg-amber-500 text-white"} data-testid={`school-status-${s.id}`}>
                    {active ? "Active" : s.kill_switch ? "Paused" : (s.verification_status || "Pending")}
                  </Badge>
                </div>

                {/* Stat row: students + staff + plan + expires */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md p-2 bg-slate-50 flex items-center gap-2">
                    <GraduationCap size={14} className="text-slate-500 flex-shrink-0" />
                    <div className="min-w-0"><div className="text-[10px] text-slate-500 uppercase">Students</div>
                      <div className="font-bold cs-text-navy" data-testid={`school-students-${s.id}`}>{studentCount}</div>
                    </div>
                  </div>
                  <div className="rounded-md p-2 bg-slate-50 flex items-center gap-2">
                    <Users size={14} className="text-slate-500 flex-shrink-0" />
                    <div className="min-w-0"><div className="text-[10px] text-slate-500 uppercase">Staff</div>
                      <div className="font-bold cs-text-navy" data-testid={`school-staff-${s.id}`}>{staffCount}</div>
                    </div>
                  </div>
                  <div className="rounded-md p-2 flex items-center gap-2" style={{ backgroundColor: `${tierMeta?.color || "#64748b"}15` }}>
                    <TierIcon size={14} style={{ color: tierMeta?.color || "#64748b" }} />
                    <div className="min-w-0"><div className="text-[10px] text-slate-500 uppercase">Plan</div>
                      <div className="font-semibold truncate" style={{ color: tierMeta?.color || "#64748b" }}>{tierMeta?.label || (s.subscription_tier || "—").replace(/_/g, " ")}</div>
                    </div>
                  </div>
                  <div className="rounded-md p-2 bg-slate-50 flex items-center gap-2">
                    <Calendar size={14} className="text-slate-500 flex-shrink-0" />
                    <div className="min-w-0"><div className="text-[10px] text-slate-500 uppercase">Expires</div>
                      <div className={`font-semibold ${expColor}`} data-testid={`school-deadline-${s.id}`}>
                        {expires ? ymd(expires) : "—"}
                        {daysLeft != null && <span className="ml-1 text-[10px]">({daysLeft < 0 ? "exp" : `${daysLeft}d`})</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t">
                  <div className="flex items-center gap-1">
                    <Switch checked={!!s.kill_switch} onCheckedChange={() => toggleKill(s.id, s.kill_switch)} data-testid={`kill-${s.id}`} title={s.kill_switch ? "Resume school" : "Pause school"} />
                    <span className="text-[10px] text-slate-500">{s.kill_switch ? "Paused" : "Active"}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    <Button size="sm" variant="outline" onClick={() => setSupportTarget(s)} className="text-xs border-amber-400 text-amber-700 hover:bg-amber-50" data-testid={`support-access-${s.id}`} title="Securely view this school for troubleshooting">
                      <Headphones size={12} className="mr-1" /> Support
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setTierPickerForId(pickerOpen ? null : s.id)} className="text-xs" data-testid={`upgrade-btn-${s.id}`}><Settings2 size={12} className="mr-1" /> Plan</Button>
                    <Button size="sm" variant="destructive" onClick={() => cancelSubscription(s.id, s.name)} className="text-xs" data-testid={`cancel-btn-${s.id}`}>Cancel</Button>
                  </div>
                </div>

                {pickerOpen && (
                  <div className="mt-1 grid grid-cols-2 gap-2 p-2 rounded-md bg-slate-50 border">
                    {TIER_META.map((t) => {
                      const TIcon = t.icon; const isCurrent = s.subscription_tier === t.key;
                      return (
                        <button key={t.key} onClick={() => { setTierPickerForId(null); if (!isCurrent) updateTier(s.id, t.key); }}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded text-[11px] font-semibold transition ${isCurrent ? "bg-white border-2" : "bg-white border hover:shadow-sm"}`}
                          style={{ borderColor: isCurrent ? t.color : undefined, color: t.color }}
                          disabled={isCurrent} data-testid={`tier-opt-${s.id}-${t.key}`}>
                          <TIcon size={12} /> {t.label}{isCurrent && " ✓"}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {!filteredSchools.length && <div className="col-span-full cs-card p-10 text-center text-slate-500">No schools match the filters.</div>}
        </div>
        {renderPager({
          page: schoolsPage, totalPages: schoolsTotalPages,
          onPrev: () => setSchoolsPage((p) => Math.max(1, p - 1)),
          onNext: () => setSchoolsPage((p) => Math.min(schoolsTotalPages, p + 1)),
          totalItems: filteredSchools.length, testidPrefix: "schools",
        })}
      </div>
    );

  } else if (tab === "users") {
    paneBody = (
      <div>
        {renderFilterBar({
          searchVal: userSearch, onSearch: setUserSearch,
          from: userFrom, onFrom: setUserFrom, to: userTo, onTo: setUserTo,
          onClear: () => { setUserSearch(""); setUserFrom(""); setUserTo(""); },
          placeholder: "Search by email, name, role, school…", testidPrefix: "users",
        })}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3" data-testid="users-grid">
          {pagedUsers.map((u) => (
            <div key={u.id} className="cs-card p-4" data-testid={`user-card-${u.id}`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full cs-bg-navy text-white flex items-center justify-center text-xs font-bold flex-shrink-0">{initialsOf(u.name || u.email)}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold cs-text-navy text-sm truncate" title={u.name}>{u.name || "—"}</div>
                  <div className="text-[11px] text-slate-500 truncate" title={u.email}>{u.email}</div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px]">
                <Badge className="cs-bg-blue text-white capitalize">{(u.role || "").replace(/_/g, " ")}</Badge>
                <span className="text-slate-500">{ymd(u.created_at)}</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500 truncate">{u.school_name}</div>
            </div>
          ))}
          {!filteredUsers.length && <div className="col-span-full cs-card p-10 text-center text-slate-500">No users match the filters.</div>}
        </div>
        {renderPager({
          page: usersPage, totalPages: usersTotalPages,
          onPrev: () => setUsersPage((p) => Math.max(1, p - 1)),
          onNext: () => setUsersPage((p) => Math.min(usersTotalPages, p + 1)),
          totalItems: filteredUsers.length, testidPrefix: "users",
        })}
      </div>
    );

  } else if (tab === "students") {
    // School-summary grid (no individual student records)
    const summaries = schools.map((s) => ({ id: s.id, name: s.name, count: studentsBySchool[s.id] || 0, tier: s.subscription_tier }))
      .sort((a, b) => b.count - a.count);
    paneBody = (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="students-summary-grid">
        {summaries.map((s) => {
          const tierMeta = TIER_META.find((t) => t.key === s.tier);
          return (
            <div key={s.id} className="cs-card p-5 border-t-4" style={{ borderTopColor: tierMeta?.color || "#64748b" }} data-testid={`school-summary-${s.id}`}>
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ backgroundColor: tierMeta?.color || "#002147" }}>{initialsOf(s.name)}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-display font-bold cs-text-navy text-sm truncate" title={s.name}>{s.name}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">{tierMeta?.label || "—"}</div>
                </div>
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Total students</div>
                  <div className="font-display text-3xl font-bold cs-text-navy" data-testid={`students-count-${s.id}`}>{s.count}</div>
                </div>
                <GraduationCap size={28} className="text-slate-200" />
              </div>
            </div>
          );
        })}
        {!summaries.length && <div className="col-span-full cs-card p-10 text-center text-slate-500">No schools registered.</div>}
      </div>
    );

  } else if (tab === "leads" || tab === "open_leads") {
    const rows = tab === "open_leads" ? openLeads : leads;
    paneBody = (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid={`${tab}-grid`}>
        {rows.map((l) => (
          <div key={l.id} className="cs-card p-4 flex flex-col gap-2" data-testid={`lead-card-${l.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold cs-text-navy text-sm truncate">{l.name}</div>
                <div className="text-[11px] text-slate-500 truncate">{l.email}</div>
                {l.school && <div className="text-[11px] text-slate-500 truncate">{l.school}</div>}
              </div>
              {l.resolved ? <Badge className="cs-bg-green text-white text-[10px]">Resolved</Badge> : <Badge className="bg-amber-500 text-white text-[10px]">Open</Badge>}
            </div>
            <p className="text-xs text-slate-600 line-clamp-3" title={l.message}>{l.message}</p>
            {!l.resolved && <Button size="sm" variant="outline" onClick={() => resolveLead(l.id)} className="self-end" data-testid={`lead-resolve-${l.id}`}>Mark resolved</Button>}
          </div>
        ))}
        {!rows.length && <div className="col-span-full cs-card p-10 text-center text-slate-500">{tab === "open_leads" ? "No open leads." : "No leads yet."}</div>}
      </div>
    );

  } else if (tab === "awaiting") {
    paneBody = (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="awaiting-grid">
        {verifQueue.map((q) => {
          const codeMatches = q.verification_code && q.latest_receipt?.whatsapp_code && q.verification_code === q.latest_receipt.whatsapp_code;
          return (
            <div key={q.school_id} className="cs-card p-5 flex flex-col gap-3" data-testid={`awaiting-card-${q.school_id}`}>
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-lg cs-bg-navy text-white flex items-center justify-center font-bold text-sm flex-shrink-0">{initialsOf(q.school_name)}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-display font-bold cs-text-navy text-sm truncate">{q.school_name}</div>
                  <div className="text-[11px] text-slate-500 truncate">{q.admin_email}</div>
                  <div className="text-[11px] text-slate-500 font-mono">{q.whatsapp_phone || "—"}</div>
                </div>
                <Badge className={q.verification_status === "pending_payment" ? "bg-amber-500 text-white text-[10px]" : "cs-bg-blue text-white text-[10px]"}>{q.verification_status}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded p-2 bg-slate-50">
                  <div className="text-[10px] text-slate-500 uppercase">Code</div>
                  <div className="font-mono font-bold">{q.verification_code || <span className="text-slate-400">—</span>}</div>
                </div>
                <div className="rounded p-2 bg-slate-50">
                  <div className="text-[10px] text-slate-500 uppercase">Typed</div>
                  <div className={`font-mono font-bold ${codeMatches ? "cs-text-green" : q.latest_receipt?.whatsapp_code ? "text-amber-600" : ""}`}>
                    {q.latest_receipt?.whatsapp_code || <span className="text-slate-400">—</span>} {codeMatches && "✓"}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-2 border-t">
                <Button size="sm" variant="outline" onClick={() => generateCode(q.school_id, q.school_name, q.whatsapp_phone)} className="text-xs" data-testid={`verif-gen-${q.school_id}`}>{q.verification_code ? "Regenerate" : "Generate code"}</Button>
                {q.latest_receipt && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => openReceipt(q.latest_receipt.id)} className="text-xs" data-testid={`verif-view-${q.school_id}`}><Eye size={12} /></Button>
                    <Button size="sm" className="cs-bg-green text-white text-xs" onClick={() => verifyDecision(q.school_id, "approve")} data-testid={`verif-approve-${q.school_id}`}>Approve</Button>
                    <Button size="sm" variant="destructive" className="text-xs" onClick={() => verifyDecision(q.school_id, "reject")} data-testid={`verif-reject-${q.school_id}`}>Reject</Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {!verifQueue.length && <div className="col-span-full cs-card p-10 text-center text-slate-500">No schools awaiting activation.</div>}
      </div>
    );

  } else if (tab === "receipts") {
    paneBody = (
      <div>
        {renderFilterBar({
          searchVal: receiptSearch, onSearch: setReceiptSearch,
          from: receiptFrom, onFrom: setReceiptFrom, to: receiptTo, onTo: setReceiptTo,
          onClear: () => { setReceiptSearch(""); setReceiptFrom(""); setReceiptTo(""); },
          placeholder: "Search by email, tier or status…", testidPrefix: "receipts",
        })}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="receipts-grid">
          {pagedReceipts.map((r) => (
            <div key={r.id} className="cs-card p-4 flex flex-col gap-2" data-testid={`receipt-card-${r.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">{(r.created_at || "").slice(0, 16).replace("T", " ")}</div>
                  <div className="text-sm font-semibold cs-text-navy truncate">{r.submitted_by}</div>
                </div>
                <Badge className={r.status === "approved" ? "cs-bg-green text-white text-[10px]" : r.status === "rejected" ? "bg-red-500 text-white text-[10px]" : "bg-amber-500 text-white text-[10px]"}>{r.status}</Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{(r.tier || "").replace(/_/g, " ")}</span>
                <span className="font-bold cs-text-navy">₦{Number(r.amount_ngn || 0).toLocaleString()}</span>
              </div>
              <div className="flex gap-1 pt-2 border-t">
                <Button size="sm" variant="outline" className="text-xs" onClick={() => openReceipt(r.id)} data-testid={`rcp-view-${r.id}`}><Eye size={12} className="mr-1" /> View</Button>
                {r.status === "pending" && (
                  <>
                    <Button size="sm" className="cs-bg-green text-white text-xs" onClick={() => decideReceipt(r.id, "approve")} data-testid={`rcp-approve-${r.id}`}>Approve</Button>
                    <Button size="sm" variant="destructive" className="text-xs" onClick={() => decideReceipt(r.id, "reject")} data-testid={`rcp-reject-${r.id}`}>Reject</Button>
                  </>
                )}
              </div>
            </div>
          ))}
          {!filteredReceipts.length && <div className="col-span-full cs-card p-10 text-center text-slate-500">No receipts match the filters.</div>}
        </div>
        {renderPager({
          page: receiptsPage, totalPages: receiptsTotalPages,
          onPrev: () => setReceiptsPage((p) => Math.max(1, p - 1)),
          onNext: () => setReceiptsPage((p) => Math.min(receiptsTotalPages, p + 1)),
          totalItems: filteredReceipts.length, testidPrefix: "receipts",
        })}
      </div>
    );

  } else if (tab === "analytics") {
    paneBody = analytics ? (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="analytics-grid">
        <ChartCard title="Schools by tier">
          <DonutChart data={(analytics.schools_by_tier || []).map((d) => ({ name: (d.tier || "—").replace(/_/g, " "), value: d.count }))} />
        </ChartCard>
        <ChartCard title="MRR (₦) over time">
          <GrowthArea data={(analytics.mrr_over_time || []).map((d) => ({ name: d.month, value: d.mrr }))} />
        </ChartCard>
        <ChartCard title="Schools created per month" className="lg:col-span-2">
          <BarSimple data={(analytics.schools_per_month || []).map((d) => ({ name: d.month, value: d.count }))} />
        </ChartCard>
      </div>
    ) : <div className="text-slate-500">Loading analytics…</div>;

  } else if (tab === "add_super") {
    paneBody = (
      <div className="cs-card p-6 max-w-xl" data-testid="add-super-pane">
        <div className="font-display font-bold cs-text-navy text-lg">Create another Super Admin</div>
        <p className="text-xs text-slate-500 mt-1">Only trusted accounts. The new account has full God-mode access.</p>
        <div className="mt-4 space-y-3">
          <div>
            <Label>Email</Label>
            <Input type="email" autoComplete="off" value={newSuper.email}
              onChange={(e) => setNewSuper((v) => ({ ...v, email: e.target.value }))}
              data-testid="newsuper-email" />
          </div>
          <div>
            <Label>Name</Label>
            <Input autoComplete="off" value={newSuper.name}
              onChange={(e) => setNewSuper((v) => ({ ...v, name: e.target.value }))}
              data-testid="newsuper-name" />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" autoComplete="new-password" value={newSuper.password}
              onChange={(e) => setNewSuper((v) => ({ ...v, password: e.target.value }))}
              data-testid="newsuper-password" />
          </div>
          <Button onClick={addSuperAdmin} className="cs-bg-navy text-white hover:opacity-90 rounded-full" data-testid="newsuper-submit"><UserPlus size={14} className="mr-2" /> Create Super Admin</Button>
        </div>
      </div>
    );
  }

  // ---- KPI row (always on top) ----
  const KpiRow = stats && (
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

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar variant="dashboard" />

      {/* Pinned sidebar — full screen height, only inner nav scrolls */}
      <aside className="hidden sm:flex flex-col fixed left-0 top-14 bottom-0 z-30 w-16 lg:w-64 xl:w-72 border-r shadow-sm transition-all duration-300" data-testid="super-sidebar-desktop">
        <SidebarContent onClickItem={(k) => setTab(k)} />
      </aside>

      {drawerOpen && (
        <div className="sm:hidden fixed inset-0 z-40" data-testid="super-drawer">
          <div className="absolute inset-0 bg-slate-900/60 transition-opacity duration-300" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 shadow-xl transition-transform duration-300">
            <SidebarContent onClickItem={pickPane} />
          </aside>
        </div>
      )}

      <main className="sm:ml-16 lg:ml-64 xl:ml-72 pt-[120px] transition-all duration-300" data-testid="super-admin">
        {/* Fixed in-page header — pinned below the fixed Navbar, offset by sidebar width */}
        <div className="fixed top-14 left-0 sm:left-16 lg:left-64 xl:left-72 right-0 z-20 bg-slate-50 border-b border-slate-200 px-4 sm:px-6 lg:px-10 xl:px-12 py-3 transition-all duration-300">
          <div className="max-w-[1800px] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button className="sm:hidden p-2 rounded-md border border-slate-200 bg-white" onClick={() => setDrawerOpen(true)} data-testid="super-hamburger"><Menu size={18} /></button>
              <div className="min-w-0">
                <span className="eyebrow">CORNER STREAMS</span>
                <h1 className="font-display text-xl sm:text-2xl font-bold cs-text-navy mt-0.5 truncate" data-testid="super-title">Super Admin · {currentLabel}</h1>
              </div>
            </div>
            {authUser && typeof authUser === "object" && (
              <div className="hidden md:flex items-center gap-3 cs-card px-4 py-2 shrink-0" data-testid="super-header-user">
                <div className="w-9 h-9 rounded-full cs-bg-navy text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                  {(authUser.name || authUser.email || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}
                </div>
                <div className="text-right leading-tight">
                  <div className="text-sm font-semibold cs-text-navy" data-testid="super-header-username">{authUser.name || authUser.email}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500" data-testid="super-header-userrole">Super Admin</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-4 sm:px-6 lg:px-10 xl:px-12 py-6 max-w-[1800px]">
          {KpiRow}

          <div className="mt-2">
            <h2 className="font-display text-lg font-bold cs-text-navy mb-3">{currentLabel}</h2>
            <div key={tab} className="cs-pane-fade" data-testid={`super-pane-${tab}`}>
              {paneBody}
            </div>
          </div>
        </div>
      </main>

      {/* Password override dialog */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Password override</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="user email" value={override.user_email} onChange={(e) => setOverride((v) => ({ ...v, user_email: e.target.value }))} data-testid="pw-override-email" />
            <Input type="password" placeholder="new password" value={override.new_password} onChange={(e) => setOverride((v) => ({ ...v, new_password: e.target.value }))} data-testid="pw-override-password" />
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

      {/* Support Access (impersonation) confirmation */}
      <Dialog open={!!supportTarget} onOpenChange={(o) => !o && setSupportTarget(null)}>
        <DialogContent data-testid="support-access-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Headphones size={18} className="text-amber-600" /> Confirm Support Access</DialogTitle>
            <DialogDescription className="pt-2">
              You are about to securely view <b className="cs-text-navy">{supportTarget?.name}</b>'s environment as a school admin for administrative troubleshooting. This action will be logged in the school's audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
            <div className="font-semibold mb-1">⚠ What happens next</div>
            <ul className="list-disc ml-4 space-y-0.5">
              <li>Your super-admin session will be replaced by a school-admin session for this school.</li>
              <li>An audit-log entry will be created on the school's record.</li>
              <li>You will be redirected to the School Admin dashboard.</li>
              <li>To return to Super Admin, sign out and log in again with your super admin credentials.</li>
            </ul>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setSupportTarget(null)} data-testid="support-cancel">Cancel</Button>
            <Button onClick={confirmSupportAccess} disabled={supportLoading} className="cs-bg-navy text-white hover:opacity-90" data-testid="support-confirm">
              {supportLoading ? "Switching…" : "Yes, enter support mode"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
