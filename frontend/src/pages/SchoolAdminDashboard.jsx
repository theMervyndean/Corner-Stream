import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth.jsx";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import {
  Users, Receipt, FileBarChart, ShieldCheck, Upload, Plus, ArrowRight,
  AlertTriangle, CreditCard, KeyRound, Image as ImageIcon, BookOpen, Trash2,
  CheckCircle2, Circle, Download, GraduationCap, FileSpreadsheet, Activity,
  UserPlus, ClipboardList, History, Eye, RotateCcw, UserCog, UserMinus,
} from "lucide-react";
import { ChartCard, BarSimple, DonutChart, GrowthArea } from "@/components/Charts.jsx";
import BulkUploadDialog from "@/components/BulkUploadDialog.jsx";
import CredentialsModal from "@/components/CredentialsModal.jsx";

const PRICING = {
  cbt_essentials: { name: "CBT Essentials", "1_term": 40000, "2_terms": 70000, "full_session": 110000 },
  digital_reports: { name: "Digital Reports", "1_term": 50000, "2_terms": 90000, "full_session": 140000 },
  financial_ledger: { name: "Financial Ledger", "1_term": 40000, "2_terms": 70000, "full_session": 110000 },
  unified_enterprise: { name: "Unified Enterprise", full_session: 200000 },
};
const DURS = [{ k: "1_term", l: "1 Term" }, { k: "2_terms", l: "2 Terms" }, { k: "full_session", l: "Full Session" }];

