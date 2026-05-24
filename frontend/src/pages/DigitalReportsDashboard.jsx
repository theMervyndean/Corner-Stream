import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth.jsx";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import Navbar from "@/components/Navbar.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import LockedOverlay from "@/components/LockedOverlay.jsx";
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, ClipboardList, FileText,
  Settings, LogOut, FileSpreadsheet, Trash2, Plus, Lock, Award, Printer,
  ChevronRight, Sparkles, CreditCard, CheckCircle2, ArrowRight,
} from "lucide-react";

const TABS = [
  { key: "overview",     label: "Overview",     icon: LayoutDashboard },
  { key: "students",     label: "Students",     icon: Users },
  { key: "users",        label: "Teachers",     icon: GraduationCap },
  { key: "classes",      label: "Classes",      icon: BookOpen },
  { key: "subjects",     label: "Subjects",     icon: BookOpen },
  { key: "scores",       label: "Score entry",  icon: ClipboardList },
  { key: "reports",      label: "Reports",      icon: FileText },
  { key: "subscription", label: "Subscription", icon: CreditCard },
  { key: "profile",      label: "Profile",      icon: Settings },
];

// Pricing mirror — read-only display so admins on this tier can see upgrade paths.
const DR_PRICING = {
  cbt_essentials: {
    name: "CBT Essentials", "1_term": 40000, "2_terms": 70000, "full_session": 110000,
    blurb: "Run computer-based exams with auto-graded MCQ + True/False.",
    features: ["CBT exam builder", "MCQ + True/False", "Auto-grading & attempts log", "Class-level publishing"],
  },
  digital_reports: {
    name: "Digital Reports", "1_term": 50000, "2_terms": 90000, "full_session": 140000,
    blurb: "Per-term digital report cards with QR verification and annual averaging.",
    features: ["Termly report cards", "Annual cumulative report", "QR-verified PDFs", "Per-column CA scoring"],
  },
  financial_ledger: {
    name: "Financial Ledger", "1_term": 40000, "2_terms": 70000, "full_session": 110000,
    blurb: "Fee tracking, debt-lock controls and parent visibility.",
    features: ["Per-student fee balance", "Debt-lock on results", "Bursary dashboard", "Parent fee visibility"],
  },
  unified_enterprise: {
    name: "Unified Enterprise", full_session: 200000,
    blurb: "Everything in CBT, Digital Reports and Financial Ledger — bundled.",
    features: ["All CBT features", "All Digital Reports", "All Financial Ledger", "Priority support"],
  },
};
const DR_DURS = [{ k: "1_term", l: "1 Term" }, { k: "2_terms", l: "2 Terms" }, { k: "full_session", l: "Full Session" }];

