import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth.jsx";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import StarRating from "@/components/StarRating.jsx";
import {
  Save, Plus, Trash2, Eye, Image as ImageIcon, X as XIcon, FileSpreadsheet, Users,
  Menu, ChevronRight, LogOut, BadgeCheck, LayoutDashboard, ClipboardList, FileBarChart,
  BookOpen, GraduationCap, Lock, User, Upload, Download,
} from "lucide-react";
import BulkUploadDialog from "@/components/BulkUploadDialog.jsx";
import * as XLSX from "xlsx";

const SKILLS = ["Punctuality", "Attentiveness", "Neatness", "Honesty", "Sportsmanship", "Leadership"];
const TERMS = ["1st Term", "2nd Term", "3rd Term"];

export default function TeacherDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [students, setStudents] = useState([]);
  const [classFilter, setClassFilter] = useState("");
  const [term, setTerm] = useState("1st Term");
  const [year, setYear] = useState("2025/2026");
  const [selected, setSelected] = useState(null);
  const [scoreMap, setScoreMap] = useState({});
  const [skillMap, setSkillMap] = useState({});
  const [saving, setSaving] = useState(false);
  const [classSubjects, setClassSubjects] = useState({});
  const [school, setSchool] = useState(null);

  // CBT
  const [exams, setExams] = useState([]);
  const [examDlg, setExamDlg] = useState(false);
  const [examForm, setExamForm] = useState(_emptyExam());
  const [editingId, setEditingId] = useState(null);
  const [attemptsDlg, setAttemptsDlg] = useState(null);
  const [parentBulkOpen, setParentBulkOpen] = useState(false);

  // Shell
  const [tab, setTab] = useState("overview");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = async () => {
    try { await logout(); } catch { /* noop */ }
    navigate("/");
  };

  const myClasses = useMemo(() => {
    const list = [];
    if (user?.assigned_classes && user.assigned_classes.length) list.push(...user.assigned_classes);
    else if (user?.assigned_class) list.push(user.assigned_class);
    return Array.from(new Set(list));
  }, [user]);

  // Class-teacher gating: explicit flag OR legacy (has any assigned class)
  const isClassTeacher = useMemo(
    () => Boolean(user?.is_class_teacher) || myClasses.length > 0,
    [user, myClasses]
  );

  // ─── Subscription gating (Prompt 5a) ───
  // Frontend-derived from school.subscription_tier. unified_enabled is the
  // master bypass — when true, every panel is unlocked.
  const subscriptionFlags = useMemo(() => {
    const tier = school?.subscription_tier || "";
    return {
      results_enabled: tier === "digital_reports",
      financials_enabled: tier === "financial_ledger", // tracked but not consumed on TeacherDashboard
      cbt_enabled: tier === "cbt_essentials",
      unified_enabled: tier === "unified_enterprise",
    };
  }, [school]);
  const canSeeScores = subscriptionFlags.unified_enabled || subscriptionFlags.results_enabled;
  const canSeeCBT = subscriptionFlags.unified_enabled || subscriptionFlags.cbt_enabled;
  const canSeeClassReports = (subscriptionFlags.unified_enabled || subscriptionFlags.results_enabled) && isClassTeacher;

  // Subjects assigned to this teacher by the admin (flat list — same chips render in every class row)
  const mySubjects = useMemo(() => {
    const arr = Array.isArray(user?.assigned_subjects) ? user.assigned_subjects : [];
    return Array.from(new Set(arr.map((s) => (s || "").trim()).filter(Boolean)));
  }, [user]);

  // Bulk score-sheet upload state (Profile & Assignments tab)
  const [bulkClass, setBulkClass] = useState("");
  const [bulkTerm, setBulkTerm] = useState("1st Term");
  const [bulkYear, setBulkYear] = useState("2025/2026");
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkParsed, setBulkParsed] = useState(null); // { rows, count } | null
  const [bulkBusy, setBulkBusy] = useState(false);

  const allowTrueFalse = (school?.school_type === "primary" || school?.school_type === "mixed");

  function _emptyExam() {
    return {
      title: "", class_name: "", subject: "", term: "1st Term", year: "2025/2026",
      duration_min: 15,
      questions: [{ type: "mcq", question: "", options: ["", "", "", ""], correct_idx: 0, image_url: "" }],
    };
  }

  const refresh = async () => {
    try {
      const [stRes, exRes, sjRes, schRes] = await Promise.all([
        api.get("/students"),
        api.get("/cbt/exams"),
        api.get("/subjects"),
        api.get("/schools/me").catch(() => ({ data: { school: {} } })),
      ]);
      setStudents(stRes.data.students || []);
      setExams(exRes.data.exams || []);
      setSchool(schRes.data.school || null);
      const map = {};
      (sjRes.data.class_subjects || []).forEach((cs) => { map[cs.class_name] = cs.subjects; });
      setClassSubjects(map);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };
  useEffect(() => { refresh(); }, []);

  const classes = useMemo(() => Array.from(new Set(students.map((s) => s.class_name))).sort(), [students]);
  const filtered = useMemo(() => students.filter((s) => !classFilter || s.class_name === classFilter), [students, classFilter]);
  const subjectsForSelected = useMemo(() => {
    if (!selected) return [];
    return classSubjects[selected.class_name] || [];
  }, [selected, classSubjects]);

  // KPIs for overview
  const myClassStudents = useMemo(
    () => students.filter((s) => myClasses.includes(s.class_name)),
    [students, myClasses]
  );
  const publishedExams = useMemo(() => exams.filter((e) => e.published).length, [exams]);

  // Assessment structure from the school's profile config
  const caWeights = useMemo(() => {
    const w = school?.ca_weights;
    if (Array.isArray(w) && w.length > 0) return w.map((n) => Number(n) || 0);
    // Legacy fallback when school doc pre-dates per-column model
    return [Number(school?.ca_max ?? 40) || 0];
  }, [school]);
  const examMaxCfg = useMemo(() => Number(school?.exam_max ?? 60) || 0, [school]);
  const totalMax = useMemo(() => caWeights.reduce((a, b) => a + b, 0) + examMaxCfg, [caWeights, examMaxCfg]);

  const loadStudentScores = async (st) => {
    setSelected(st);
    try {
      const { data } = await api.get(`/scores`, { params: { student_id: st.id, term } });
      const sm = {};
      (data.scores || []).forEach((s) => {
        // Hydrate per-column array; fall back to legacy aggregated ca_score in the first slot
        let cas;
        if (Array.isArray(s.ca_scores) && s.ca_scores.length === caWeights.length) {
          cas = s.ca_scores.map((n) => Number(n) || 0);
        } else {
          cas = caWeights.map((_, i) => (i === 0 ? Number(s.ca_score) || 0 : 0));
          // Clamp first slot into its weight cap so the UI doesn't render an invalid value
          if (cas[0] > caWeights[0]) cas[0] = caWeights[0];
        }
        sm[s.subject] = { ca_scores: cas, exam: Number(s.exam_score) || 0 };
      });
      const km = {};
      (data.skill_ratings || []).forEach((s) => { km[s.skill_name] = s.rating; });
      setScoreMap(sm);
      setSkillMap(km);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  useEffect(() => { if (selected) loadStudentScores(selected); }, [term]); // eslint-disable-line

  const saveAll = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const items = subjectsForSelected.filter((s) => scoreMap[s]).map((s) => {
        const row = scoreMap[s];
        const cas = Array.isArray(row.ca_scores) ? row.ca_scores.map((n) => Number(n) || 0) : caWeights.map(() => 0);
        return {
          student_id: selected.id, term, year, subject: s,
          ca_scores: cas,
          ca_score: cas.reduce((a, b) => a + b, 0),
          exam_score: Number(row.exam || 0),
        };
      });
      if (items.length) await api.post("/scores/batch", { items });
      for (const skill of SKILLS) {
        if (skillMap[skill]) {
          await api.post("/scores/skills", { student_id: selected.id, term, year, skill_name: skill, rating: skillMap[skill] });
        }
      }
      toast.success("Saved");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  // CBT helpers
  const openCreateExam = () => { setEditingId(null); setExamForm(_emptyExam()); setExamDlg(true); };
  const openEditExam = (e) => {
    setEditingId(e.id);
    setExamForm({
      title: e.title, class_name: e.class_name, subject: e.subject,
      term: e.term, year: e.year, duration_min: e.duration_min,
      questions: e.questions.map((q) => ({
        type: q.type || "mcq",
        question: q.question,
        options: [...(q.options || (q.type === "true_false" ? ["True", "False"] : ["", "", "", ""]))],
        correct_idx: q.correct_idx,
        image_url: q.image_url || "",
      })),
    });
    setExamDlg(true);
  };
  const updateQuestion = (qi, patch) => {
    const next = [...examForm.questions];
    next[qi] = { ...next[qi], ...patch };
    setExamForm({ ...examForm, questions: next });
  };
  const updateOption = (qi, oi, val) => {
    const next = [...examForm.questions];
    next[qi].options = [...next[qi].options];
    next[qi].options[oi] = val;
    setExamForm({ ...examForm, questions: next });
  };
  const addOption = (qi) => {
    const next = [...examForm.questions];
    if ((next[qi].options || []).length >= 6) { toast.error("Max 6 options"); return; }
    next[qi].options = [...(next[qi].options || []), ""];
    setExamForm({ ...examForm, questions: next });
  };
  const removeOption = (qi, oi) => {
    const next = [...examForm.questions];
    const opts = [...(next[qi].options || [])];
    if (opts.length <= 2) { toast.error("Minimum 2 options"); return; }
    opts.splice(oi, 1);
    next[qi].options = opts;
    if (next[qi].correct_idx === oi) next[qi].correct_idx = 0;
    else if (next[qi].correct_idx > oi) next[qi].correct_idx = next[qi].correct_idx - 1;
    setExamForm({ ...examForm, questions: next });
  };
  const setQuestionType = (qi, newType) => {
    const next = [...examForm.questions];
    if (newType === "true_false") {
      next[qi] = { ...next[qi], type: "true_false", options: ["True", "False"], correct_idx: next[qi].correct_idx > 1 ? 0 : next[qi].correct_idx };
    } else {
      next[qi] = { ...next[qi], type: "mcq", options: ["", "", "", ""], correct_idx: 0 };
    }
    setExamForm({ ...examForm, questions: next });
  };
  const uploadQuestionImage = (qi, file) => {
    if (!file) return;
    if (file.size > 800 * 1024) { toast.error("Image must be under 800KB"); return; }
    const reader = new FileReader();
    reader.onload = () => updateQuestion(qi, { image_url: reader.result });
    reader.readAsDataURL(file);
  };
  const addQuestion = () => setExamForm({ ...examForm, questions: [...examForm.questions, { type: "mcq", question: "", options: ["", "", "", ""], correct_idx: 0, image_url: "" }] });
  const removeQuestion = (qi) => setExamForm({ ...examForm, questions: examForm.questions.filter((_, i) => i !== qi) });

  const submitExam = async () => {
    if (!examForm.title.trim() || !examForm.class_name || !examForm.subject) {
      toast.error("Title, class, and subject are required");
      return;
    }
    if (!examForm.questions.length) { toast.error("Add at least one question"); return; }
    for (let i = 0; i < examForm.questions.length; i++) {
      const q = examForm.questions[i];
      if (!q.question.trim()) { toast.error(`Question ${i + 1}: question text required`); return; }
      if (q.type === "mcq" && q.options.some((o) => !o.trim())) {
        toast.error(`Question ${i + 1}: fill all options`);
        return;
      }
    }
    try {
      if (editingId) {
        await api.put(`/cbt/exams/${editingId}`, examForm);
        toast.success("Exam updated");
      } else {
        await api.post(`/cbt/exams`, examForm);
        toast.success("Exam created");
      }
      setExamDlg(false);
      refresh();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const togglePublish = async (e) => {
    try {
      const { data } = await api.put(`/cbt/exams/${e.id}`, { published: !e.published });
      const newStatus = data?.exam?.status;
      const msg = newStatus === "pending_review" ? "Submitted for review"
        : newStatus === "published" ? "Published"
        : "Moved to draft";
      toast.success(msg);
      refresh();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail) || err.message); }
  };

  const deleteExam = async (id) => {
    if (!window.confirm("Delete this exam and all attempts?")) return;
    try { await api.delete(`/cbt/exams/${id}`); refresh(); toast.success("Deleted"); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail) || err.message); }
  };

  // ─── Bulk score-sheet handlers (5b layout — wires to existing /scores/batch) ───
  // Builds Excel headers with dynamic CA columns sourced from school.ca_weights
  // and a computed Total Score formula = SUM(CA cols) + Exam.
  const downloadBulkTemplate = () => {
    const cls = bulkClass || (myClasses[0] || "JSS 1");
    const subjs = mySubjects.length ? mySubjects : ["Subject A"];
    const roster = students.filter((s) => s.class_name === cls);
    const caCount = caWeights.length;

    // Header row — dynamic CA columns
    const caHeaders = caWeights.map((w, i) => `CA ${i + 1} (max ${w})`);
    const header = [
      "student_id", "student_name", "class_name", "subject", "term", "year",
      ...caHeaders, `Exam (max ${examMaxCfg})`, "Total Score",
    ];

    // Data rows — empty score cells; Total uses a SUM formula referencing CA cols + Exam
    // Cell A=student_id ... F=year. CA cols start at column G (index 6).
    const aoa = [header];
    const dataRows = roster.length ? roster : [{ id: "<student_id>", name: "<student name>" }];
    let rowIdx = 2; // first data row in spreadsheet (1-based after header)
    dataRows.forEach((st) => {
      subjs.forEach((subj) => {
        const caStartCol = 6; // 0-based index of first CA column
        const caEndCol = caStartCol + caCount - 1;
        const examCol = caEndCol + 1;
        const caStartLetter = XLSX.utils.encode_col(caStartCol);
        const caEndLetter = XLSX.utils.encode_col(caEndCol);
        const examLetter = XLSX.utils.encode_col(examCol);
        const totalFormula = { f: `SUM(${caStartLetter}${rowIdx}:${caEndLetter}${rowIdx})+${examLetter}${rowIdx}` };
        const row = [
          st.id, st.name, cls, subj, bulkTerm, bulkYear,
          ...caWeights.map(() => ""),
          "",
          totalFormula,
        ];
        aoa.push(row);
        rowIdx += 1;
      });
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Column widths for readability
    ws["!cols"] = [
      { wch: 38 }, { wch: 22 }, { wch: 12 }, { wch: 22 }, { wch: 10 }, { wch: 12 },
      ...caWeights.map(() => ({ wch: 12 })), { wch: 12 }, { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Scores");
    XLSX.writeFile(wb, `score-sheet-${cls.replace(/\s+/g, "_")}-${bulkTerm.replace(/\s+/g, "_")}.xlsx`);
    toast.success(`Template downloaded · ${caCount} CA column${caCount === 1 ? "" : "s"} + Exam + Total`);
  };

  const onBulkFile = async (file) => {
    if (!file) return;
    setBulkFile(file);
    setBulkParsed(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      setBulkParsed({ rows, count: rows.length });
    } catch (e) {
      toast.error(`Could not read file: ${e.message}`);
      setBulkFile(null);
    }
  };

  // Reads "CA 1", "CA 2", ... "CA N" columns losslessly into ca_scores[] and
  // sends BOTH ca_scores (lossless) AND ca_score (sum) so the backend can
  // validate per-column caps while staying backward-compatible.
  const submitBulkScores = async () => {
    if (!bulkParsed || !bulkParsed.rows.length) { toast.error("No rows to upload"); return; }
    setBulkBusy(true);
    try {
      const caCount = caWeights.length;
      const items = bulkParsed.rows
        .filter((r) => r.student_id && r.subject)
        .map((r) => {
          // Tolerate "CA 1", "CA 1 (max 5)", "CA1", "ca_1" header variants
          const findCaValue = (idx) => {
            const want = idx + 1;
            for (const key of Object.keys(r)) {
              const m = String(key).match(/CA\s*0*(\d+)/i);
              if (m && Number(m[1]) === want) return r[key];
            }
            return "";
          };
          const findExamValue = () => {
            for (const key of Object.keys(r)) {
              if (/^exam\b/i.test(String(key).trim())) return r[key];
            }
            return r.exam_score ?? r.Exam ?? "";
          };
          const ca_scores = Array.from({ length: caCount }, (_, i) => {
            const v = findCaValue(i);
            const n = Number(v);
            return Number.isFinite(n) ? n : 0;
          });
          const exam_score = Number(findExamValue()) || 0;
          return {
            student_id: String(r.student_id).trim(),
            term: String(r.term || bulkTerm).trim(),
            year: String(r.year || bulkYear).trim(),
            subject: String(r.subject).trim(),
            ca_scores,
            ca_score: ca_scores.reduce((a, b) => a + b, 0),
            exam_score,
          };
        });
      if (!items.length) { toast.error("No valid rows (need student_id + subject)"); return; }
      const { data } = await api.post("/scores/batch", { items });
      toast.success(`Uploaded ${(data?.saved || []).length} of ${items.length} rows`);
      setBulkFile(null);
      setBulkParsed(null);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setBulkBusy(false);
    }
  };

  // ------- Sidebar nav -------
  const NAV = [
    { k: "overview", l: "Overview", I: LayoutDashboard, locked: false },
    { k: "scores", l: "Scores Panel", I: ClipboardList, locked: !canSeeScores },
    { k: "cbt", l: "CBT Results", I: FileBarChart, locked: !canSeeCBT },
    ...(isClassTeacher ? [{ k: "reports", l: "My Class Reports", I: GraduationCap, locked: !canSeeClassReports }] : []),
    { k: "profile", l: "Profile & Assignments", I: User, locked: false },
  ];
  const currentLabel = NAV.find((n) => n.k === tab)?.l || "Dashboard";

  const SidebarContent = ({ onClickItem }) => (
    <div className="h-full flex flex-col cs-bg-navy text-white">
      <div className="p-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-md bg-white/10 flex items-center justify-center"><BadgeCheck size={18} /></div>
          <div className="hidden lg:block leading-tight">
            <div className="text-[10px] tracking-wider text-white/60 uppercase">Teacher</div>
            <div className="text-xs font-semibold truncate max-w-[140px]">{user?.name || "—"}</div>
          </div>
        </div>
        {drawerOpen && (
          <button className="sm:hidden p-1.5 rounded text-white/80 hover:bg-white/10" onClick={() => setDrawerOpen(false)} aria-label="Close sidebar"><XIcon size={16} /></button>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {NAV.map((n) => {
          const Icon = n.I;
          const active = tab === n.k;
          return (
            <button
              key={n.k}
              onClick={() => { onClickItem(n.k); setDrawerOpen(false); }}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs transition-all duration-200 ${active ? "bg-white text-[#002147] shadow-sm font-semibold" : "text-white/85 hover:bg-white/10"}`}
              data-testid={`teacher-nav-${n.k}`}
              title={n.locked ? "Locked — ask your School Admin to upgrade" : n.l}
            >
              <Icon size={15} className="flex-shrink-0" />
              <span className="hidden lg:inline truncate flex-1 text-left">{n.l}</span>
              {n.locked && <Lock size={11} className={`flex-shrink-0 ${active ? "text-slate-500" : "text-white/55"}`} data-testid={`teacher-nav-${n.k}-lock`} />}
              {active && !n.locked && <ChevronRight size={12} className="hidden lg:inline" />}
            </button>
          );
        })}
        <div className="border-t border-white/10 my-2" />
        <Button onClick={handleLogout} className="w-full bg-red-500/15 hover:bg-red-500/30 text-white rounded-md text-xs h-9 justify-start gap-2 transition-all duration-200 px-2.5" data-testid="teacher-sidebar-logout">
          <LogOut size={14} className="flex-shrink-0" /> <span className="hidden lg:inline">Logout</span>
        </Button>
      </nav>
    </div>
  );

  if (!user) {
    return (
      <div className="min-h-screen">
        <Navbar variant="dashboard" />
        <div className="p-10 text-slate-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar variant="dashboard" />

      {/* Pinned sidebar (desktop) */}
      <aside className="hidden sm:flex flex-col fixed left-0 top-14 bottom-0 z-30 w-16 lg:w-64 xl:w-72 border-r shadow-sm transition-all duration-300" data-testid="teacher-sidebar-desktop">
        <SidebarContent onClickItem={(k) => setTab(k)} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="sm:hidden fixed inset-0 z-40" data-testid="teacher-drawer">
          <div className="absolute inset-0 bg-slate-900/60 transition-opacity duration-300" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 shadow-xl transition-transform duration-300">
            <SidebarContent onClickItem={(k) => setTab(k)} />
          </aside>
        </div>
      )}

      <main className="sm:ml-16 lg:ml-64 xl:ml-72 pt-[120px] transition-all duration-300" data-testid="teacher-dashboard">
        {/* Fixed in-page header */}
        <div className="fixed top-14 left-0 sm:left-16 lg:left-64 xl:left-72 right-0 z-20 bg-slate-50 border-b border-slate-200 px-4 sm:px-6 lg:px-10 xl:px-12 py-3 transition-all duration-300">
          <div className="max-w-[1800px] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button className="sm:hidden p-2 rounded-md border border-slate-200 bg-white" onClick={() => setDrawerOpen(true)} data-testid="teacher-hamburger"><Menu size={18} /></button>
              <div className="min-w-0">
                <span className="eyebrow">TEACHER PORTAL</span>
                <h1 className="font-display text-xl sm:text-2xl font-bold cs-text-navy mt-0.5 truncate" data-testid="teacher-title">
                  {user?.name} · {currentLabel}
                </h1>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-3 cs-card px-4 py-2 shrink-0" data-testid="teacher-header-user">
              <div className="w-9 h-9 rounded-full cs-bg-navy text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                {(user?.name || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}
              </div>
              <div className="text-right leading-tight">
                <div className="text-sm font-semibold cs-text-navy truncate max-w-[200px]" data-testid="teacher-header-name">{user?.name}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500" data-testid="teacher-header-role">
                  Teacher{isClassTeacher ? " · Class teacher" : ""}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 lg:px-10 xl:px-12 py-6 max-w-[1800px]">
          {/* Status chip row */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <Badge className="cs-bg-green text-white">Active</Badge>
            <div className="text-xs cs-card px-3 py-1.5 flex items-center gap-2">
              <span className="font-semibold cs-text-navy">{school?.name || "—"}</span>
              {myClasses.length > 0 && <>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">{myClasses.length === 1 ? "Class" : "Classes"}: <strong className="cs-text-navy">{myClasses.join(", ")}</strong></span>
              </>}
            </div>
            <div className="text-xs text-slate-500 truncate">{term} · {year}</div>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="hidden">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="scores">Scores</TabsTrigger>
              <TabsTrigger value="cbt">CBT</TabsTrigger>
              {isClassTeacher && <TabsTrigger value="reports">Reports</TabsTrigger>}
              <TabsTrigger value="profile">Profile</TabsTrigger>
            </TabsList>

            {/* ---------------- OVERVIEW ---------------- */}
            <TabsContent value="overview" className="cs-pane-fade">
              {/* KPI tiles */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[
                  { i: Users, l: "My class students", v: myClassStudents.length, c: "cs-bg-navy" },
                  { i: BookOpen, l: "Assigned classes", v: myClasses.length, c: "cs-bg-blue" },
                  { i: FileBarChart, l: "Exams created", v: exams.length, c: "cs-bg-green" },
                  { i: GraduationCap, l: "Published exams", v: publishedExams, c: "bg-amber-500" },
                ].map((s, i) => {
                  const Icon = s.i;
                  return (
                    <div key={i} className="cs-card p-5 flex items-center gap-4" data-testid={`teacher-stat-${i}`}>
                      <div className={`w-11 h-11 rounded-lg ${s.c} text-white flex items-center justify-center`}><Icon size={20} /></div>
                      <div>
                        <div className="text-xs text-slate-500">{s.l}</div>
                        <div className="font-display text-2xl font-bold cs-text-navy">{s.v}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Quick actions */}
                <div className="cs-card p-6" data-testid="teacher-quick-actions">
                  <h3 className="font-display font-semibold cs-text-navy text-lg">Quick actions</h3>
                  <p className="text-sm text-slate-500 mt-1">Jump straight to the work you do most.</p>
                  <div className="mt-4 space-y-2">
                    <Button onClick={() => setTab("scores")} className="w-full justify-start cs-bg-navy text-white hover:opacity-90" data-testid="qa-open-scores">
                      <ClipboardList size={16} className="mr-2" /> Enter scores & skill ratings
                    </Button>
                    <Button onClick={() => { setTab("cbt"); openCreateExam(); }} className="w-full justify-start cs-bg-green text-white hover:opacity-90" data-testid="qa-new-exam">
                      <Plus size={16} className="mr-2" /> Create a CBT exam
                    </Button>
                    <Button onClick={() => setTab("cbt")} variant="outline" className="w-full justify-start" data-testid="qa-view-exams">
                      <Eye size={16} className="mr-2" /> View CBT results & attempts
                    </Button>
                  </div>
                </div>

                {/* Parents bulk upload — class teacher only */}
                <div className="cs-card p-6" data-testid="teacher-parents-card">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-lg cs-bg-blue text-white flex items-center justify-center shrink-0"><Users size={20} /></div>
                    <div className="flex-1">
                      <h3 className="font-display font-semibold cs-text-navy text-lg">
                        Bulk upload parents{myClasses.length > 0 ? ` for ${myClasses.length === 1 ? "your class" : "your classes"}` : ""}
                      </h3>
                      <p className="text-sm text-slate-500 mt-1">
                        {isClassTeacher
                          ? <>Class teacher: <strong className="cs-text-navy">{user?.name}</strong>{myClasses.length > 0 && <> · <strong className="cs-text-navy">{myClasses.join(", ")}</strong></>}</>
                          : <>This feature is available to class teachers only.</>}
                      </p>
                    </div>
                  </div>
                  {isClassTeacher && (
                    <>
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 mt-4">
                        <div className="font-medium mb-1">How this works</div>
                        <ul className="list-disc ml-5 space-y-0.5">
                          <li>Download the parents template, fill parent name + email + students' names and class.</li>
                          <li>Upload — the system creates parent login accounts.</li>
                          <li>Only the school admin can see the generated passwords.</li>
                          <li>Rows pointing to students not on your roster are skipped.</li>
                        </ul>
                      </div>
                      <Button
                        onClick={() => setParentBulkOpen(true)}
                        className="cs-bg-green text-white hover:opacity-90 btn-anim mt-4"
                        data-testid="teacher-bulk-parents-btn"
                        disabled={myClasses.length === 0}
                      >
                        <FileSpreadsheet size={16} className="mr-2" /> Upload parents for {myClasses.length === 1 ? myClasses[0] : "my class"}
                      </Button>
                      {myClasses.length === 0 && (
                        <p className="text-xs text-amber-700 mt-2">You don't have any assigned classes yet — ask your school admin to assign one.</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ---------------- SCORES PANEL ---------------- */}
            <TabsContent value="scores" className="cs-pane-fade">
              {!canSeeScores ? (
                <LockedModuleCard moduleKey="scores" moduleName="Scores Panel" />
              ) : (
              <>
              <div className="cs-card p-5 grid sm:grid-cols-3 gap-4">
                <div>
                  <Label>Class</Label>
                  <Select value={classFilter} onValueChange={(v) => setClassFilter(v === "__all__" ? "" : v)}>
                    <SelectTrigger data-testid="class-filter"><SelectValue placeholder="All classes" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All</SelectItem>
                      {classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Term</Label>
                  <Select value={term} onValueChange={setTerm}>
                    <SelectTrigger data-testid="term-select"><SelectValue /></SelectTrigger>
                    <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Academic year</Label>
                  <Input value={year} onChange={(e) => setYear(e.target.value)} data-testid="year-input" />
                </div>
              </div>

              <div className="mt-6 grid lg:grid-cols-[320px_1fr] gap-6">
                <div className="cs-card p-2 max-h-[600px] overflow-auto">
                  <h3 className="px-3 py-2 font-semibold cs-text-navy text-sm">Roster ({filtered.length})</h3>
                  <div className="divide-y">
                    {filtered.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => loadStudentScores(s)}
                        className={`w-full text-left px-3 py-3 hover:bg-slate-50 transition ${selected?.id === s.id ? "bg-slate-50" : ""}`}
                        data-testid={`roster-${s.id}`}
                      >
                        <div className="font-medium cs-text-navy text-sm">{s.name}</div>
                        <div className="text-xs text-slate-500">{s.class_name} · {s.gender}</div>
                      </button>
                    ))}
                    {!filtered.length && <div className="p-6 text-sm text-slate-500">No students.</div>}
                  </div>
                </div>

                <div className="cs-card p-6">
                  {!selected ? (
                    <div className="text-slate-500 text-sm">Select a student to enter scores.</div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-display font-bold text-xl cs-text-navy">{selected.name}</h3>
                          <div className="text-xs text-slate-500">{selected.class_name} · {term} · {year}</div>
                        </div>
                        <Button onClick={saveAll} disabled={saving} className="cs-bg-green text-white rounded-full hover:opacity-90" data-testid="save-scores"><Save size={16} className="mr-1" /> {saving ? "Saving…" : "Save"}</Button>
                      </div>

                      <Tabs defaultValue="academic" className="mt-6">
                        <TabsList>
                          <TabsTrigger value="academic">Academic scores</TabsTrigger>
                          <TabsTrigger value="skills">Skill ratings</TabsTrigger>
                        </TabsList>
                        <TabsContent value="academic" className="mt-4">
                          {subjectsForSelected.length === 0 && (
                            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 mb-3">No subjects assigned to {selected.class_name}. Ask the school admin to add subjects in their dashboard.</div>
                          )}
                          <div className="text-xs text-slate-500 mb-2" data-testid="ca-structure-summary">
                            Assessment structure: <strong className="cs-text-navy">{caWeights.map((w, i) => `CA${i + 1}/${w}`).join(" · ")} · Exam/{examMaxCfg}</strong> · Total <strong className="cs-text-navy">{totalMax}</strong>
                          </div>
                          <div className="overflow-x-auto rounded-lg border">
                            <Table>
                              <TableHeader>
                                <TableRow className="cs-bg-navy hover:cs-bg-navy">
                                  <TableHead className="text-white">Subject</TableHead>
                                  {caWeights.map((w, i) => (
                                    <TableHead key={i} className="text-white w-24">CA{i + 1} ({w})</TableHead>
                                  ))}
                                  <TableHead className="text-white w-24">Exam ({examMaxCfg})</TableHead>
                                  <TableHead className="text-white w-24">Total</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {subjectsForSelected.map((s) => {
                                  const v = scoreMap[s] || { ca_scores: caWeights.map(() => ""), exam: "" };
                                  const cas = Array.isArray(v.ca_scores) ? v.ca_scores : caWeights.map(() => "");
                                  const caTotal = cas.reduce((a, b) => a + (Number(b) || 0), 0);
                                  const total = caTotal + (Number(v.exam) || 0);
                                  const setCaAt = (idx, raw) => {
                                    const next = [...cas];
                                    next[idx] = raw;
                                    setScoreMap({ ...scoreMap, [s]: { ...v, ca_scores: next } });
                                  };
                                  return (
                                    <TableRow key={s}>
                                      <TableCell className="font-medium">{s}</TableCell>
                                      {caWeights.map((w, i) => {
                                        const val = cas[i];
                                        const numeric = Number(val);
                                        const over = val !== "" && val !== undefined && numeric > w;
                                        return (
                                          <TableCell key={i}>
                                            <Input
                                              type="number"
                                              min={0}
                                              max={w}
                                              value={val ?? ""}
                                              onChange={(e) => setCaAt(i, e.target.value)}
                                              className={over ? "border-red-400 focus-visible:ring-red-300" : ""}
                                              data-testid={`ca-${s}-${i}`}
                                            />
                                          </TableCell>
                                        );
                                      })}
                                      <TableCell>
                                        <Input
                                          type="number"
                                          min={0}
                                          max={examMaxCfg}
                                          value={v.exam ?? ""}
                                          onChange={(e) => setScoreMap({ ...scoreMap, [s]: { ...v, ca_scores: cas, exam: e.target.value } })}
                                          className={Number(v.exam) > examMaxCfg ? "border-red-400 focus-visible:ring-red-300" : ""}
                                          data-testid={`exam-${s}`}
                                        />
                                      </TableCell>
                                      <TableCell><span className="font-semibold cs-text-navy">{total}</span></TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </TabsContent>
                        <TabsContent value="skills" className="mt-4">
                          <div className="grid grid-cols-2 gap-4">
                            {SKILLS.map((sk) => (
                              <div key={sk} className="cs-card p-4 flex items-center justify-between" data-testid={`skill-${sk}`}>
                                <div className="text-sm font-medium cs-text-navy">{sk}</div>
                                <StarRating value={skillMap[sk] || 0} onChange={(v) => setSkillMap({ ...skillMap, [sk]: v })} />
                              </div>
                            ))}
                          </div>
                        </TabsContent>
                      </Tabs>
                    </>
                  )}
                </div>
              </div>
              </>
              )}
            </TabsContent>

            {/* ---------------- CBT RESULTS ---------------- */}
            <TabsContent value="cbt" className="cs-pane-fade">
              {!canSeeCBT ? (
                <LockedModuleCard moduleKey="cbt" moduleName="CBT Results" />
              ) : (
              <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-semibold cs-text-navy text-lg">CBT exam library</h3>
                <Button onClick={openCreateExam} className="cs-bg-green text-white hover:opacity-90 rounded-full" data-testid="cbt-new-exam"><Plus size={14} className="mr-1" /> New exam</Button>
              </div>
              <div className="cs-card overflow-hidden">
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="cs-bg-navy hover:cs-bg-navy">
                      <TableHead className="text-white">Title</TableHead>
                      <TableHead className="text-white">Class</TableHead>
                      <TableHead className="text-white">Subject</TableHead>
                      <TableHead className="text-white">Term</TableHead>
                      <TableHead className="text-white">Qs</TableHead>
                      <TableHead className="text-white">Min</TableHead>
                      <TableHead className="text-white">Status</TableHead>
                      <TableHead className="text-white">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exams.map((e, i) => {
                      const status = e.status || (e.published ? "published" : "draft");
                      const statusBadge = status === "published"
                        ? <Badge className="cs-bg-green text-white">Published</Badge>
                        : status === "pending_review"
                          ? <Badge className="bg-amber-500 text-white">Pending review</Badge>
                          : <Badge className="bg-slate-400 text-white">Draft</Badge>;
                      const submitLabel = status === "pending_review" ? "Withdraw" : status === "published" ? "Unpublish" : "Submit for review";
                      const submitClass = status === "pending_review" || status === "published" ? "bg-amber-500 text-white" : "cs-bg-blue text-white";
                      const submitAction = () => togglePublish({ ...e, published: status === "published" || status === "pending_review" });
                      return (
                      <TableRow key={e.id} className={i % 2 ? "bg-slate-50" : ""} data-testid={`exam-row-${e.id}`}>
                        <TableCell className="font-medium">{e.title}</TableCell>
                        <TableCell>{e.class_name}</TableCell>
                        <TableCell>{e.subject}</TableCell>
                        <TableCell>{e.term}</TableCell>
                        <TableCell>{e.questions?.length}</TableCell>
                        <TableCell>{e.duration_min}</TableCell>
                        <TableCell>{statusBadge}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => openEditExam(e)} data-testid={`exam-edit-${e.id}`}>Edit</Button>
                            <Button size="sm" className={submitClass} onClick={submitAction} data-testid={`exam-publish-${e.id}`}>{submitLabel}</Button>
                            <Button size="sm" variant="outline" onClick={() => setAttemptsDlg(e)} data-testid={`exam-attempts-${e.id}`}><Eye size={12} /></Button>
                            <Button size="sm" variant="destructive" onClick={() => deleteExam(e.id)} data-testid={`exam-delete-${e.id}`}><Trash2 size={12} /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                    {!exams.length && (<TableRow><TableCell colSpan={8} className="text-center text-slate-500 py-8">No exams. Click <strong>New exam</strong> to create one.</TableCell></TableRow>)}
                  </TableBody>
                </Table>
                </div>
              </div>
              </>
              )}
            </TabsContent>

            {/* ---------------- MY CLASS REPORTS (class teacher only) ---------------- */}
            {isClassTeacher && (
              <TabsContent value="reports" className="cs-pane-fade">
                {!canSeeClassReports ? (
                  <LockedModuleCard moduleKey="reports" moduleName="My Class Reports" />
                ) : (
                <div className="cs-card p-6" data-testid="teacher-reports-stub">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-11 h-11 rounded-lg cs-bg-navy text-white flex items-center justify-center shrink-0"><GraduationCap size={20} /></div>
                    <div>
                      <h3 className="font-display font-semibold cs-text-navy text-lg">My Class Reports</h3>
                      <p className="text-sm text-slate-500 mt-1">
                        Class teacher view{myClasses.length > 0 && <> · <strong className="cs-text-navy">{myClasses.join(", ")}</strong></>}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center">
                    <div className="text-sm font-semibold cs-text-navy">Broadsheet & class report cards — coming in Tier 2</div>
                    <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto">
                      This tab is reserved for class-teacher-only features: termly broadsheet, per-student report cards,
                      attendance summary and class teacher's comment workflow.
                    </p>
                  </div>
                </div>
                )}
              </TabsContent>
            )}

            {/* ---------------- PROFILE & ASSIGNMENTS (5b) ---------------- */}
            <TabsContent value="profile" className="cs-pane-fade">
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Card A — Identity + class/subject assignments grid */}
                <div className="cs-card p-6" data-testid="teacher-profile-card">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-full cs-bg-navy text-white flex items-center justify-center font-bold flex-shrink-0">
                      {(user?.name || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="eyebrow">TEACHER PROFILE</div>
                      <h3 className="font-display font-bold text-xl cs-text-navy truncate" data-testid="teacher-profile-name">{user?.name || "—"}</h3>
                      <div className="text-xs text-slate-500 truncate" data-testid="teacher-profile-email">{user?.email || "—"}</div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge className="cs-bg-navy text-white">Teacher</Badge>
                        {isClassTeacher && <Badge className="cs-bg-green text-white" data-testid="teacher-profile-classteacher">Class teacher</Badge>}
                        {school?.name && <Badge variant="outline" className="cs-text-navy">{school.name}</Badge>}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold cs-text-navy text-sm">Classes & subjects assigned to you</h4>
                      <span className="text-[11px] text-slate-500">Set by your School Admin</span>
                    </div>

                    {myClasses.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center text-sm text-slate-500" data-testid="teacher-profile-no-classes">
                        No classes assigned yet — ask your School Administrator to assign you to a class.
                      </div>
                    ) : (
                      <div className="space-y-3" data-testid="teacher-profile-grid">
                        {myClasses.map((cls) => (
                          <div key={cls} className="rounded-lg border border-slate-200 bg-white p-3" data-testid={`teacher-profile-row-${cls}`}>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-7 h-7 rounded-md cs-bg-blue text-white flex items-center justify-center"><BookOpen size={14} /></div>
                              <div className="font-semibold cs-text-navy text-sm">{cls}</div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {mySubjects.length === 0 ? (
                                <span className="text-xs text-slate-500 italic">No subjects assigned — ask your School Admin.</span>
                              ) : mySubjects.map((subj) => (
                                <span key={subj} className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 cs-text-navy border border-slate-200" data-testid={`teacher-profile-chip-${cls}-${subj}`}>
                                  {subj}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card B — Bulk score-sheet upload zone (gated by results_enabled || unified_enabled) */}
                {!canSeeScores ? (
                  <LockedModuleCard moduleKey="bulk-scores" moduleName="Bulk Score-Sheet Upload" />
                ) : (
                <div className="cs-card p-6" data-testid="teacher-bulk-scores-card">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-lg cs-bg-green text-white flex items-center justify-center flex-shrink-0"><FileSpreadsheet size={20} /></div>
                    <div className="flex-1">
                      <h3 className="font-display font-semibold cs-text-navy text-lg">Bulk score-sheet upload</h3>
                      <p className="text-sm text-slate-500 mt-1">
                        Download a template pre-built for your school's marking scheme ({caWeights.length} CA column{caWeights.length === 1 ? "" : "s"} + Exam + Total). Fill it in Excel, then upload to push CA & exam scores to the gradebook in bulk.
                      </p>
                    </div>
                  </div>

                  <label
                    className="mt-5 block rounded-lg border-2 border-dashed border-slate-300 hover:border-slate-400 bg-slate-50/60 p-6 text-center cursor-pointer transition-colors"
                    data-testid="bulk-drop-zone"
                  >
                    <Upload size={22} className="mx-auto text-slate-400" />
                    <div className="mt-2 text-sm font-semibold cs-text-navy">
                      {bulkFile ? bulkFile.name : "Click to choose an Excel file"}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      .xlsx · headers: student_id · subject · term · year · CA 1…CA {caWeights.length} · Exam · Total Score
                    </div>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) => onBulkFile(e.target.files?.[0])}
                      data-testid="bulk-file-input"
                    />
                  </label>

                  {bulkParsed && (
                    <div className="mt-3 text-xs text-slate-600 px-3 py-2 rounded bg-emerald-50 border border-emerald-200" data-testid="bulk-parsed-summary">
                      Parsed <strong className="cs-text-navy">{bulkParsed.count}</strong> row{bulkParsed.count === 1 ? "" : "s"}. Click upload to push to the gradebook.
                    </div>
                  )}

                  {/* All controls + actions live in one grouped section */}
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                    <div className="grid sm:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Class</Label>
                        <Select value={bulkClass} onValueChange={setBulkClass}>
                          <SelectTrigger data-testid="bulk-class"><SelectValue placeholder="Pick class" /></SelectTrigger>
                          <SelectContent>{myClasses.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Term</Label>
                        <Select value={bulkTerm} onValueChange={setBulkTerm}>
                          <SelectTrigger data-testid="bulk-term"><SelectValue /></SelectTrigger>
                          <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Year</Label>
                        <Input value={bulkYear} onChange={(e) => setBulkYear(e.target.value)} data-testid="bulk-year" />
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-2 mt-3">
                      <Button
                        onClick={downloadBulkTemplate}
                        variant="outline"
                        className="w-full"
                        data-testid="bulk-template-download"
                        disabled={!bulkClass && myClasses.length === 0}
                      >
                        <Download size={14} className="mr-2" /> Download template
                      </Button>
                      <Button
                        onClick={submitBulkScores}
                        disabled={!bulkParsed || bulkBusy}
                        className="cs-bg-navy text-white hover:opacity-90 w-full rounded-md btn-anim"
                        data-testid="bulk-submit"
                      >
                        {bulkBusy ? "Uploading…" : "Validate & upload"}
                      </Button>
                    </div>
                  </div>
                </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <BulkUploadDialog
        open={parentBulkOpen}
        onOpenChange={setParentBulkOpen}
        role="parent"
        onUploaded={refresh}
      />

      {/* Exam builder dialog */}
      <Dialog open={examDlg} onOpenChange={setExamDlg}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Edit exam" : "New CBT exam"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Title</Label><Input value={examForm.title} onChange={(e) => setExamForm({ ...examForm, title: e.target.value })} data-testid="ex-title" /></div>
            <div>
              <Label>Class</Label>
              <Select value={examForm.class_name} onValueChange={(v) => setExamForm({ ...examForm, class_name: v, subject: "" })}>
                <SelectTrigger data-testid="ex-class"><SelectValue placeholder="Pick class" /></SelectTrigger>
                <SelectContent>{(school?.classes || Object.keys(classSubjects)).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subject</Label>
              <Select value={examForm.subject} onValueChange={(v) => setExamForm({ ...examForm, subject: v })}>
                <SelectTrigger data-testid="ex-subject"><SelectValue placeholder="Pick subject" /></SelectTrigger>
                <SelectContent>{(classSubjects[examForm.class_name] || []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Term</Label>
              <Select value={examForm.term} onValueChange={(v) => setExamForm({ ...examForm, term: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Year</Label><Input value={examForm.year} onChange={(e) => setExamForm({ ...examForm, year: e.target.value })} /></div>
            <div className="col-span-2"><Label>Duration (minutes)</Label><Input type="number" value={examForm.duration_min} onChange={(e) => setExamForm({ ...examForm, duration_min: parseInt(e.target.value || "1") })} data-testid="ex-duration" /></div>
          </div>

          <div className="mt-4 space-y-4">
            {examForm.questions.map((q, qi) => (
              <div key={qi} className="border rounded-lg p-4 space-y-3" data-testid={`ex-q-${qi}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-sm font-bold cs-text-navy">Question {qi + 1}</div>
                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-md border overflow-hidden text-xs" data-testid={`ex-q-type-${qi}`}>
                      <button
                        type="button"
                        onClick={() => setQuestionType(qi, "mcq")}
                        className={`px-3 py-1.5 font-semibold ${q.type !== "true_false" ? "cs-bg-navy text-white" : "bg-white text-slate-700"}`}
                        data-testid={`ex-q-type-mcq-${qi}`}
                      >Multiple choice</button>
                      <button
                        type="button"
                        onClick={() => setQuestionType(qi, "true_false")}
                        disabled={!allowTrueFalse}
                        title={!allowTrueFalse ? "True/False is only available for Primary or Mixed schools" : ""}
                        className={`px-3 py-1.5 font-semibold border-l ${q.type === "true_false" ? "cs-bg-navy text-white" : "bg-white text-slate-700"} ${!allowTrueFalse ? "opacity-40 cursor-not-allowed" : ""}`}
                        data-testid={`ex-q-type-tf-${qi}`}
                      >True / False</button>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => removeQuestion(qi)} data-testid={`ex-q-remove-${qi}`}><Trash2 size={14} /></Button>
                  </div>
                </div>
                <Textarea rows={2} value={q.question} onChange={(e) => updateQuestion(qi, { question: e.target.value })} placeholder="Question text" data-testid={`ex-q-text-${qi}`} />

                {/* Image attachment */}
                <div className="flex items-center gap-3">
                  {q.image_url ? (
                    <div className="relative">
                      <img src={q.image_url} alt="" className="h-20 w-20 object-cover rounded border" />
                      <button type="button" onClick={() => updateQuestion(qi, { image_url: "" })} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5" data-testid={`ex-q-img-remove-${qi}`}><XIcon size={12} /></button>
                    </div>
                  ) : (
                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-slate-300 text-xs text-slate-600 cursor-pointer hover:bg-slate-50">
                      <ImageIcon size={14} />
                      Attach image (optional, ≤800KB)
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadQuestionImage(qi, e.target.files?.[0])} data-testid={`ex-q-img-${qi}`} />
                    </label>
                  )}
                </div>

                {q.type === "true_false" ? (
                  <div className="grid grid-cols-2 gap-2">
                    {["True", "False"].map((label, oi) => (
                      <button
                        key={oi}
                        type="button"
                        onClick={() => updateQuestion(qi, { correct_idx: oi })}
                        className={`p-3 rounded border-2 text-sm font-semibold transition ${q.correct_idx === oi ? "border-[#28A745] bg-green-50 cs-text-green" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}
                        data-testid={`ex-q-tf-${qi}-${oi}`}
                      >
                        {q.correct_idx === oi && "✓ "}{label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className={`flex items-center gap-2 p-2 rounded border ${q.correct_idx === oi ? "border-[#28A745] bg-green-50" : ""}`}>
                          <button type="button" onClick={() => updateQuestion(qi, { correct_idx: oi })} className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${q.correct_idx === oi ? "cs-bg-green text-white" : "bg-slate-100 text-slate-600"}`} title="Mark as correct" data-testid={`ex-q-correct-${qi}-${oi}`}>{String.fromCharCode(65 + oi)}</button>
                          <Input value={opt} onChange={(e) => updateOption(qi, oi, e.target.value)} placeholder={`Option ${String.fromCharCode(65 + oi)}`} data-testid={`ex-q-opt-${qi}-${oi}`} />
                          {q.options.length > 2 && (
                            <button type="button" onClick={() => removeOption(qi, oi)} className="text-slate-400 hover:text-red-500 p-1" title="Remove option" data-testid={`ex-q-opt-remove-${qi}-${oi}`}>
                              <XIcon size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {q.options.length < 6 && (
                      <button
                        type="button"
                        onClick={() => addOption(qi)}
                        className="text-xs cs-text-blue font-semibold hover:underline inline-flex items-center gap-1"
                        data-testid={`ex-q-add-opt-${qi}`}
                      >
                        <Plus size={12} /> Add option {String.fromCharCode(65 + q.options.length)}
                      </button>
                    )}
                    <div className="text-[11px] text-slate-500">
                      {q.options.length} options · max 6 · min 2
                    </div>
                  </div>
                )}
                <div className="text-xs text-slate-500">
                  Correct: <strong>{q.type === "true_false" ? (q.correct_idx === 0 ? "True" : "False") : String.fromCharCode(65 + q.correct_idx)}</strong>
                </div>
              </div>
            ))}
            <Button variant="outline" onClick={addQuestion} className="w-full" data-testid="ex-add-q"><Plus size={14} className="mr-1" /> Add question</Button>
          </div>

          <DialogFooter>
            <Button onClick={submitExam} className="cs-bg-green text-white hover:opacity-90" data-testid="ex-save">{editingId ? "Save changes" : "Create exam"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attempts dialog */}
      <Dialog open={!!attemptsDlg} onOpenChange={(o) => !o && setAttemptsDlg(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Attempts — {attemptsDlg?.title}</DialogTitle></DialogHeader>
          {attemptsDlg && <ExamAttemptsTable examId={attemptsDlg.id} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LockedModuleCard({ moduleKey, moduleName }) {
  return (
    <div className="cs-card p-10 text-center" data-testid={`teacher-locked-${moduleKey}`}>
      <div className="mx-auto w-14 h-14 rounded-full bg-slate-100 cs-text-navy flex items-center justify-center mb-4">
        <Lock size={26} />
      </div>
      <div className="eyebrow mb-2">MODULE LOCKED</div>
      <h3 className="font-display font-bold text-xl cs-text-navy">{moduleName} is locked</h3>
      <p className="text-sm text-slate-600 mt-3 max-w-md mx-auto leading-relaxed">
        This module is locked under your school&apos;s current subscription tier. Contact your School Administrator to unlock this feature.
      </p>
    </div>
  );
}

function ExamAttemptsTable({ examId }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api.get(`/cbt/exams/${examId}/attempts`).then(({ data }) => setRows(data.attempts))
      .catch((e) => toast.error(formatApiError(e.response?.data?.detail) || e.message));
  }, [examId]);
  if (!rows) return <div className="text-sm text-slate-500">Loading…</div>;
  if (!rows.length) return <div className="text-sm text-slate-500">No attempts yet.</div>;
  return (
    <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow className="cs-bg-navy hover:cs-bg-navy">
          <TableHead className="text-white">Student</TableHead>
          <TableHead className="text-white">Class</TableHead>
          <TableHead className="text-white">Score</TableHead>
          <TableHead className="text-white">Submitted</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((a) => (
          <TableRow key={a.id}>
            <TableCell>{a.student_name || a.student_id}</TableCell>
            <TableCell>{a.class_name}</TableCell>
            <TableCell><strong>{a.score_pct}%</strong> ({a.raw_score}/{a.total_qs})</TableCell>
            <TableCell className="text-xs">{a.completed_at ? new Date(a.completed_at).toLocaleString() : <em>in progress</em>}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  );
}