export default function SchoolAdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [school, setSchool] = useState(null);
  const [students, setStudents] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [tab, setTab] = useState("overview");

  const [newStudent, setNewStudent] = useState({ name: "", age: 10, gender: "Male", class_name: "", parent_email: "", balance_due: 0 });
  const [studentDlg, setStudentDlg] = useState(false);

  const [duration, setDuration] = useState("full_session");
  const [bankDlg, setBankDlg] = useState(false);
  const [bankForm, setBankForm] = useState({ tier: "digital_reports", duration: "full_session", amount_ngn: 0, file_data_url: "", note: "" });

  // Subjects state
  const [classSubjects, setClassSubjects] = useState([]);
  const [subjDlg, setSubjDlg] = useState(false);
  const [subjForm, setSubjForm] = useState({ class_name: "", subjectsText: "" });

  // Login provisioning
  const [loginDlg, setLoginDlg] = useState(null); // student object
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });

  // Profile
  const [profileForm, setProfileForm] = useState({ name: "", principal_name: "", address: "", phone: "", email: "", motto: "", logo_url: "", founded_year: "", website: "" });
  // Analytics
  const [analytics, setAnalytics] = useState(null);

  // Users (teachers / parents)
  const [usersList, setUsersList] = useState([]);
  const [userDlg, setUserDlg] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "teacher", assigned_class: "" });

  // Passport upload
  const [passportDlg, setPassportDlg] = useState(null);

  // Bulk upload dialog (teacher / parent / student)
  const [bulkRole, setBulkRole] = useState(null);
  // Credentials modal — used after single Reveal / Reset
  const [credModal, setCredModal] = useState(null); // {title, created, skipped, role, note}

  // Classes management
  const [newClassName, setNewClassName] = useState("");
  const classes = useMemo(() => school?.classes || [], [school]);

  // Audit log / activity feed
  const [audit, setAudit] = useState({ events: [], counts: {}, total: 0 });
  const fetchAudit = async () => {
    try {
      const { data } = await api.get("/audit/");
      setAudit(data);
    } catch (e) { /* silent */ void e; }
  };

  // Universal template downloader (auth-aware blob fetch)
  const downloadTemplate = async (kind) => {
    const labels = {
      students: "students-template.xlsx",
      teachers: "teachers-template.xlsx",
      "cbt-questions": "cbt-questions-template.xlsx",
    };
    try {
      const res = await api.get(`/templates/${kind}.xlsx`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url; a.download = labels[kind] || `${kind}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Template downloaded — open in Excel to fill`);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };
  const addClass = async () => {
    const name = newClassName.trim();
    if (!name) { toast.error("Enter a class name"); return; }
    try {
      await api.post("/schools/me/classes", { class_name: name });
      toast.success(`Added "${name}"`);
      setNewClassName("");
      refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const removeClassName = async (name) => {
    if (!window.confirm(`Remove "${name}" from your class roster?`)) return;
    try {
      await api.delete(`/schools/me/classes/${encodeURIComponent(name)}`);
      toast.success(`Removed "${name}"`);
      refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  const refresh = async () => {
    try {
      const [sRes, stRes, rRes, sjRes, uRes, anRes] = await Promise.all([
        api.get("/schools/me"),
        api.get("/students"),
        api.get("/payments/bank-receipts"),
        api.get("/subjects"),
        api.get("/users"),
        api.get("/analytics/school"),
      ]);
      setSchool(sRes.data.school);
      setStudents(stRes.data.students || []);
      setReceipts(rRes.data.receipts || []);
      setClassSubjects(sjRes.data.class_subjects || []);
      setUsersList(uRes.data.users || []);
      setAnalytics(anRes.data);
      // Sync profile form
      const s = sRes.data.school;
      setProfileForm({
        name: s.name || "", principal_name: s.principal_name || "", address: s.address || "",
        phone: s.phone || "", email: s.email || "", motto: s.motto || "",
        logo_url: s.logo_url || "", founded_year: s.founded_year || "", website: s.website || "",
      });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };
  useEffect(() => { refresh(); }, []);

  // Profile save
  const saveProfile = async () => {
    try {
      await api.put("/schools/me", profileForm);
      toast.success("School profile updated");
      refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const onLogoFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setProfileForm((p) => ({ ...p, logo_url: reader.result }));
    reader.readAsDataURL(file);
  };

  // Users management
  const submitNewUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) { toast.error("Name, email and password are required"); return; }
    try {
      await api.post("/users", newUser);
      toast.success(`${newUser.role === "teacher" ? "Teacher" : "Parent"} created — share credentials with them`);
      setUserDlg(false);
      setNewUser({ name: "", email: "", password: "", role: newUser.role, assigned_class: "" });
      refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const removeUser = async (uid) => {
    if (!window.confirm("Delete this user account?")) return;
    try { await api.delete(`/users/${uid}`); refresh(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  // ---- Password vault: reveal / reset ----
  const revealPwd = async (u) => {
    try {
      const { data } = await api.get(`/users/${u.id}/reveal-password`);
      setCredModal({
        title: `Credentials for ${data.name}`,
        created: [{ name: data.name, email: data.email, username: data.username, password: data.password, role: data.role }],
        skipped: [], role: data.role,
        note: "This password is the one we generated for the user. They can still change it from their dashboard at any time.",
      });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };
  const resetPwd = async (u) => {
    if (!window.confirm(`Generate a new password for ${u.name}? Their old one will stop working.`)) return;
    try {
      const { data } = await api.post(`/users/${u.id}/reset-password`);
      setCredModal({
        title: `New password generated for ${data.name}`,
        created: [{ name: data.name, email: data.email, username: data.username, password: data.password, role: data.role }],
        skipped: [], role: data.role,
        note: "The previous password no longer works. Share this new one with the user securely.",
      });
      refresh();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };
  const promoteUser = async (u) => {
    if (!window.confirm(`Grant admin powers to ${u.name}? They will keep their ${u.role} role and also be able to manage the school.`)) return;
    try {
      await api.post(`/users/${u.id}/promote`);
      toast.success(`${u.name} now has admin powers`);
      refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const demoteUser = async (u) => {
    if (!window.confirm(`Revoke admin powers from ${u.name}?`)) return;
    try {
      await api.post(`/users/${u.id}/demote`);
      toast.success(`Admin powers revoked from ${u.name}`);
      refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  // Auto-prefill if coming from pricing page
  useEffect(() => {
    const tier = params.get("tier");
    const dur = params.get("duration");
    if (tier && dur) setTab("subscription");
  }, [params]);

  const addStudent = async () => {
    try {
      await api.post("/students", newStudent);
      toast.success("Student added");
      setStudentDlg(false);
      setNewStudent({ name: "", age: 10, gender: "Male", class_name: "", parent_email: "", balance_due: 0 });
      refresh();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/students/bulk-upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Imported ${data.inserted} students${data.errors.length ? ` (${data.errors.length} errors)` : ""}`);
      refresh();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      e.target.value = "";
    }
  };

  const startCheckout = async (tier) => {
    const dur = tier === "unified_enterprise" ? "full_session" : duration;
    try {
      const { data } = await api.post("/payments/checkout", { tier, duration: dur, origin_url: window.location.origin });
      window.location.href = data.url;
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const onReceiptFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setBankForm((f) => ({ ...f, file_data_url: reader.result }));
    reader.readAsDataURL(file);
  };

  const submitBank = async () => {
    if (!bankForm.file_data_url) { toast.error("Attach receipt image/PDF"); return; }
    try {
      await api.post("/payments/bank-receipt", bankForm);
      toast.success("Receipt submitted. Super Admin will verify shortly.");
      setBankDlg(false);
      setBankForm({ tier: "digital_reports", duration: "full_session", amount_ngn: 0, file_data_url: "", note: "" });
      refresh();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  // Subjects
  const openNewSubjects = () => { setSubjForm({ class_name: "", subjectsText: "" }); setSubjDlg(true); };
  const editSubjects = (cs) => { setSubjForm({ class_name: cs.class_name, subjectsText: cs.subjects.join("\n") }); setSubjDlg(true); };
  const saveSubjects = async () => {
    const list = subjForm.subjectsText.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!subjForm.class_name.trim() || list.length === 0) { toast.error("Class name and at least one subject required"); return; }
    try {
      await api.put("/subjects", { class_name: subjForm.class_name.trim(), subjects: list });
      toast.success("Saved");
      setSubjDlg(false);
      refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const deleteSubjects = async (className) => {
    if (!window.confirm(`Remove subjects for ${className}?`)) return;
    try { await api.delete(`/subjects/${encodeURIComponent(className)}`); refresh(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  // Login provisioning
  const openLoginDlg = (st) => {
    setLoginDlg(st);
    const seed = st.name.toLowerCase().split(" ")[0].replace(/[^a-z]/g, "");
    setLoginForm({ email: `${seed}@${school.name.toLowerCase().replace(/[^a-z]/g, "")}.school`, password: "Student@123" });
  };
  const submitLogin = async () => {
    try {
      await api.post(`/students/${loginDlg.id}/login`, loginForm);
      toast.success(`Login created: ${loginForm.email}`);
      setLoginDlg(null);
      refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  // Passport
  const onPassportFile = (st, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await api.put(`/students/${st.id}/passport`, { passport_url: reader.result });
        toast.success("Passport uploaded");
        setPassportDlg(null);
        refresh();
      } catch (err) { toast.error(formatApiError(err.response?.data?.detail) || err.message); }
    };
    reader.readAsDataURL(file);
  };

  const debtCount = useMemo(() => students.filter((s) => (s.balance_due || 0) > 0).length, [students]);
  const totalDebt = useMemo(() => students.reduce((a, s) => a + (s.balance_due || 0), 0), [students]);

  if (!user || !school) return <div className="min-h-screen"><Navbar variant="dashboard" /><div className="p-10 text-slate-500">Loading…</div></div>;

  return (
    <div className="min-h-screen">
      <Navbar variant="dashboard" />
      <div className="max-w-7xl mx-auto px-6 py-8" data-testid="school-admin-dashboard">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="eyebrow">SCHOOL ADMIN</span>
            <h1 className="font-display text-3xl font-bold cs-text-navy mt-1">{school.name}</h1>
            <div className="text-sm text-slate-500 mt-1">{school.address || "—"} · Principal: {school.principal_name}</div>
          </div>
          <div className="flex items-center gap-3">
            {school.kill_switch ? (
              <Badge className="bg-red-500 text-white">Kill-switch ACTIVE</Badge>
            ) : (
              <Badge className="cs-bg-green text-white">Active</Badge>
            )}
            <div className="text-xs text-right">
              <div className="font-semibold cs-text-navy">{school.subscription_tier ? PRICING[school.subscription_tier]?.name : "No subscription"}</div>
              <div className="text-slate-500">{school.subscription_duration ? DURS.find((d) => d.k === school.subscription_duration)?.l : "—"}</div>
            </div>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          {[
            { i: Users, l: "Students", v: students.length, c: "cs-bg-navy" },
            { i: AlertTriangle, l: "Debtors", v: debtCount, c: "bg-amber-500" },
            { i: Receipt, l: "Total debt (₦)", v: totalDebt.toLocaleString(), c: "cs-bg-blue" },
            { i: FileBarChart, l: "Receipts", v: receipts.length, c: "cs-bg-green" },
          ].map((s, i) => {
            const Icon = s.i;
            return (
              <div key={i} className="cs-card p-5 flex items-center gap-4" data-testid={`stat-${i}`}>
                <div className={`w-11 h-11 rounded-lg ${s.c} text-white flex items-center justify-center`}><Icon size={20} /></div>
                <div>
                  <div className="text-xs text-slate-500">{s.l}</div>
                  <div className="font-display text-2xl font-bold cs-text-navy">{s.v}</div>
                </div>
              </div>
            );
          })}
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mt-10">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
            <TabsList className="inline-flex w-max sm:grid sm:grid-cols-8 sm:w-full sm:max-w-5xl">
              <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="profile" data-testid="tab-profile">Profile</TabsTrigger>
              <TabsTrigger value="classes" data-testid="tab-classes">Classes</TabsTrigger>
              <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
              <TabsTrigger value="students" data-testid="tab-students">Students</TabsTrigger>
              <TabsTrigger value="subjects" data-testid="tab-subjects">Subjects</TabsTrigger>
              <TabsTrigger value="subscription" data-testid="tab-subscription">Subscription</TabsTrigger>
              <TabsTrigger value="receipts" data-testid="tab-receipts">Receipts</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-6 grid md:grid-cols-2 gap-6">
            {/* Setup checklist */}
            <div className="cs-card p-6 md:col-span-2">
              <h3 className="font-display font-semibold cs-text-navy text-lg">Setup checklist</h3>
              <p className="text-sm text-slate-500 mt-1">Complete these to start using Corner Streams end-to-end.</p>
              {(() => {
                const steps = [
                  { done: !!(school.address && school.phone && school.motto), label: "Build your school profile (address, motto, logo, contact)", action: () => setTab("profile") },
                  { done: classSubjects.length > 0, label: "Set subjects for each class", action: () => setTab("subjects") },
                  { done: usersList.some((u) => u.role === "teacher"), label: "Add at least one teacher", action: () => { setNewUser({ ...newUser, role: "teacher" }); setUserDlg(true); } },
                  { done: usersList.some((u) => u.role === "parent"), label: "Add at least one parent", action: () => { setNewUser({ ...newUser, role: "parent" }); setUserDlg(true); } },
                  { done: students.length > 0, label: "Add students (manually or upload Excel)", action: () => setTab("students") },
                  { done: usersList.some((u) => u.role === "student"), label: "Provision at least one student login (from the Students tab)", action: () => setTab("students") },
                  { done: !!school.subscription_tier, label: "Choose a subscription plan", action: () => setTab("subscription") },
                ];
                const completed = steps.filter((s) => s.done).length;
                return (
                  <>
                    <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-2 cs-bg-green transition-all" style={{ width: `${(completed / steps.length) * 100}%` }} />
                    </div>
                    <div className="text-xs text-slate-500 mt-2">{completed} of {steps.length} steps complete</div>
                    <ul className="mt-4 space-y-2">
                      {steps.map((s, i) => (
                        <li key={i} className="flex items-center gap-3 p-3 rounded-lg border" data-testid={`setup-step-${i}`}>
                          {s.done ? <CheckCircle2 size={18} className="cs-text-green flex-shrink-0" /> : <Circle size={18} className="text-slate-300 flex-shrink-0" />}
                          <span className={`text-sm flex-1 ${s.done ? "text-slate-400 line-through" : "cs-text-navy"}`}>{s.label}</span>
                          {!s.done && <Button size="sm" variant="outline" onClick={s.action} className="btn-anim" data-testid={`setup-step-cta-${i}`}>Go</Button>}
                        </li>
                      ))}
                    </ul>
                  </>
                );
              })()}
            </div>

            <div className="cs-card p-6">
              <h3 className="font-display font-semibold cs-text-navy text-lg">Quick actions</h3>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Button onClick={() => setStudentDlg(true)} className="cs-bg-navy hover:opacity-90 text-white btn-anim" data-testid="quick-add-student"><Plus size={16} className="mr-1" /> Add student</Button>
                <label className="cursor-pointer">
                  <input type="file" accept=".xlsx" className="hidden" onChange={onUpload} data-testid="quick-bulk-upload" />
                  <span className="inline-flex items-center justify-center w-full h-9 rounded-md cs-bg-blue text-white text-sm font-medium hover:opacity-90 btn-anim"><Upload size={16} className="mr-1" /> Bulk upload .xlsx</span>
                </label>
                <Button variant="outline" onClick={() => downloadTemplate("students")} className="btn-anim" data-testid="quick-download-students-tpl"><FileSpreadsheet size={16} className="mr-1" /> Students template</Button>
                <Button variant="outline" onClick={() => downloadTemplate("teachers")} className="btn-anim" data-testid="quick-download-teachers-tpl"><FileSpreadsheet size={16} className="mr-1" /> Teachers template</Button>
                <Button variant="outline" onClick={() => setTab("subscription")} className="btn-anim" data-testid="quick-pay"><CreditCard size={16} className="mr-1" /> Pay subscription</Button>
                <Button variant="outline" onClick={() => setTab("users")} className="btn-anim" data-testid="quick-users"><Users size={16} className="mr-1" /> Manage users</Button>
              </div>
            </div>
            <div className="cs-card p-6">
              <h3 className="font-display font-semibold cs-text-navy text-lg">Bulk upload — fast onboarding</h3>
              <p className="text-sm text-slate-500 mt-2">Download a ready-to-fill Excel template, paste your data, then upload:</p>
              <div className="mt-3 space-y-2">
                <Button variant="outline" onClick={() => downloadTemplate("students")} className="w-full rounded-lg justify-start btn-anim" data-testid="tpl-students-overview">
                  <FileSpreadsheet size={14} className="mr-2 cs-text-blue" /> Students template <span className="ml-auto text-xs text-slate-400">name · class · parent info</span>
                </Button>
                <Button variant="outline" onClick={() => downloadTemplate("teachers")} className="w-full rounded-lg justify-start btn-anim" data-testid="tpl-teachers-overview">
                  <FileSpreadsheet size={14} className="mr-2 cs-text-blue" /> Teachers template <span className="ml-auto text-xs text-slate-400">name · email · class</span>
                </Button>
                <Button variant="outline" onClick={() => downloadTemplate("cbt-questions")} className="w-full rounded-lg justify-start btn-anim" data-testid="tpl-cbt-overview">
                  <FileSpreadsheet size={14} className="mr-2 cs-text-blue" /> CBT questions template <span className="ml-auto text-xs text-slate-400">offline planning</span>
                </Button>
              </div>
              <Button variant="outline" onClick={() => navigate("/welcome-pack")} className="mt-4 rounded-full btn-anim w-full" data-testid="welcome-pack-link"><Download size={14} className="mr-1" /> Generate Welcome Pack</Button>
            </div>

            {/* Analytics row */}
            {analytics && (
              <div className="md:col-span-2 grid lg:grid-cols-2 gap-5">
                <ChartCard title="Students per class" subtitle="Roster distribution" testid="chart-class">
                  <BarSimple data={analytics.by_class.map((c) => ({ name: c.class, count: c.count }))} xKey="name" yKey="count" color="#0056B3" />
                </ChartCard>
                <ChartCard title="Debt distribution" subtitle="Outstanding balances by bracket" testid="chart-debt">
                  <DonutChart data={analytics.debt_buckets.map((d) => ({ name: d.bucket, count: d.count }))} dataKey="count" nameKey="name" />
                </ChartCard>
                <ChartCard title="Gender split" subtitle="Across all enrolled students" testid="chart-gender">
                  <DonutChart data={analytics.by_gender.map((g) => ({ name: g.gender, count: g.count }))} dataKey="count" nameKey="name" />
                </ChartCard>
                <ChartCard title="CBT activity" subtitle={`${analytics.cbt_total_attempts} total attempts · avg ${analytics.cbt_avg_pct}%`} testid="chart-cbt">
                  <GrowthArea data={analytics.cbt_series} xKey="month" yKey="attempts" color="#28A745" />
                </ChartCard>
                {analytics.subject_averages.length > 0 && (
                  <div className="lg:col-span-2">
                    <ChartCard title="Subject averages" subtitle="Average total score across all terms" testid="chart-subjects">
                      <BarSimple data={analytics.subject_averages.map((s) => ({ name: s.subject, count: s.average }))} xKey="name" yKey="count" color="#002147" />
                    </ChartCard>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* PROFILE TAB */}
          <TabsContent value="profile" className="mt-6">
            <div className="cs-card p-6">
              <h3 className="font-display font-semibold cs-text-navy text-lg">School profile</h3>
              <p className="text-sm text-slate-500 mt-1">This information appears on report cards, the parent portal, and printed PDFs.</p>
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200">
                <GraduationCap size={14} className="cs-text-navy" />
                <span className="text-xs font-semibold cs-text-navy">
                  School type: <span className="capitalize">{school.school_type || "secondary"}</span>
                </span>
                <span className="text-[10px] text-slate-500">
                  {school.school_type === "primary" && "· T/F questions allowed"}
                  {school.school_type === "mixed" && "· K-12 · All question types allowed"}
                  {(!school.school_type || school.school_type === "secondary") && "· MCQ only"}
                </span>
              </div>
              <div className="mt-6 grid md:grid-cols-[180px_1fr] gap-6">
                <div>
                  <div className="aspect-square border rounded-lg overflow-hidden bg-slate-50 flex items-center justify-center">
                    {profileForm.logo_url ? <img src={profileForm.logo_url} alt="logo" className="w-full h-full object-contain" /> : <ImageIcon size={32} className="text-slate-300" />}
                  </div>
                  <Label className="mt-3 block">School logo</Label>
                  <Input type="file" accept="image/*" onChange={onLogoFile} data-testid="profile-logo-input" />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2"><Label>School name</Label><Input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} data-testid="profile-name" /></div>
                  <div><Label>Principal name</Label><Input value={profileForm.principal_name} onChange={(e) => setProfileForm({ ...profileForm, principal_name: e.target.value })} data-testid="profile-principal" /></div>
                  <div><Label>Founded year</Label><Input value={profileForm.founded_year} onChange={(e) => setProfileForm({ ...profileForm, founded_year: e.target.value })} data-testid="profile-founded" /></div>
                  <div className="sm:col-span-2"><Label>Motto</Label><Input value={profileForm.motto} onChange={(e) => setProfileForm({ ...profileForm, motto: e.target.value })} placeholder="Knowledge. Discipline. Excellence." data-testid="profile-motto" /></div>
                  <div className="sm:col-span-2"><Label>Address</Label><Input value={profileForm.address} onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })} data-testid="profile-address" /></div>
                  <div><Label>Phone</Label><Input value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} data-testid="profile-phone" /></div>
                  <div><Label>School email</Label><Input type="email" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} data-testid="profile-email" /></div>
                  <div className="sm:col-span-2"><Label>Website</Label><Input value={profileForm.website} onChange={(e) => setProfileForm({ ...profileForm, website: e.target.value })} placeholder="https://..." data-testid="profile-website" /></div>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={saveProfile} className="cs-bg-green text-white hover:opacity-90 rounded-full btn-anim" data-testid="profile-save">Save profile</Button>
              </div>
            </div>
          </TabsContent>

          {/* CLASSES TAB */}
          <TabsContent value="classes" className="mt-6">
            <div className="cs-card p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="font-display font-semibold cs-text-navy text-lg">Class roster</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Your school has <strong>{classes.length}</strong> class{classes.length !== 1 ? "es" : ""}.
                    Add custom arms (e.g., <em>"Primary 1 Diamond"</em>, <em>"JSS 1 Crystal"</em>, <em>"SS 2 Science"</em>) as needed.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200">
                  <GraduationCap size={14} className="cs-text-navy" />
                  <span className="text-xs font-semibold cs-text-navy capitalize">{school.school_type || "secondary"} school</span>
                </div>
              </div>

              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <Input
                  placeholder="New class name (e.g., JSS 1 Crystal)"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addClass()}
                  data-testid="add-class-input"
                  className="flex-1"
                />
                <Button onClick={addClass} className="cs-bg-green text-white hover:opacity-90 rounded-full btn-anim" data-testid="add-class-btn">
                  <Plus size={14} className="mr-1" /> Add class
                </Button>
              </div>

              <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {classes.map((cn) => {
                  const studentCount = students.filter((s) => s.class_name === cn).length;
                  return (
                    <div key={cn} className="flex items-center justify-between p-3 rounded-lg border bg-white" data-testid={`class-row-${cn}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-md cs-bg-navy text-white flex items-center justify-center flex-shrink-0">
                          <GraduationCap size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold cs-text-navy truncate">{cn}</div>
                          <div className="text-[11px] text-slate-500">{studentCount} student{studentCount !== 1 ? "s" : ""}</div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => removeClassName(cn)}
                        data-testid={`class-del-${cn}`}
                        disabled={studentCount > 0}
                        title={studentCount > 0 ? "Cannot remove — students assigned" : "Remove class"}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  );
                })}
                {classes.length === 0 && (
                  <div className="col-span-full text-center text-slate-500 py-8">
                    No classes yet. Add one above.
                  </div>
                )}
              </div>

              <div className="mt-6 text-xs text-slate-500">
                💡 Tip: Classes you list here populate the dropdowns when adding students, assigning teachers, or building subjects.
              </div>
            </div>
          </TabsContent>

          {/* USERS TAB */}
          <TabsContent value="users" className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-display font-semibold cs-text-navy text-lg">Teachers, parents & students</h3>
                <p className="text-xs text-slate-500">Create logins, reveal/reset passwords, and promote trusted staff to admin.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setBulkRole("teacher")} className="btn-anim" data-testid="bulk-teachers-btn">
                  <FileSpreadsheet size={14} className="mr-1" /> Bulk teachers
                </Button>
                <Button variant="outline" size="sm" onClick={() => setBulkRole("parent")} className="btn-anim" data-testid="bulk-parents-btn">
                  <FileSpreadsheet size={14} className="mr-1" /> Bulk parents
                </Button>
                <Button variant="outline" size="sm" onClick={() => setBulkRole("student")} className="btn-anim" data-testid="bulk-students-btn">
                  <FileSpreadsheet size={14} className="mr-1" /> Bulk students
                </Button>
                <Button onClick={() => { setNewUser({ name: "", email: "", password: "", role: "teacher", assigned_class: "" }); setUserDlg(true); }} className="cs-bg-green text-white hover:opacity-90 rounded-full btn-anim" data-testid="add-user-btn"><Plus size={14} className="mr-1" /> Add user</Button>
              </div>
            </div>
            <div className="cs-card overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="cs-bg-navy hover:cs-bg-navy">
                      <TableHead className="text-white">Name</TableHead>
                      <TableHead className="text-white">Login</TableHead>
                      <TableHead className="text-white">Role</TableHead>
                      <TableHead className="text-white">Password</TableHead>
                      <TableHead className="text-white">Class</TableHead>
                      <TableHead className="text-white text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersList.filter((u) => u.role !== "super_admin" && u.id !== user.id).map((u, i) => {
                      const isAdminPower = u.role === "school_admin" || u.is_admin;
                      const isPrimaryAdmin = u.role === "school_admin";
                      const isPromoted = u.is_admin && u.role !== "school_admin";
                      const pwChanged = u.password_changed_by_user;
                      return (
                        <TableRow key={u.id} className={i % 2 ? "bg-slate-50" : ""} data-testid={`user-row-${u.id}`}>
                          <TableCell className="font-medium">
                            <div className="flex flex-col">
                              <span>{u.name}</span>
                              {isPromoted && <span className="text-[10px] text-emerald-700">+ Admin powers</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{u.email}</TableCell>
                          <TableCell>
                            <Badge className={
                              u.role === "teacher" ? "cs-bg-blue text-white" :
                              u.role === "parent" ? "bg-amber-500 text-white" :
                              u.role === "school_admin" ? "cs-bg-navy text-white" : "cs-bg-green text-white"
                            }>{u.role.replace("_", " ")}</Badge>
                          </TableCell>
                          <TableCell>
                            {pwChanged
                              ? <Badge variant="outline" className="text-slate-600 border-slate-300">User-set</Badge>
                              : <Badge variant="outline" className="text-emerald-700 border-emerald-300">Auto</Badge>}
                          </TableCell>
                          <TableCell className="text-xs">{u.assigned_class || (u.assigned_classes || []).join(", ") || "—"}</TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex gap-1">
                              {!pwChanged && (
                                <Button size="sm" variant="ghost" onClick={() => revealPwd(u)} title="Reveal password" data-testid={`reveal-${u.id}`}><Eye size={14} /></Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => resetPwd(u)} title="Reset password (generate new)" data-testid={`reset-${u.id}`}><RotateCcw size={14} /></Button>
                              {isPrimaryAdmin ? (
                                <Badge variant="outline" className="ml-1 text-[10px]">Primary admin</Badge>
                              ) : isPromoted ? (
                                <Button size="sm" variant="ghost" onClick={() => demoteUser(u)} title="Revoke admin powers" data-testid={`demote-${u.id}`}><UserMinus size={14} className="text-red-500" /></Button>
                              ) : (
                                (u.role === "teacher" || u.role === "parent") &&
                                <Button size="sm" variant="ghost" onClick={() => promoteUser(u)} title="Grant admin powers" data-testid={`promote-${u.id}`}><UserCog size={14} className="cs-text-blue" /></Button>
                              )}
                              {!isPrimaryAdmin && (
                                <Button size="sm" variant="ghost" onClick={() => removeUser(u.id)} title="Delete user" data-testid={`user-del-${u.id}`}><Trash2 size={14} className="text-red-500" /></Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!usersList.filter((u) => u.role !== "super_admin" && u.id !== user.id).length && (
                      <TableRow><TableCell colSpan={6} className="text-center text-slate-500 py-8">No teachers, parents or students yet. Click <strong>Add user</strong> or <strong>Bulk teachers/parents/students</strong>.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="students" className="mt-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h3 className="font-display font-semibold cs-text-navy text-lg">Students</h3>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => setBulkRole("student")} className="btn-anim" data-testid="students-bulk-btn">
                  <FileSpreadsheet size={14} className="mr-1" /> Bulk upload (auto-login)
                </Button>
                <Button onClick={() => setStudentDlg(true)} className="cs-bg-green text-white hover:opacity-90" data-testid="students-add-btn"><Plus size={16} className="mr-1" /> Add student</Button>
              </div>
            </div>
            <div className="cs-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="cs-bg-navy hover:cs-bg-navy">
                    <TableHead className="text-white">Photo</TableHead>
                    <TableHead className="text-white">Name</TableHead>
                    <TableHead className="text-white">Class</TableHead>
                    <TableHead className="text-white">Age</TableHead>
                    <TableHead className="text-white">Gender</TableHead>
                    <TableHead className="text-white">Parent</TableHead>
                    <TableHead className="text-white">Balance</TableHead>
                    <TableHead className="text-white">Login</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((s, i) => (
                    <TableRow key={s.id} className={i % 2 ? "bg-slate-50" : ""} data-testid={`student-row-${i}`}>
                      <TableCell>
                        <button onClick={() => setPassportDlg(s)} className="w-10 h-12 border rounded overflow-hidden bg-slate-100 hover:ring-2 hover:ring-[#0056B3]" data-testid={`passport-btn-${s.id}`}>
                          {s.passport_url ? <img src={s.passport_url} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={14} className="mx-auto text-slate-400" />}
                        </button>
                      </TableCell>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.class_name}</TableCell>
                      <TableCell>{s.age}</TableCell>
                      <TableCell>{s.gender}</TableCell>
                      <TableCell className="text-xs text-slate-500">{s.parent_email || "—"}</TableCell>
                      <TableCell>
                        {s.balance_due > 0 ? <span className="text-red-600 font-semibold">₦{s.balance_due.toLocaleString()}</span> : <span className="cs-text-green">Clear</span>}
                      </TableCell>
                      <TableCell>
                        {s.login_email ? (
                          <Badge className="cs-bg-green text-white text-[10px]">{s.login_email}</Badge>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => openLoginDlg(s)} data-testid={`create-login-${s.id}`}><KeyRound size={12} className="mr-1" /> Create login</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!students.length && (
                    <TableRow><TableCell colSpan={8} className="text-center text-slate-500 py-8">No students yet. Add one or upload an Excel file.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="subjects" className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold cs-text-navy text-lg">Subjects per class</h3>
              <Button onClick={openNewSubjects} className="cs-bg-green text-white hover:opacity-90 rounded-full" data-testid="add-subjects-btn"><Plus size={14} className="mr-1" /> Add class subjects</Button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {classSubjects.map((cs) => (
                <div key={cs.class_name} className="cs-card p-5" data-testid={`subjects-${cs.class_name}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-md cs-bg-blue text-white flex items-center justify-center"><BookOpen size={16} /></div>
                      <div className="font-display font-bold cs-text-navy">{cs.class_name}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => editSubjects(cs)} data-testid={`edit-subjects-${cs.class_name}`}>Edit</Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteSubjects(cs.class_name)} data-testid={`del-subjects-${cs.class_name}`}><Trash2 size={12} /></Button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {cs.subjects.map((sub) => <Badge key={sub} variant="outline" className="text-xs">{sub}</Badge>)}
                  </div>
                </div>
              ))}
              {!classSubjects.length && <div className="cs-card p-8 col-span-full text-center text-slate-500">No subjects assigned yet. Click <strong>Add class subjects</strong> to get started.</div>}
            </div>
          </TabsContent>

          <TabsContent value="subscription" className="mt-6">
            <div className="flex items-center gap-4 mb-6">
              <span className="eyebrow">DURATION</span>
              <div className="pill-toggle">
                {DURS.map((d) => (
                  <button key={d.k} className={duration === d.k ? "active" : ""} onClick={() => setDuration(d.k)} data-testid={`sub-dur-${d.k}`}>{d.l}</button>
                ))}
              </div>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
              {Object.entries(PRICING).map(([k, t]) => {
                const dur = k === "unified_enterprise" ? "full_session" : duration;
                const price = t[dur];
                const featured = k === "unified_enterprise";
                return (
                  <div key={k} className={`cs-card p-6 flex flex-col ${featured ? "tier-featured" : ""}`} data-testid={`subscribe-card-${k}`}>
                    <h3 className="font-display font-bold cs-text-navy text-lg">{t.name}</h3>
                    <div className="mt-4">
                      {price ? (
                        <div className="font-display text-3xl font-extrabold cs-text-navy">₦{price.toLocaleString()}</div>
                      ) : (
                        <div className="text-sm text-slate-400 italic">Full Session only</div>
                      )}
                    </div>
                    <Button disabled={!price} onClick={() => startCheckout(k)} className="mt-5 cs-bg-green text-white rounded-full hover:opacity-90" data-testid={`subscribe-btn-${k}`}>
                      Pay with card <ArrowRight size={16} className="ml-2" />
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="mt-8 cs-card p-6">
              <h3 className="font-display font-semibold cs-text-navy text-lg">Prefer bank transfer?</h3>
              <p className="text-sm text-slate-500 mt-1">Upload your Nigerian bank transfer slip — Super Admin verifies in hours.</p>
              <Button onClick={() => setBankDlg(true)} className="mt-4 cs-bg-navy text-white hover:opacity-90 rounded-full" data-testid="open-bank-dlg">Upload bank receipt</Button>
            </div>
          </TabsContent>

          <TabsContent value="receipts" className="mt-6">
            <h3 className="font-display font-semibold cs-text-navy text-lg mb-4">Bank receipts queue</h3>
            <div className="cs-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="cs-bg-navy hover:cs-bg-navy">
                    <TableHead className="text-white">Tier</TableHead>
                    <TableHead className="text-white">Duration</TableHead>
                    <TableHead className="text-white">Amount (₦)</TableHead>
                    <TableHead className="text-white">Status</TableHead>
                    <TableHead className="text-white">Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.map((r, i) => (
                    <TableRow key={r.id} className={i % 2 ? "bg-slate-50" : ""} data-testid={`receipt-row-${i}`}>
                      <TableCell>{PRICING[r.tier]?.name || r.tier}</TableCell>
                      <TableCell>{DURS.find((d) => d.k === r.duration)?.l || r.duration}</TableCell>
                      <TableCell>₦{Number(r.amount_ngn).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge className={r.status === "approved" ? "cs-bg-green text-white" : r.status === "rejected" ? "bg-red-500 text-white" : "bg-amber-500 text-white"}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">{new Date(r.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {!receipts.length && (<TableRow><TableCell colSpan={5} className="text-center text-slate-500 py-8">No receipts submitted yet.</TableCell></TableRow>)}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add student dialog */}
      <Dialog open={studentDlg} onOpenChange={setStudentDlg}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add student</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Name</Label><Input value={newStudent.name} onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })} data-testid="ns-name" /></div>
            <div>
              <Label>Class</Label>
              <Select value={newStudent.class_name} onValueChange={(v) => setNewStudent({ ...newStudent, class_name: v })}>
                <SelectTrigger data-testid="ns-class"><SelectValue placeholder="Select class…" /></SelectTrigger>
                <SelectContent>
                  {classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              {classes.length === 0 && <p className="text-[11px] text-amber-600 mt-1">No classes yet — add them on the Classes tab.</p>}
            </div>
            <div><Label>Age</Label><Input type="number" value={newStudent.age} onChange={(e) => setNewStudent({ ...newStudent, age: parseInt(e.target.value || "0") })} data-testid="ns-age" /></div>
            <div>
              <Label>Gender</Label>
              <Select value={newStudent.gender} onValueChange={(v) => setNewStudent({ ...newStudent, gender: v })}>
                <SelectTrigger data-testid="ns-gender"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Parent email (optional)</Label><Input type="email" value={newStudent.parent_email} onChange={(e) => setNewStudent({ ...newStudent, parent_email: e.target.value })} data-testid="ns-parent-email" /></div>
            <div className="col-span-2"><Label>Balance due (₦)</Label><Input type="number" value={newStudent.balance_due} onChange={(e) => setNewStudent({ ...newStudent, balance_due: parseFloat(e.target.value || "0") })} data-testid="ns-balance" /></div>
          </div>
          <DialogFooter><Button onClick={addStudent} className="cs-bg-green text-white hover:opacity-90" data-testid="ns-submit">Save student</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bank receipt dialog */}
      <Dialog open={bankDlg} onOpenChange={setBankDlg}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload bank transfer receipt</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tier</Label>
                <Select value={bankForm.tier} onValueChange={(v) => setBankForm({ ...bankForm, tier: v })}>
                  <SelectTrigger data-testid="bank-tier"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PRICING).map(([k, v]) => <SelectItem key={k} value={k}>{v.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Duration</Label>
                <Select value={bankForm.duration} onValueChange={(v) => setBankForm({ ...bankForm, duration: v })}>
                  <SelectTrigger data-testid="bank-dur"><SelectValue /></SelectTrigger>
                  <SelectContent>{DURS.map((d) => <SelectItem key={d.k} value={d.k}>{d.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Amount paid (₦)</Label><Input type="number" value={bankForm.amount_ngn} onChange={(e) => setBankForm({ ...bankForm, amount_ngn: parseFloat(e.target.value || "0") })} data-testid="bank-amount" /></div>
            <div>
              <Label>Receipt file</Label>
              <Input type="file" accept="image/*,.pdf" onChange={onReceiptFile} data-testid="bank-file" />
              {bankForm.file_data_url && <div className="text-xs cs-text-green mt-1">Attached.</div>}
            </div>
            <div><Label>Note (optional)</Label><Input value={bankForm.note} onChange={(e) => setBankForm({ ...bankForm, note: e.target.value })} data-testid="bank-note" /></div>
          </div>
          <DialogFooter><Button onClick={submitBank} className="cs-bg-green text-white hover:opacity-90" data-testid="bank-submit">Submit receipt</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Subjects dialog */}
      <Dialog open={subjDlg} onOpenChange={setSubjDlg}>
        <DialogContent>
          <DialogHeader><DialogTitle>{subjForm.class_name && classSubjects.find((c) => c.class_name === subjForm.class_name) ? "Edit class subjects" : "Add class subjects"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Class name</Label>
              <Select value={subjForm.class_name} onValueChange={(v) => setSubjForm({ ...subjForm, class_name: v })}>
                <SelectTrigger data-testid="subj-class"><SelectValue placeholder="Select class…" /></SelectTrigger>
                <SelectContent>
                  {classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subjects (one per line)</Label>
              <textarea
                rows={8}
                value={subjForm.subjectsText}
                onChange={(e) => setSubjForm({ ...subjForm, subjectsText: e.target.value })}
                className="w-full rounded-md border border-slate-200 p-3 text-sm font-mono"
                placeholder="Mathematics&#10;English Language&#10;Basic Science"
                data-testid="subj-list"
              />
            </div>
          </div>
          <DialogFooter><Button onClick={saveSubjects} className="cs-bg-green text-white hover:opacity-90" data-testid="subj-save">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Login provisioning dialog */}
      <Dialog open={!!loginDlg} onOpenChange={(o) => !o && setLoginDlg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create login for {loginDlg?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Email</Label><Input type="email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} data-testid="login-create-email" /></div>
            <div><Label>Password</Label><Input value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} data-testid="login-create-pw" /></div>
            <p className="text-xs text-slate-500">Share these credentials with the student. They can log in at the main page.</p>
          </div>
          <DialogFooter><Button onClick={submitLogin} className="cs-bg-green text-white hover:opacity-90" data-testid="login-create-submit">Create login</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Passport upload dialog */}
      <Dialog open={!!passportDlg} onOpenChange={(o) => !o && setPassportDlg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Passport — {passportDlg?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="aspect-[3/4] w-40 mx-auto border rounded overflow-hidden bg-slate-100 flex items-center justify-center">
              {passportDlg?.passport_url ? <img src={passportDlg.passport_url} alt="" className="w-full h-full object-cover" /> : <div className="text-xs text-slate-400">NO PHOTO</div>}
            </div>
            <Label>Upload new passport</Label>
            <Input type="file" accept="image/*" onChange={(e) => onPassportFile(passportDlg, e)} data-testid="passport-input" />
          </div>
        </DialogContent>
      </Dialog>
      {/* New user (teacher / parent) dialog */}
      <Dialog open={userDlg} onOpenChange={setUserDlg}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add user</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Role</Label>
              <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v })}>
                <SelectTrigger data-testid="nu-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="parent">Parent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Full name</Label><Input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} data-testid="nu-name" /></div>
            <div><Label>Email</Label><Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} data-testid="nu-email" /></div>
            <div><Label>Password</Label><Input value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} data-testid="nu-password" /></div>
            {newUser.role === "teacher" && (
              <div>
                <Label>Assigned class (optional)</Label>
                <Select value={newUser.assigned_class || "__none__"} onValueChange={(v) => setNewUser({ ...newUser, assigned_class: v === "__none__" ? "" : v })}>
                  <SelectTrigger data-testid="nu-class"><SelectValue placeholder="No class assigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <p className="text-xs text-slate-500">Share these credentials with the user. They sign in at the main login page.</p>
          </div>
          <DialogFooter><Button onClick={submitNewUser} className="cs-bg-green text-white hover:opacity-90 btn-anim" data-testid="nu-submit">Create user</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk upload dialog — teachers / parents / students */}
      <BulkUploadDialog
        open={!!bulkRole}
        onOpenChange={(o) => !o && setBulkRole(null)}
        role={bulkRole}
        onUploaded={refresh}
      />

      {/* Credentials modal — used by Reveal / Reset password */}
      <CredentialsModal
        open={!!credModal}
        onOpenChange={(o) => !o && setCredModal(null)}
        title={credModal?.title}
        created={credModal?.created || []}
        skipped={credModal?.skipped || []}
        role={credModal?.role || "user"}
        note={credModal?.note || ""}
      />

    </div>
  );
}