export default function DigitalReportsDashboard({ school: initialSchool, refreshOuter }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [school, setSchool] = useState(initialSchool);
  const [students, setStudents] = useState([]);
  const [classSubjects, setClassSubjects] = useState([]);
  const [tab, setTab] = useState("overview");
  const [cbtModalOpen, setCbtModalOpen] = useState(false);

  // Class management
  const [newClassName, setNewClassName] = useState("");
  const [renamingClass, setRenamingClass] = useState(null);

  // Students
  const [studentDlg, setStudentDlg] = useState(false);
  const [newStudent, setNewStudent] = useState({ name: "", age: 10, gender: "Male", class_name: "", parent_email: "", balance_due: 0 });

  // Subjects
  const [subjDlg, setSubjDlg] = useState(false);
  const [subjForm, setSubjForm] = useState({ class_name: "", subjectsText: "" });

  // Score entry
  const [scoreFilters, setScoreFilters] = useState({ class_name: "", subject: "", term: "1st Term" });
  const [scoreGrid, setScoreGrid] = useState({}); // student_id -> {ca, exam}

  // Profile
  const [profileForm, setProfileForm] = useState({
    name: "", principal_name: "", address: "", phone: "", email: "", motto: "",
    logo_url: "", brand_color: "#002147", ca_max: 40, exam_max: 60, ca_count: 1,
  });

  const refresh = async () => {
    try {
      const [sRes, stRes, sjRes] = await Promise.all([
        api.get("/schools/me"),
        api.get("/students"),
        api.get("/subjects"),
      ]);
      const s = sRes.data.school;
      setSchool(s);
      setStudents(stRes.data.students || []);
      setClassSubjects(sjRes.data.class_subjects || []);
      setProfileForm({
        name: s.name || "", principal_name: s.principal_name || "", address: s.address || "",
        phone: s.phone || "", email: s.email || "", motto: s.motto || "",
        logo_url: s.logo_url || "", brand_color: s.brand_color || "#002147",
        ca_max: s.ca_max ?? 40, exam_max: s.exam_max ?? 60, ca_count: s.ca_count ?? 1,
      });
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  useEffect(() => { refresh(); }, []);

  const classes = useMemo(() => school?.classes || [], [school]);
  const brand = school?.brand_color || "#002147";
  const locked = school?.verification_status && school.verification_status !== "active";

  // ---- handlers (compact)
  const addClass = async () => {
    const n = newClassName.trim();
    if (!n) return toast.error("Enter a class name");
    try {
      const { data } = await api.post("/schools/me/classes", { class_name: n });
      setSchool((s) => s ? { ...s, classes: data.classes } : s);
      setNewClassName(""); toast.success(`Added "${n}"`);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const renameClass = async (oldN, newN) => {
    const n = (newN || "").trim();
    if (!n || n === oldN) { setRenamingClass(null); return; }
    try {
      const { data } = await api.put(`/schools/me/classes/${encodeURIComponent(oldN)}`, { new_name: n });
      setSchool((s) => s ? { ...s, classes: data.classes } : s);
      setRenamingClass(null); toast.success(`Renamed → "${n}"`); refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const removeClass = async (n) => {
    if (!window.confirm(`Remove "${n}"?`)) return;
    try { await api.delete(`/schools/me/classes/${encodeURIComponent(n)}`); refresh(); toast.success(`Removed "${n}"`); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const dlTemplate = async (cn) => {
    try {
      const res = await api.get(`/students/template/${encodeURIComponent(cn)}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a"); a.href = url; a.download = `${cn.replace(/\s+/g,"_")}_students.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
      toast.success(`Template downloaded`);
    } catch { toast.error("Could not download"); }
  };
  const addStudent = async () => {
    if (!newStudent.name || !newStudent.class_name) return toast.error("Name and class required");
    try {
      await api.post("/students", newStudent);
      setStudentDlg(false); setNewStudent({ name:"", age:10, gender:"Male", class_name:"", parent_email:"", balance_due:0 });
      refresh(); toast.success("Student added");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const delStudent = async (id, name) => {
    if (!window.confirm(`Delete ${name}?`)) return;
    try { await api.delete(`/students/${id}`); refresh(); toast.success("Deleted"); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const saveSubjects = async () => {
    const list = subjForm.subjectsText.split("\n").map(s=>s.trim()).filter(Boolean);
    if (!subjForm.class_name || !list.length) return toast.error("Class and subjects required");
    try {
      await api.put("/subjects", { class_name: subjForm.class_name, subjects: list });
      setSubjDlg(false); refresh(); toast.success("Subjects saved");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const loadScoreGrid = async () => {
    const { class_name, subject, term } = scoreFilters;
    if (!class_name || !subject) return;
    const stuInClass = students.filter((s) => s.class_name === class_name);
    const grid = {};
    await Promise.all(stuInClass.map(async (st) => {
      try {
        const { data } = await api.get("/scores", { params: { student_id: st.id, term, subject } });
        const row = (data.scores || []).find((r) => r.subject === subject);
        grid[st.id] = { ca: row?.ca_score ?? "", exam: row?.exam_score ?? "" };
      } catch { grid[st.id] = { ca: "", exam: "" }; }
    }));
    setScoreGrid(grid);
  };
  useEffect(() => { if (scoreFilters.class_name && scoreFilters.subject) loadScoreGrid(); /* eslint-disable-next-line */ }, [scoreFilters.class_name, scoreFilters.subject, scoreFilters.term]);

  const submitOneScore = async (studentId, ca, exam) => {
    const caN = Number(ca) || 0; const examN = Number(exam) || 0;
    try {
      await api.post("/scores", {
        student_id: studentId, school_id: school.id,
        term: scoreFilters.term, year: "2025/2026",
        subject: scoreFilters.subject,
        ca_score: caN, exam_score: examN,
      });
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const saveAllScores = async () => {
    const stuInClass = students.filter((s) => s.class_name === scoreFilters.class_name);
    await Promise.all(stuInClass.map((st) => {
      const row = scoreGrid[st.id]; if (!row) return null;
      if (row.ca === "" && row.exam === "") return null;
      return submitOneScore(st.id, row.ca, row.exam);
    }));
    toast.success("Scores saved");
    loadScoreGrid();
  };

  const saveProfile = async () => {
    try { await api.put("/schools/me", profileForm); toast.success("Profile saved"); refresh(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  // ─── Teachers tab data (hooks declared BEFORE the early return) ───
  const [usersList, setUsersList] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  useEffect(() => {
    if (tab !== "users") return;
    setUsersLoading(true);
    api.get("/users").then(({ data }) => setUsersList(data.users || []))
      .catch((e) => toast.error(formatApiError(e.response?.data?.detail) || e.message))
      .finally(() => setUsersLoading(false));
  }, [tab]);

  if (!school) return <div className="min-h-screen p-10 text-slate-500">Loading…</div>;

  // -------- SIDEBAR --------
  const Sidebar = () => (
    <aside className="fixed left-0 top-0 bottom-0 z-40 w-16 sm:w-56 border-r flex flex-col" style={{ background: "linear-gradient(180deg, #001a38 0%, #002147 100%)" }} data-testid="dr-sidebar">
      <div className="px-3 py-5 flex items-center gap-2 border-b border-white/10">
        <div className="w-9 h-9 rounded-md cs-bg-green text-white flex items-center justify-center flex-shrink-0"><Sparkles size={18} /></div>
        <div className="hidden sm:block">
          <div className="font-display font-bold text-white text-sm leading-tight">Digital</div>
          <div className="font-display font-bold text-white text-sm leading-tight">Reports</div>
        </div>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              data-testid={`dr-tab-${t.key}`}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition ${active ? "bg-white/15 text-white font-semibold" : "text-white/70 hover:bg-white/5 hover:text-white"}`}
              title={t.label}
            >
              <Icon size={18} className="flex-shrink-0" />
              <span className="hidden sm:inline">{t.label}</span>
              {active && <ChevronRight size={14} className="ml-auto hidden sm:inline" />}
            </button>
          );
        })}
      </nav>
      <button onClick={() => { logout(); navigate("/"); }} className="m-2 flex items-center gap-3 px-3 py-2 rounded-md text-white/70 hover:bg-white/5 hover:text-white text-sm" data-testid="dr-logout">
        <LogOut size={16} /> <span className="hidden sm:inline">Sign out</span>
      </button>
    </aside>
  );

  // -------- TAB PANES --------
  const Hero = () => (
    <div className="mb-6 rounded-xl p-6 text-white relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${brand} 0%, #001a38 100%)` }}>
      <div className="absolute right-4 top-4 opacity-10"><Award size={140} /></div>
      <div className="relative z-10 flex items-start justify-between flex-wrap gap-4">
        <div>
          <span className="inline-block text-[10px] font-bold tracking-widest text-white/80 uppercase">{(school.subscription_tier || "digital_reports").replace(/_/g, " ").toUpperCase()} · ACTIVE</span>
          <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1" data-testid="dr-overview-school-name">{school.name}</h1>
          <p className="text-sm text-white/80 mt-1 max-w-xl">Every result, every term — signed, sealed, and verifiable by QR. Issue half-term progress sheets and full-term report cards.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setTab("reports")} className="bg-white text-slate-900 hover:bg-white/90 rounded-full font-semibold" data-testid="dr-btn-digitalreports">
            <FileText size={14} className="mr-1.5" /> Digital Reports
          </Button>
          <Button onClick={() => setCbtModalOpen(true)} variant="outline" className="bg-transparent border-white/40 text-white hover:bg-white/10 rounded-full" data-testid="dr-btn-cbt">
            CBT
          </Button>
        </div>
      </div>
    </div>
  );

  const ReportsTab = () => {
    const [pickClassFor, setPickClassFor] = React.useState(null); // 'half' | 'full' | null
    const [pickedClass, setPickedClass] = React.useState("");
    const uploadInputRef = React.useRef(null);
    const onUpload = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const fd = new FormData();
      fd.append("file", file);
      try {
        await api.post("/students/bulk-upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
        toast.success("Sheet uploaded. Teachers can now see it in their dashboard.");
        refresh();
      } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
      finally { if (uploadInputRef.current) uploadInputRef.current.value = ""; }
    };
    return (
      <div>
        <h2 className="font-display text-2xl font-bold cs-text-navy">Reports</h2>
        <p className="text-sm text-slate-500 mb-6">Download a result template, fill it in offline, and upload the completed sheet. Teachers see the uploaded sheets in their dashboard.</p>
        <div className="grid sm:grid-cols-2 gap-5">
          {/* HALF TERM box */}
          <button onClick={() => setPickClassFor("half")} className="cs-card p-8 text-left hover:shadow-xl transition border-l-4" style={{ borderLeftColor: brand }} data-testid="dr-box-halfterm">
            <div className="w-14 h-14 rounded-lg flex items-center justify-center text-white mb-4" style={{ backgroundColor: brand }}><FileText size={26} /></div>
            <div className="font-display text-2xl font-bold cs-text-navy">Half-term Report</div>
            <p className="text-sm text-slate-500 mt-2">Mid-term progress sheet. Download the template with CA columns (no exam yet), fill scores per student, then upload.</p>
            <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: brand }}>Open <ChevronRight size={14} /></div>
          </button>
          {/* FULL TERM box */}
          <button onClick={() => setPickClassFor("full")} className="cs-card p-8 text-left hover:shadow-xl transition border-l-4" style={{ borderLeftColor: "#28A745" }} data-testid="dr-box-fullterm">
            <div className="w-14 h-14 rounded-lg flex items-center justify-center text-white mb-4 cs-bg-green"><Award size={26} /></div>
            <div className="font-display text-2xl font-bold cs-text-navy">Full-term Report</div>
            <p className="text-sm text-slate-500 mt-2">End-of-term final report. Template includes CA + Exam columns. Upload after exams to generate report cards.</p>
            <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold cs-text-green">Open <ChevronRight size={14} /></div>
          </button>
        </div>

        {/* Class picker dialog */}
        <Dialog open={!!pickClassFor} onOpenChange={(o) => { if (!o) { setPickClassFor(null); setPickedClass(""); } }}>
          <DialogContent>
            <DialogHeader><DialogTitle>{pickClassFor === "half" ? "Half-term Report" : "Full-term Report"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Label>Pick a class</Label>
              <Select value={pickedClass} onValueChange={setPickedClass}>
                <SelectTrigger data-testid="dr-pick-class"><SelectValue placeholder="Class" /></SelectTrigger>
                <SelectContent>{classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-slate-500">Download the template, share with the teacher to fill, then upload the completed sheet here.</p>
              <input ref={uploadInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onUpload} />
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button disabled={!pickedClass} onClick={() => dlTemplate(pickedClass)} className="cs-bg-navy text-white rounded-full flex-1" data-testid="dr-dl-tpl"><FileSpreadsheet size={14} className="mr-1" /> Download template</Button>
                <Button disabled={!pickedClass} onClick={() => uploadInputRef.current?.click()} className="cs-bg-green text-white rounded-full flex-1" data-testid="dr-up-tpl"><Plus size={14} className="mr-1" /> Upload completed sheet</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Per-student quick links (kept for direct issuing) */}
        <div className="mt-8">
          <div className="eyebrow cs-text-navy mb-2">QUICK ISSUE PER STUDENT</div>
          <div className="cs-card overflow-x-auto">
            <Table>
              <TableHeader><TableRow style={{ backgroundColor: brand }}><TableHead className="text-white">Student</TableHead><TableHead className="text-white">Class</TableHead><TableHead className="text-white">1st Term</TableHead><TableHead className="text-white">2nd Term</TableHead><TableHead className="text-white">3rd Term</TableHead></TableRow></TableHeader>
              <TableBody>
                {students.map((s, i) => (
                  <TableRow key={s.id} className={i % 2 ? "bg-slate-50" : ""}>
                    <TableCell className="font-semibold">{s.name}</TableCell>
                    <TableCell>{s.class_name}</TableCell>
                    {["1st Term", "2nd Term", "3rd Term"].map((t) => (
                      <TableCell key={t}>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => navigate(`/report/half/${s.id}/${encodeURIComponent(t)}`)} data-testid={`dr-rep-half-${s.id}-${t}`}>Half</Button>
                          <Button size="sm" className="text-white" style={{ backgroundColor: brand }} onClick={() => navigate(`/report/${s.id}/${encodeURIComponent(t)}`)} data-testid={`dr-rep-full-${s.id}-${t}`}>Full</Button>
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {!students.length && <TableRow><TableCell colSpan={5} className="text-center text-slate-500 py-6">Add students first.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    );
  };

  const Overview = () => (
    <div>
      <Hero />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { l: "Students", v: students.length, c: brand },
          { l: "Classes", v: classes.length, c: "#28A745" },
          { l: "Subject sets", v: classSubjects.length, c: "#0056B3" },
          { l: "Debtors", v: students.filter((s)=>(s.balance_due||0)>0).length, c: "#dc2626" },
        ].map((m, i) => (
          <div key={i} className="cs-card p-5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{m.l}</div>
            <div className="font-display text-3xl font-bold mt-1" style={{ color: m.c }}>{m.v}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 grid sm:grid-cols-2 gap-4">
        <button onClick={() => setTab("scores")} className="cs-card p-5 text-left hover:shadow-md transition border-l-4" style={{ borderLeftColor: brand }}>
          <div className="font-display font-bold cs-text-navy">Enter scores</div>
          <div className="text-sm text-slate-500 mt-1">Bulk-enter CA + Exam for an entire class in one grid.</div>
        </button>
        <button onClick={() => setTab("reports")} className="cs-card p-5 text-left hover:shadow-md transition border-l-4" style={{ borderLeftColor: "#28A745" }}>
          <div className="font-display font-bold cs-text-navy">Generate reports</div>
          <div className="text-sm text-slate-500 mt-1">Issue half-term or full-term report cards for any student.</div>
        </button>
      </div>
    </div>
  );

  const StudentsTab = () => (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-2xl font-bold cs-text-navy">Students</h2>
          <p className="text-sm text-slate-500">All registered students across your classes.</p>
        </div>
        <Button onClick={() => setStudentDlg(true)} className="cs-bg-green text-white hover:opacity-90 rounded-full" data-testid="dr-add-student"><Plus size={14} className="mr-1" /> Add student</Button>
      </div>
      <div className="cs-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow style={{ backgroundColor: brand }}>
              <TableHead className="text-white">Name</TableHead>
              <TableHead className="text-white">Class</TableHead>
              <TableHead className="text-white">Age/Gender</TableHead>
              <TableHead className="text-white">Balance</TableHead>
              <TableHead className="text-white">Reports</TableHead>
              <TableHead className="text-white"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((s,i)=>(
              <TableRow key={s.id} className={i%2?"bg-slate-50":""}>
                <TableCell className="font-semibold">{s.name}</TableCell>
                <TableCell>{s.class_name}</TableCell>
                <TableCell className="text-xs">{s.gender}, {s.age}</TableCell>
                <TableCell>{(s.balance_due||0)>0 ? <Badge className="bg-amber-500 text-white">₦{Number(s.balance_due).toLocaleString()}</Badge> : <Badge className="cs-bg-green text-white">Clear</Badge>}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={()=>navigate(`/report/half/${s.id}/1st%20Term`)} data-testid={`dr-half-${s.id}`}>Half</Button>
                    <Button size="sm" variant="outline" onClick={()=>navigate(`/report/${s.id}/1st%20Term`)} data-testid={`dr-full-${s.id}`}>Full</Button>
                  </div>
                </TableCell>
                <TableCell><Button size="sm" variant="destructive" onClick={()=>delStudent(s.id, s.name)}><Trash2 size={12} /></Button></TableCell>
              </TableRow>
            ))}
            {!students.length && <TableRow><TableCell colSpan={6} className="text-center text-slate-500 py-8">No students yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  const ClassesTab = () => (
    <div>
      <h2 className="font-display text-2xl font-bold cs-text-navy">Classes</h2>
      <p className="text-sm text-slate-500 mb-4">Manage your class roster. Click a class name to rename.</p>
      <div className="cs-card p-5">
        <div className="flex gap-2 flex-col sm:flex-row">
          <Input placeholder="New class (e.g. JSS 1 Crystal)" value={newClassName} onChange={(e)=>setNewClassName(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&addClass()} data-testid="dr-class-input" />
          <Button onClick={addClass} className="cs-bg-green text-white rounded-full" data-testid="dr-class-add"><Plus size={14} className="mr-1" /> Add</Button>
        </div>
        <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {classes.map((cn)=>{
            const count = students.filter((s)=>s.class_name===cn).length;
            const renaming = renamingClass?.old===cn;
            return (
              <div key={cn} className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-white" data-testid={`dr-class-${cn}`}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 text-white" style={{ backgroundColor: brand }}><GraduationCap size={16} /></div>
                  <div className="min-w-0 flex-1">
                    {renaming ? (
                      <Input autoFocus defaultValue={cn} onBlur={(e)=>renameClass(cn,e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter")renameClass(cn,e.target.value);if(e.key==="Escape")setRenamingClass(null);}} className="h-7 text-sm" />
                    ) : (
                      <div className="font-semibold cs-text-navy truncate cursor-pointer hover:underline" onClick={()=>setRenamingClass({old:cn})}>{cn}</div>
                    )}
                    <div className="text-[11px] text-slate-500">{count} student{count!==1?"s":""}</div>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button size="sm" variant="outline" onClick={()=>dlTemplate(cn)} title="Download Excel template"><FileSpreadsheet size={12} /></Button>
                  <Button size="sm" variant="destructive" onClick={()=>removeClass(cn)} disabled={count>0} title={count>0?"Has students":"Remove"}><Trash2 size={12} /></Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const SubjectsTab = () => (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-2xl font-bold cs-text-navy">Subjects per class</h2>
          <p className="text-sm text-slate-500">JSS and SSS classes come pre-loaded with the full Nigerian curriculum.</p>
        </div>
        <Button onClick={()=>{setSubjForm({class_name:"",subjectsText:""}); setSubjDlg(true);}} className="cs-bg-green text-white rounded-full"><Plus size={14} className="mr-1" /> Add subjects</Button>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {classSubjects.map((cs)=>(
          <div key={cs.class_name} className="cs-card p-5 border-t-4" style={{ borderTopColor: brand }}>
            <div className="flex items-center justify-between">
              <div className="font-display font-bold cs-text-navy">{cs.class_name}</div>
              <Button size="sm" variant="outline" onClick={()=>{setSubjForm({class_name:cs.class_name, subjectsText:cs.subjects.join("\n")}); setSubjDlg(true);}}>Edit</Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {cs.subjects.map((s)=><span key={s} className="text-xs px-2 py-1 rounded-full bg-slate-100 cs-text-navy">{s}</span>)}
            </div>
          </div>
        ))}
        {!classSubjects.length && <div className="text-slate-500 col-span-full text-center py-10">No subjects yet.</div>}
      </div>
    </div>
  );

  const ScoresTab = () => {
    const stuInClass = students.filter((s)=>s.class_name===scoreFilters.class_name);
    const subjectsForClass = classSubjects.find((cs)=>cs.class_name===scoreFilters.class_name)?.subjects || [];
    return (
      <div>
        <h2 className="font-display text-2xl font-bold cs-text-navy">Score entry</h2>
        <p className="text-sm text-slate-500 mb-4">Bulk-enter CA + Exam for an entire class in one grid.</p>
        <div className="cs-card p-5">
          <div className="grid sm:grid-cols-3 gap-3">
            <div><Label className="text-xs">Class</Label>
              <Select value={scoreFilters.class_name} onValueChange={(v)=>setScoreFilters((f)=>({...f, class_name:v, subject:""}))}>
                <SelectTrigger data-testid="dr-score-class"><SelectValue placeholder="Pick class" /></SelectTrigger>
                <SelectContent>{classes.map((c)=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Subject</Label>
              <Select value={scoreFilters.subject} onValueChange={(v)=>setScoreFilters((f)=>({...f, subject:v}))}>
                <SelectTrigger data-testid="dr-score-subject"><SelectValue placeholder="Pick subject" /></SelectTrigger>
                <SelectContent>{subjectsForClass.map((s)=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Term</Label>
              <Select value={scoreFilters.term} onValueChange={(v)=>setScoreFilters((f)=>({...f, term:v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["1st Term","2nd Term","3rd Term"].map((t)=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {scoreFilters.class_name && scoreFilters.subject && (
            <div className="mt-5">
              <Table>
                <TableHeader>
                  <TableRow style={{ backgroundColor: brand }}>
                    <TableHead className="text-white">Student</TableHead>
                    <TableHead className="text-white text-center">CA ({profileForm.ca_max})</TableHead>
                    <TableHead className="text-white text-center">Exam ({profileForm.exam_max})</TableHead>
                    <TableHead className="text-white text-center">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stuInClass.map((st,i)=>{
                    const row = scoreGrid[st.id] || { ca: "", exam: "" };
                    const total = (Number(row.ca)||0) + (Number(row.exam)||0);
                    return (
                      <TableRow key={st.id} className={i%2?"bg-slate-50":""}>
                        <TableCell className="font-medium">{st.name}</TableCell>
                        <TableCell><Input type="number" className="text-center" value={row.ca} onChange={(e)=>setScoreGrid((g)=>({...g, [st.id]:{...row, ca:e.target.value}}))} data-testid={`dr-score-ca-${st.id}`} /></TableCell>
                        <TableCell><Input type="number" className="text-center" value={row.exam} onChange={(e)=>setScoreGrid((g)=>({...g, [st.id]:{...row, exam:e.target.value}}))} data-testid={`dr-score-exam-${st.id}`} /></TableCell>
                        <TableCell className="text-center font-bold" style={{ color: brand }}>{total}</TableCell>
                      </TableRow>
                    );
                  })}
                  {!stuInClass.length && <TableRow><TableCell colSpan={4} className="text-center text-slate-500 py-6">No students in {scoreFilters.class_name}</TableCell></TableRow>}
                </TableBody>
              </Table>
              {stuInClass.length>0 && (
                <div className="mt-4 flex justify-end">
                  <Button onClick={saveAllScores} className="cs-bg-green text-white rounded-full" data-testid="dr-score-save"><ClipboardList size={14} className="mr-1" /> Save all scores</Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const ProfileTab = () => (
    <div>
      <h2 className="font-display text-2xl font-bold cs-text-navy">School profile</h2>
      <p className="text-sm text-slate-500 mb-4">Branding & score model that appear on every report card.</p>
      <div className="cs-card p-6">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>School name</Label><Input value={profileForm.name} onChange={(e)=>setProfileForm({...profileForm, name:e.target.value})} /></div>
          <div><Label>Principal</Label><Input value={profileForm.principal_name} onChange={(e)=>setProfileForm({...profileForm, principal_name:e.target.value})} /></div>
          <div className="sm:col-span-2"><Label>Motto</Label><Input value={profileForm.motto} onChange={(e)=>setProfileForm({...profileForm, motto:e.target.value})} placeholder="Knowledge. Discipline. Excellence." /></div>
          <div className="sm:col-span-2"><Label>Address</Label><Input value={profileForm.address} onChange={(e)=>setProfileForm({...profileForm, address:e.target.value})} /></div>
          <div><Label>Phone</Label><Input value={profileForm.phone} onChange={(e)=>setProfileForm({...profileForm, phone:e.target.value})} /></div>
          <div><Label>Email</Label><Input value={profileForm.email} onChange={(e)=>setProfileForm({...profileForm, email:e.target.value})} /></div>
        </div>
        <div className="mt-6 pt-5 border-t">
          <div className="eyebrow cs-text-navy">REPORT CARD SETTINGS</div>
          <div className="mt-3 grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Brand color</Label>
              <div className="mt-1 flex items-center gap-2">
                <input type="color" value={profileForm.brand_color} onChange={(e)=>setProfileForm({...profileForm, brand_color:e.target.value})} className="h-10 w-12 rounded border" />
                <Input value={profileForm.brand_color} onChange={(e)=>setProfileForm({...profileForm, brand_color:e.target.value})} className="font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>CA max</Label><Input type="number" value={profileForm.ca_max} onChange={(e)=>setProfileForm({...profileForm, ca_max:Number(e.target.value)})} /></div>
              <div><Label>Exam max</Label><Input type="number" value={profileForm.exam_max} onChange={(e)=>setProfileForm({...profileForm, exam_max:Number(e.target.value)})} /></div>
              <div><Label>CAs</Label><Input type="number" value={profileForm.ca_count} onChange={(e)=>setProfileForm({...profileForm, ca_count:Number(e.target.value)})} /></div>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">CA + Exam must total 100. WAEC-style: 20 + 80 with 4 CAs.</p>
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={saveProfile} className="cs-bg-green text-white rounded-full">Save profile</Button>
        </div>
      </div>
    </div>
  );

  // ─── Teachers/Users tab — minimal read-only roster ───
  const UsersTab = () => (
    <div data-testid="dr-users-tab">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display font-bold cs-text-navy text-2xl">Teachers & Staff</h2>
          <p className="text-sm text-slate-500 mt-1">Read-only roster of users registered to your school. Full management lives in the Unified Enterprise plan.</p>
        </div>
      </div>
      <div className="cs-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow style={{ backgroundColor: brand }}>
              <TableHead className="text-white">Name</TableHead>
              <TableHead className="text-white">Email</TableHead>
              <TableHead className="text-white">Role</TableHead>
              <TableHead className="text-white">Class teacher of</TableHead>
              <TableHead className="text-white">Assigned classes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersList.map((u, i) => (
              <TableRow key={u.id} className={i % 2 ? "bg-slate-50" : ""} data-testid={`dr-user-row-${u.id}`}>
                <TableCell className="font-semibold">{u.name || "—"}</TableCell>
                <TableCell className="text-xs">{u.email}</TableCell>
                <TableCell><Badge className="cs-bg-navy text-white">{u.role}</Badge></TableCell>
                <TableCell className="text-xs">{u.is_class_teacher ? (u.assigned_classes?.[0] || "Yes") : "—"}</TableCell>
                <TableCell className="text-xs">{(u.assigned_classes || []).join(", ") || "—"}</TableCell>
              </TableRow>
            ))}
            {!usersLoading && !usersList.length && (
              <TableRow><TableCell colSpan={5} className="text-center text-slate-500 py-8">No teachers registered yet.</TableCell></TableRow>
            )}
            {usersLoading && (
              <TableRow><TableCell colSpan={5} className="text-center text-slate-500 py-8">Loading…</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  // ─── Subscription tab — read-only tier cards ───
  const SubscriptionTab = () => (
    <div data-testid="dr-subscription-tab">
      <div className="mb-4">
        <h2 className="font-display font-bold cs-text-navy text-2xl">Subscription</h2>
        <p className="text-sm text-slate-500 mt-1">
          You are currently on the <span className="font-semibold cs-text-navy">{DR_PRICING[school.subscription_tier]?.name || school.subscription_tier}</span> plan.
          To upgrade, WhatsApp <a href="https://wa.me/2348141880550" target="_blank" rel="noreferrer" className="cs-text-blue font-semibold hover:underline">+234 814 188 0550</a>.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {Object.entries(DR_PRICING).map(([k, t]) => {
          const isCurrent = school.subscription_tier === k;
          const price = t.full_session ?? null;
          const featured = k === "unified_enterprise";
          return (
            <div
              key={k}
              className={`cs-card p-6 flex flex-col ${featured ? "tier-featured" : ""} ${isCurrent ? "ring-2 ring-emerald-500" : ""}`}
              data-testid={`dr-subscribe-card-${k}`}
            >
              <h3 className="font-display font-bold cs-text-navy text-lg">{t.name}</h3>
              {featured && <span className="inline-block mt-1 text-[10px] uppercase tracking-wider font-bold cs-text-green">★ Most popular</span>}
              {isCurrent && <span className="inline-block mt-1 text-[10px] uppercase tracking-wider font-bold text-emerald-700">★ Current plan</span>}
              {t.blurb && <p className="text-xs text-slate-500 mt-2 leading-relaxed">{t.blurb}</p>}
              <div className="mt-4">
                {price ? (
                  <>
                    <div className="font-display text-3xl font-extrabold cs-text-navy">₦{price.toLocaleString()}</div>
                    <div className="text-[11px] text-slate-500 uppercase tracking-wider mt-1">per school · Full Session</div>
                  </>
                ) : (
                  <div className="text-sm text-slate-400 italic">Custom pricing</div>
                )}
              </div>
              {Array.isArray(t.features) && (
                <ul className="mt-4 space-y-1.5" data-testid={`dr-subscribe-features-${k}`}>
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-slate-700">
                      <CheckCircle2 size={13} className="cs-text-green flex-shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}
              <a
                href={`https://wa.me/2348141880550?text=${encodeURIComponent(`Hello Corner Streams — ${school.name} would like to upgrade to ${t.name}.`)}`}
                target="_blank"
                rel="noreferrer"
                className={`mt-5 inline-flex items-center justify-center rounded-full text-[11px] sm:text-xs font-semibold whitespace-nowrap px-2.5 sm:px-3 py-1.5 leading-tight ${isCurrent ? "bg-slate-200 text-slate-500 cursor-not-allowed pointer-events-none" : "cs-bg-green text-white hover:opacity-90"}`}
                data-testid={`dr-subscribe-btn-${k}`}
                onClick={(e) => { if (isCurrent) e.preventDefault(); }}
              >
                {isCurrent ? "Current plan" : <>Upgrade via WhatsApp <ArrowRight size={12} className="ml-1" /></>}
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );

  const panes = { overview: <Overview />, students: <StudentsTab />, users: <UsersTab />, classes: <ClassesTab />, subjects: <SubjectsTab />, scores: <ScoresTab />, reports: <ReportsTab />, subscription: <SubscriptionTab />, profile: <ProfileTab /> };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#fdfdf8" }}>
      <Navbar variant="dashboard" />
      <Sidebar />
      {locked && <LockedOverlay school={school} onUnlocked={refresh} />}
      <main className="ml-16 sm:ml-56 pt-14 p-4 sm:p-8" data-testid="dr-dashboard">
        {panes[tab]}
      </main>

      {/* New student dialog */}
      <Dialog open={studentDlg} onOpenChange={setStudentDlg}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add student</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Full name" value={newStudent.name} onChange={(e)=>setNewStudent({...newStudent, name:e.target.value})} />
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" placeholder="Age" value={newStudent.age} onChange={(e)=>setNewStudent({...newStudent, age:Number(e.target.value)})} />
              <Select value={newStudent.gender} onValueChange={(v)=>setNewStudent({...newStudent, gender:v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem></SelectContent>
              </Select>
            </div>
            <Select value={newStudent.class_name} onValueChange={(v)=>setNewStudent({...newStudent, class_name:v})}>
              <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
              <SelectContent>{classes.map((c)=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Parent email (optional)" value={newStudent.parent_email} onChange={(e)=>setNewStudent({...newStudent, parent_email:e.target.value})} />
            <Input type="number" placeholder="Balance due (₦)" value={newStudent.balance_due} onChange={(e)=>setNewStudent({...newStudent, balance_due:Number(e.target.value)})} />
          </div>
          <DialogFooter><Button onClick={addStudent} className="cs-bg-green text-white">Save student</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subjects dialog */}
      <Dialog open={subjDlg} onOpenChange={setSubjDlg}>
        <DialogContent>
          <DialogHeader><DialogTitle>Subjects for class</DialogTitle></DialogHeader>
          <Select value={subjForm.class_name} onValueChange={(v)=>setSubjForm({...subjForm, class_name:v})}>
            <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
            <SelectContent>{classes.map((c)=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <textarea className="w-full h-48 mt-3 p-2 border rounded text-sm font-mono" placeholder="One subject per line&#10;Mathematics&#10;English Language&#10;..." value={subjForm.subjectsText} onChange={(e)=>setSubjForm({...subjForm, subjectsText:e.target.value})} />
          <DialogFooter><Button onClick={saveSubjects} className="cs-bg-green text-white">Save subjects</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CBT upsell modal */}
      <Dialog open={cbtModalOpen} onOpenChange={setCbtModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Computer-Based Test (CBT)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">CBT exams are part of the <b>CBT Essentials</b> tier — separate from your current <b>Digital Reports</b> subscription.</p>
            <div className="p-3 rounded border-l-4 cs-text-navy text-sm" style={{ borderLeftColor: brand, backgroundColor: `${brand}10` }}>
              CBT Essentials includes:
              <ul className="mt-2 list-disc list-inside text-xs">
                <li>Build and publish timed MCQ exams</li>
                <li>Auto-graded results that feed into the Exam column</li>
                <li>Question palette + per-student attempt review</li>
              </ul>
            </div>
            <p className="text-xs text-slate-500">To activate, WhatsApp <b>+234 814 188 0550</b> with your school name and request a CBT Essentials upgrade.</p>
          </div>
          <DialogFooter>
            <a href={`https://wa.me/2348141880550?text=${encodeURIComponent(`Hello Corner Streams — ${school.name} would like to add CBT Essentials to our Digital Reports plan.`)}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-full text-white font-semibold h-10 px-5" style={{ backgroundColor: "#25D366" }}>Open WhatsApp</a>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
