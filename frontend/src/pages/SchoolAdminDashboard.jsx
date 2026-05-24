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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth.jsx";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import {
  Users, Receipt, FileBarChart, ShieldCheck, Upload, Plus, ArrowRight,
  AlertTriangle, CreditCard, KeyRound, Image as ImageIcon, BookOpen, Trash2,
  CheckCircle2, Circle, Download, GraduationCap, FileSpreadsheet, Activity,
  UserPlus, ClipboardList, History, Eye, RotateCcw, UserCog, UserMinus,
  Search, Filter, X as XIcon, BadgeCheck,
  Menu, ChevronRight, LogOut, Layers, BarChart3,
  Copy, RefreshCw, Mail, Send, Paperclip, MessageSquare,
} from "lucide-react";
import { ChartCard, BarSimple, DonutChart, GrowthArea } from "@/components/Charts.jsx";
import BulkUploadDialog from "@/components/BulkUploadDialog.jsx";
import CredentialsModal from "@/components/CredentialsModal.jsx";
import StudentProfileDialog from "@/components/StudentProfileDialog.jsx";
import LockedOverlay from "@/components/LockedOverlay.jsx";
import DigitalReportsDashboard from "@/pages/DigitalReportsDashboard.jsx";

const PRICING = {
  cbt_essentials: {
    name: "CBT Essentials",
    "1_term": 40000, "2_terms": 70000, "full_session": 110000,
    blurb: "Run computer-based exams with auto-graded MCQ + True/False, attempt analytics and exam history.",
    features: ["CBT exam builder", "MCQ + True/False", "Auto-grading & attempts log", "Class-level publishing"],
  },
  digital_reports: {
    name: "Digital Reports",
    "1_term": 50000, "2_terms": 90000, "full_session": 140000,
    blurb: "Per-term digital report cards with QR verification, annual cumulative averaging and broadsheets.",
    features: ["Termly report cards", "Annual cumulative report", "QR-verified PDFs", "Per-column CA scoring"],
  },
  financial_ledger: {
    name: "Financial Ledger",
    "1_term": 40000, "2_terms": 70000, "full_session": 110000,
    blurb: "Fee tracking, debt-lock controls and parent visibility on outstanding balances.",
    features: ["Per-student fee balance", "Debt-lock on results", "Bursary dashboard", "Parent fee visibility"],
  },
  unified_enterprise: {
    name: "Unified Enterprise",
    full_session: 200000,
    blurb: "Everything in CBT, Digital Reports and Financial Ledger — bundled at the lowest per-student cost.",
    features: ["All CBT features", "All Digital Reports", "All Financial Ledger", "Priority support"],
  },
};
const DURS = [{ k: "1_term", l: "1 Term" }, { k: "2_terms", l: "2 Terms" }, { k: "full_session", l: "Full Session" }];

// Derive a class's school-type level from its name. Returns 'primary',
// 'secondary' or 'unknown' so the Subjects tab can filter by School Type
// for mixed-K12 schools.
function getClassLevel(className) {
  const n = (className || "").trim().toLowerCase();
  if (!n) return "unknown";
  if (/^(creche|crèche|nursery|kg|kindergarten|reception|pre[- ]?k|pre[- ]?nursery|playgroup)\b/.test(n)) return "primary";
  if (/^(primary|pry|grade|basic [1-6]\b)/.test(n)) return "primary";
  if (/^(jss|js |js[1-3]|j\.s\.s|junior secondary|sss|ss |ss[1-3]|s\.s\.s|senior secondary|secondary)\b/.test(n)) return "secondary";
  return "unknown";
}

// Strong password generator — uses crypto.getRandomValues, avoids ambiguous
// characters (0/O, 1/l/I). 12 chars, mixed-case + digits + safe symbols.
function generatePassword(len = 12) {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*-_+?";
  const buf = new Uint32Array(len);
  (window.crypto || window.msCrypto).getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) out += charset[buf[i] % charset.length];
  return out;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function SchoolAdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [school, setSchool] = useState(null);
  const [students, setStudents] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [tab, setTab] = useState("overview");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = async () => {
    try { await logout(); } catch {}
    navigate("/");
  };

  const [newStudent, setNewStudent] = useState({ name: "", age: 10, gender: "Male", class_name: "", parent_email: "", balance_due: 0 });
  const [studentDlg, setStudentDlg] = useState(false);

  const [duration, setDuration] = useState("full_session");
  const [bankDlg, setBankDlg] = useState(false);
  const [bankForm, setBankForm] = useState({ tier: "digital_reports", duration: "full_session", amount_ngn: 0, file_data_url: "", note: "" });

  // Subjects state
  const [classSubjects, setClassSubjects] = useState([]);
  const [subjDlg, setSubjDlg] = useState(false);
  const [subjForm, setSubjForm] = useState({ class_name: "", subjectsText: "" });
  // Subjects tab: filter cards by school-type level (only meaningful for mixed schools)
  const [subjectsLevelFilter, setSubjectsLevelFilter] = useState("all"); // "all" | "primary" | "secondary"

  // Login provisioning
  const [loginDlg, setLoginDlg] = useState(null); // student object
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });

  // Profile
  const [profileForm, setProfileForm] = useState({ name: "", principal_name: "", address: "", phone: "", email: "", motto: "", logo_url: "", founded_year: "", website: "", brand_color: "#002147", ca_weights: [20, 20], exam_max: 60 });
  // Class rename
  const [renamingClass, setRenamingClass] = useState(null); // {old: "JSS 1", new: "JSS 1A"}
  // Analytics
  const [analytics, setAnalytics] = useState(null);

  // Users (teachers / parents)
  const [usersList, setUsersList] = useState([]);
  const [userDlg, setUserDlg] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: generatePassword(), role: "teacher", assigned_class: "" });

  // Passport upload
  const [passportDlg, setPassportDlg] = useState(null);

  // Bulk upload dialog (teacher / parent / student)
  const [bulkRole, setBulkRole] = useState(null);
  // Credentials modal — used after single Reveal / Reset
  const [credModal, setCredModal] = useState(null); // {title, created, skipped, role, note}
  // Student profile dialog
  const [profileStudent, setProfileStudent] = useState(null);
  // Sprint-1: Students search & filters
  const [stuSearch, setStuSearch] = useState("");
  const [stuClassFilter, setStuClassFilter] = useState("all");
  const [stuFeeFilter, setStuFeeFilter] = useState("all"); // all | paid | unpaid
  const [stuBenchmark, setStuBenchmark] = useState(false); // when true: only students with avg ≥ school benchmark
  // Sprint-1: Users tab sub-selection
  const [usersSubtab, setUsersSubtab] = useState("teachers"); // teachers | students | parents
  // Sprint-1: passport upload preview
  const [passportPreview, setPassportPreview] = useState(null);

  // Classes management
  const [newClassName, setNewClassName] = useState("");
  const classes = useMemo(() => school?.classes || [], [school]);

  // Audit log / activity feed
  const [audit, setAudit] = useState({ events: [], counts: {}, total: 0 });
  // Pending CBT exams awaiting admin approval
  const [pendingExams, setPendingExams] = useState([]);

  const approveExam = async (examId) => {
    try {
      await api.post(`/cbt/exams/${examId}/approve`);
      toast.success("Exam approved & published");
      refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
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
      subjects: "subjects-template.xlsx",
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
      const { data } = await api.post("/schools/me/classes", { class_name: name });
      toast.success(`Added "${name}"`);
      setNewClassName("");
      // Optimistic update so UI shows the new class instantly
      if (data?.classes) setSchool((s) => s ? { ...s, classes: data.classes } : s);
      refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const renameClass = async (oldName, newName) => {
    const n = (newName || "").trim();
    if (!n) { toast.error("New name required"); return; }
    if (n === oldName) { setRenamingClass(null); return; }
    try {
      const { data } = await api.put(`/schools/me/classes/${encodeURIComponent(oldName)}`, { new_name: n });
      toast.success(`Renamed "${oldName}" → "${n}"`);
      if (data?.classes) setSchool((s) => s ? { ...s, classes: data.classes } : s);
      setRenamingClass(null);
      refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const downloadClassTemplate = async (className) => {
    try {
      const res = await api.get(`/students/template/${encodeURIComponent(className)}`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${className.replace(/\s+/g, "_")}_students.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Template for ${className} downloaded`);
    } catch (e) { toast.error("Could not download template"); }
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
      const [sRes, stRes, rRes, sjRes, uRes, anRes, pendRes] = await Promise.all([
        api.get("/schools/me"),
        api.get("/students"),
        api.get("/payments/bank-receipts"),
        api.get("/subjects"),
        api.get("/users"),
        api.get("/analytics/school"),
        api.get("/cbt/exams", { params: { status: "pending_review" } }).catch(() => ({ data: { exams: [] } })),
      ]);
      setSchool(sRes.data.school);
      setStudents(stRes.data.students || []);
      setReceipts(rRes.data.receipts || []);
      setClassSubjects(sjRes.data.class_subjects || []);
      setUsersList(uRes.data.users || []);
      setAnalytics(anRes.data);
      setPendingExams(pendRes.data.exams || []);
      // Sync profile form
      const s = sRes.data.school;
      setProfileForm({
        name: s.name || "", principal_name: s.principal_name || "", address: s.address || "",
        phone: s.phone || "", email: s.email || "", motto: s.motto || "",
        logo_url: s.logo_url || "", founded_year: s.founded_year || "", website: s.website || "",
        brand_color: s.brand_color || "#002147",
        // Read ca_weights if present; else synthesize from legacy ca_max into a single-column array
        ca_weights: (Array.isArray(s.ca_weights) && s.ca_weights.length > 0) ? s.ca_weights : [s.ca_max ?? 40],
        exam_max: s.exam_max ?? 60,
      });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };
  useEffect(() => { refresh(); }, []);

  // ─── Communication Hub — Messages & Materials (Admin local-only) ───
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [composeForm, setComposeForm] = useState({
    message_type: "announcement",
    target_role: "all",
    target_class: "__none__",
    content: "",
    attachment_url: "",
  });
  const [sendingMsg, setSendingMsg] = useState(false);

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
    if (tab === "messages") loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const openMessage = async (m) => {
    if (m?.unread) {
      try { await api.post(`/messages/${m.id}/read`); } catch { /* silent */ }
      loadMessages();
    }
  };
  const sendMessage = async () => {
    const body = composeForm.content.trim();
    if (!body) { toast.error("Content is required"); return; }
    setSendingMsg(true);
    try {
      await api.post("/messages", {
        message_type: composeForm.message_type,
        target_role: composeForm.target_role,
        target_class: composeForm.target_class === "__none__" ? null : composeForm.target_class,
        content: body,
        attachment_url: composeForm.attachment_url.trim() || null,
      });
      toast.success("Sent");
      setComposeForm((f) => ({ ...f, content: "", attachment_url: "" }));
      loadMessages();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally { setSendingMsg(false); }
  };

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
      setNewUser({ name: "", email: "", password: generatePassword(), role: newUser.role, assigned_class: "" });
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
    if (!bankForm.note || bankForm.note.trim().length < 4) { toast.error("Add school name + sender's name for validation"); return; }
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
  const [subjUploading, setSubjUploading] = useState(false);
  const bulkUploadSubjects = async (file) => {
    if (!file) return;
    setSubjUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/subjects/bulk-upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const saved = data.saved_count || 0;
      const skipped = data.skipped_count || 0;
      const total = data.total_subject_rows || 0;
      if (saved > 0) {
        toast.success(`Imported ${total} subject row${total === 1 ? "" : "s"} across ${saved} class${saved === 1 ? "" : "es"}${skipped ? ` — ${skipped} class${skipped === 1 ? "" : "es"} skipped` : ""}`);
      } else {
        toast.error("No subjects imported. Check the file headers and that classes exist.");
      }
      if (data.skipped?.length) {
        data.skipped.slice(0, 3).forEach((s) => {
          const hint = s.suggestion ? ` — did you mean "${s.suggestion}"?` : "";
          toast.warning(`Skipped ${s.class_name} — ${s.reason}${hint}`);
        });
      }
      setSubjDlg(false);
      refresh();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSubjUploading(false);
    }
  };

  // Login provisioning
  const openLoginDlg = (st) => {
    setLoginDlg(st);
    const seed = st.name.toLowerCase().split(" ")[0].replace(/[^a-z]/g, "");
    setLoginForm({ email: `${seed}@${school.name.toLowerCase().replace(/[^a-z]/g, "")}.school`, password: generatePassword() });
  };
  const submitLogin = async () => {
    try {
      await api.post(`/students/${loginDlg.id}/login`, loginForm);
      toast.success(`Login created: ${loginForm.email}`);
      setLoginDlg(null);
      refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  // Passport — Sprint 1: 500 KB limit + preview before save
  const MAX_PASSPORT_BYTES = 500 * 1024;
  const onPassportFile = (st, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_PASSPORT_BYTES) {
      toast.error(`Image too large — max 500 KB. Yours is ${(file.size / 1024).toFixed(0)} KB.`);
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPassportPreview(reader.result);
      toast.success(`Preview ready (${(file.size / 1024).toFixed(0)} KB) — click Save to confirm`);
    };
    reader.readAsDataURL(file);
  };
  const savePassport = async () => {
    if (!passportDlg || !passportPreview) return;
    try {
      await api.put(`/students/${passportDlg.id}/passport`, { passport_url: passportPreview });
      toast.success(`Passport saved for ${passportDlg.name}`);
      setPassportDlg(null);
      setPassportPreview(null);
      refresh();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail) || err.message); }
  };

  // Sprint-1: Students filter pipeline
  const filteredStudents = useMemo(() => {
    let arr = students;
    if (stuSearch.trim()) {
      const q = stuSearch.trim().toLowerCase();
      arr = arr.filter((s) =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.parent_name || "").toLowerCase().includes(q) ||
        (s.parent_email || "").toLowerCase().includes(q) ||
        (s.class_name || "").toLowerCase().includes(q),
      );
    }
    if (stuClassFilter !== "all") arr = arr.filter((s) => s.class_name === stuClassFilter);
    if (stuFeeFilter === "paid") arr = arr.filter((s) => (s.balance_due || 0) <= 0);
    if (stuFeeFilter === "unpaid") arr = arr.filter((s) => (s.balance_due || 0) > 0);
    // Above benchmark (uses school.benchmark, default 50)
    if (stuBenchmark) {
      const bench = Number(school?.benchmark || 50);
      arr = arr.filter((s) => {
        const avg = Number(s.term_average || s.cumulative_average || 0);
        return avg >= bench;
      });
    }
    return arr;
  }, [students, stuSearch, stuClassFilter, stuFeeFilter, stuBenchmark, school]);

  const debtCount = useMemo(() => students.filter((s) => (s.balance_due || 0) > 0).length, [students]);
  const totalDebt = useMemo(() => students.reduce((a, s) => a + (s.balance_due || 0), 0), [students]);

  // Sidebar navigation config
  const NAV = [
    { k: "overview", l: "Overview", I: BarChart3 },
    { k: "profile", l: "Profile", I: BadgeCheck },
    { k: "classes", l: "Classes", I: BookOpen },
    { k: "users", l: "Users", I: Users },
    { k: "students", l: "Students", I: GraduationCap },
    { k: "subjects", l: "Subjects", I: Layers },
    { k: "messages", l: "Messages", I: Mail, badge: unreadCount },
    { k: "subscription", l: "Subscription", I: CreditCard },
    { k: "receipts", l: "Receipts", I: Receipt },
  ];
  const currentLabel = NAV.find((n) => n.k === tab)?.l || "Dashboard";

  const SidebarContent = ({ onClickItem }) => (
    <div className="h-full flex flex-col cs-bg-navy text-white">
      <div className="p-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-md bg-white/10 flex items-center justify-center"><BadgeCheck size={18} /></div>
          <div className="hidden lg:block leading-tight">
            <div className="text-[10px] tracking-wider text-white/60 uppercase">School Admin</div>
            <div className="text-xs font-semibold truncate max-w-[140px]">{school?.name || "—"}</div>
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
              data-testid={`school-nav-${n.k}`}
              title={n.l}
            >
              <Icon size={15} className="flex-shrink-0" />
              <span className="hidden lg:inline truncate flex-1 text-left">{n.l}</span>
              {n.badge > 0 && (
                <span className="hidden lg:inline-flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] h-[18px]" data-testid={`school-nav-${n.k}-badge`}>
                  {n.badge > 99 ? "99+" : `+${n.badge}`}
                </span>
              )}
              {active && <ChevronRight size={12} className="hidden lg:inline" />}
            </button>
          );
        })}
        <div className="border-t border-white/10 my-2" />
        <Button onClick={handleLogout} className="w-full bg-red-500/15 hover:bg-red-500/30 text-white rounded-md text-xs h-9 justify-start gap-2 transition-all duration-200 px-2.5" data-testid="school-sidebar-logout">
          <LogOut size={14} className="flex-shrink-0" /> <span className="hidden lg:inline">Logout</span>
        </Button>
      </nav>
      <div className="hidden">{/* spacer */}</div>
    </div>
  );

  if (!user || !school) return <div className="min-h-screen"><Navbar variant="dashboard" /><div className="p-10 text-slate-500">Loading…</div></div>;

  // Plan-specific dashboard: Digital Reports tier gets its own sidebar-based experience.
  if (school.subscription_tier === "digital_reports") {
    return <DigitalReportsDashboard school={school} refreshOuter={refresh} />;
  }

  const locked = school.verification_status && school.verification_status !== "active";

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar variant="dashboard" />
      {locked && <LockedOverlay school={school} onUnlocked={refresh} />}

      {/* Pinned sidebar (desktop) */}
      <aside className="hidden sm:flex flex-col fixed left-0 top-14 bottom-0 z-30 w-16 lg:w-64 xl:w-72 border-r shadow-sm transition-all duration-300" data-testid="school-sidebar-desktop">
        <SidebarContent onClickItem={(k) => setTab(k)} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="sm:hidden fixed inset-0 z-40" data-testid="school-drawer">
          <div className="absolute inset-0 bg-slate-900/60 transition-opacity duration-300" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 shadow-xl transition-transform duration-300">
            <SidebarContent onClickItem={(k) => setTab(k)} />
          </aside>
        </div>
      )}

      <main className="sm:ml-16 lg:ml-64 xl:ml-72 pt-[120px] transition-all duration-300" data-testid="school-admin-dashboard">
        {/* Fixed in-page header — pinned below the fixed Navbar, offset by sidebar width */}
        <div className="fixed top-14 left-0 sm:left-16 lg:left-64 xl:left-72 right-0 z-20 bg-slate-50 border-b border-slate-200 px-4 sm:px-6 lg:px-10 xl:px-12 py-3 transition-all duration-300">
          <div className="max-w-[1800px] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button className="sm:hidden p-2 rounded-md border border-slate-200 bg-white" onClick={() => setDrawerOpen(true)} data-testid="school-hamburger"><Menu size={18} /></button>
              <div className="min-w-0">
                <span className="eyebrow">SCHOOL ADMIN</span>
                <h1 className="font-display text-xl sm:text-2xl font-bold cs-text-navy mt-0.5 truncate" data-testid="school-title">{school.name} · {currentLabel}</h1>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-3 cs-card px-4 py-2 shrink-0" data-testid="school-header-user">
              <div className="w-9 h-9 rounded-full cs-bg-navy text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                {(school.name || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}
              </div>
              <div className="text-right leading-tight">
                <div className="text-sm font-semibold cs-text-navy truncate max-w-[200px]" data-testid="school-header-name">{school.name}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500" data-testid="school-header-role">School Admin</div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 lg:px-10 xl:px-12 py-6 max-w-[1800px]">
          {/* Status + plan row */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {school.kill_switch ? (
              <Badge className="bg-red-500 text-white">Kill-switch ACTIVE</Badge>
            ) : (
              <Badge className="cs-bg-green text-white">Active</Badge>
            )}
            <div className="text-xs cs-card px-3 py-1.5 flex items-center gap-2">
              <span className="font-semibold cs-text-navy">{school.subscription_tier ? PRICING[school.subscription_tier]?.name : "No subscription"}</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500">{school.subscription_duration ? DURS.find((d) => d.k === school.subscription_duration)?.l : "—"}</span>
            </div>
            <div className="text-xs text-slate-500 truncate">{school.address || ""}{school.principal_name ? ` · Principal: ${school.principal_name}` : ""}</div>
          </div>

          {/* KPI tiles */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

          <Tabs value={tab} onValueChange={setTab}>
            {/* TabsList is hidden — navigation lives in the sidebar. We keep Tabs as the controlled context for TabsContent. */}

          <TabsContent value="overview" className="mt-6 grid md:grid-cols-2 gap-6">
            {/* Setup checklist */}
            <div className="cs-card p-6 md:col-span-2">
              <h3 className="font-display font-semibold cs-text-navy text-lg">Setup checklist</h3>
              <p className="text-sm text-slate-500 mt-1">Complete these to start using Corner Streams end-to-end.</p>
              {(() => {
                const steps = [
                  { done: !!(school.address && school.phone && school.motto), label: "Build your school profile (address, motto, logo, contact)", action: () => setTab("profile") },
                  { done: classSubjects.length > 0, label: "Set subjects for each class", action: () => setTab("subjects") },
                  { done: usersList.some((u) => u.role === "teacher"), label: "Add at least one teacher", action: () => { setNewUser({ name: "", email: "", password: generatePassword(), role: "teacher", assigned_class: "" }); setUserDlg(true); } },
                  { done: usersList.some((u) => u.role === "parent"), label: "Add at least one parent", action: () => { setNewUser({ name: "", email: "", password: generatePassword(), role: "parent", assigned_class: "" }); setUserDlg(true); } },
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

            {/* CBT exam approvals — only renders when there's something to review */}
            <div className="cs-card p-6" data-testid="admin-pending-exams-card">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold cs-text-navy text-lg">CBT exam approvals</h3>
                <Badge className={pendingExams.length ? "bg-amber-500 text-white" : "bg-slate-300 text-white"} data-testid="pending-exams-count">
                  {pendingExams.length} pending
                </Badge>
              </div>
              {pendingExams.length === 0 ? (
                <p className="text-sm text-slate-500 mt-3">No exams awaiting approval. Teacher-submitted exams will appear here.</p>
              ) : (
                <ul className="mt-4 space-y-2" data-testid="pending-exams-list">
                  {pendingExams.slice(0, 6).map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border" data-testid={`pending-exam-${e.id}`}>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold cs-text-navy truncate">{e.title}</div>
                        <div className="text-xs text-slate-500 truncate">{e.class_name} · {e.subject} · {e.questions?.length || 0} Qs · {e.term}</div>
                      </div>
                      <Button size="sm" onClick={() => approveExam(e.id)} className="cs-bg-green text-white hover:opacity-90 shrink-0" data-testid={`approve-exam-${e.id}`}>
                        <CheckCircle2 size={14} className="mr-1" /> Approve & publish
                      </Button>
                    </li>
                  ))}
                  {pendingExams.length > 6 && (
                    <li className="text-xs text-slate-500 px-1">+ {pendingExams.length - 6} more pending</li>
                  )}
                </ul>
              )}
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

              {/* Brand color + score model — appears on every report card */}
              <div className="mt-8 pt-6 border-t">
                <div className="eyebrow cs-text-navy">REPORT CARD SETTINGS</div>
                <p className="text-xs text-slate-500 mt-1">These values control how scores are entered and printed on every student's report.</p>
                <div className="mt-3 grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Brand color</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <input type="color" value={profileForm.brand_color} onChange={(e) => setProfileForm({ ...profileForm, brand_color: e.target.value })} className="h-10 w-12 rounded-md border border-slate-200 cursor-pointer" data-testid="profile-brand-color" />
                      <Input value={profileForm.brand_color} onChange={(e) => setProfileForm({ ...profileForm, brand_color: e.target.value })} className="font-mono" data-testid="profile-brand-color-hex" />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Assessment structure (CA columns + Exam)</Label>
                    {(() => {
                      const weights = profileForm.ca_weights || [];
                      const examMax = Number(profileForm.exam_max || 0);
                      const caSum = weights.reduce((a, b) => a + Number(b || 0), 0);
                      const total = caSum + examMax;
                      const valid = total === 100 && weights.length >= 2 && weights.length <= 5 && weights.every((w) => Number(w) >= 1) && examMax >= 1;
                      const setCount = (n) => {
                        const next = [...weights];
                        if (n > next.length) while (next.length < n) next.push(5);
                        else next.length = n;
                        setProfileForm({ ...profileForm, ca_weights: next });
                      };
                      const setWeightAt = (idx, val) => {
                        const next = [...weights];
                        next[idx] = Number(val) || 0;
                        setProfileForm({ ...profileForm, ca_weights: next });
                      };
                      return (
                        <div className="mt-2 space-y-3" data-testid="assessment-structure">
                          <div className="flex flex-wrap items-center gap-3">
                            <Label className="text-xs text-slate-500 mb-0">Number of CA columns</Label>
                            <div className="inline-flex rounded-md border overflow-hidden">
                              <Button type="button" variant="ghost" size="sm" className="rounded-none h-9 px-3" onClick={() => weights.length > 2 && setCount(weights.length - 1)} disabled={weights.length <= 2} data-testid="ca-count-dec">−</Button>
                              <div className="px-4 h-9 flex items-center justify-center text-sm font-semibold cs-text-navy bg-slate-50 min-w-[3rem]" data-testid="ca-count-value">{weights.length}</div>
                              <Button type="button" variant="ghost" size="sm" className="rounded-none h-9 px-3" onClick={() => weights.length < 5 && setCount(weights.length + 1)} disabled={weights.length >= 5} data-testid="ca-count-inc">+</Button>
                            </div>
                            <span className="text-xs text-slate-500">Min 2 · Max 5</span>
                          </div>

                          <div className="grid sm:grid-cols-6 gap-2">
                            {weights.map((w, i) => (
                              <div key={i}>
                                <Label className="text-xs text-slate-500">CA{i + 1} max</Label>
                                <Input type="number" min={1} max={100} value={w} onChange={(e) => setWeightAt(i, e.target.value)} data-testid={`ca-weight-${i}`} />
                              </div>
                            ))}
                            <div>
                              <Label className="text-xs text-slate-500">Exam max</Label>
                              <Input type="number" min={1} max={100} value={profileForm.exam_max} onChange={(e) => setProfileForm({ ...profileForm, exam_max: Number(e.target.value) })} data-testid="profile-exam-max" />
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${valid ? "cs-bg-green text-white" : "bg-red-100 text-red-700 border border-red-200"}`} data-testid="ca-total-badge">
                              <span>Total maximum: {total} / 100</span>
                              {valid ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                            </div>
                            {!valid && (
                              <span className="text-xs text-red-600" data-testid="ca-total-help">Maximums must sum to exactly 100. Adjust the CA weights or Exam max.</span>
                            )}
                          </div>

                          <p className="text-[11px] text-slate-500">
                            Defines the maximum marks a teacher can enter per column. Students score any value up to each max. WAEC-style example: <strong>4 × 5 CA + 80 Exam</strong>. Older format: <strong>2 × 20 CA + 60 Exam</strong>.
                          </p>
                        </div>
                      );
                    })()}
                  </div>
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
                  const isRenaming = renamingClass && renamingClass.old === cn;
                  return (
                    <div key={cn} className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-white" data-testid={`class-row-${cn}`}>
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-md cs-bg-navy text-white flex items-center justify-center flex-shrink-0">
                          <GraduationCap size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          {isRenaming ? (
                            <Input
                              autoFocus
                              defaultValue={cn}
                              onBlur={(e) => renameClass(cn, e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") renameClass(cn, e.target.value); if (e.key === "Escape") setRenamingClass(null); }}
                              className="h-7 text-sm"
                              data-testid={`class-rename-input-${cn}`}
                            />
                          ) : (
                            <div className="font-semibold cs-text-navy truncate cursor-pointer hover:underline" onClick={() => setRenamingClass({ old: cn, new: cn })} title="Click to rename" data-testid={`class-name-${cn}`}>{cn}</div>
                          )}
                          <div className="text-[11px] text-slate-500">{studentCount} student{studentCount !== 1 ? "s" : ""}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadClassTemplate(cn)}
                          title="Download Excel template for this class"
                          data-testid={`class-template-${cn}`}
                        ><FileSpreadsheet size={12} /></Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRenamingClass({ old: cn, new: cn })}
                          title="Rename class"
                          data-testid={`class-rename-${cn}`}
                        ><UserCog size={12} /></Button>
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
                <h3 className="font-display font-semibold cs-text-navy text-lg">Users & logins</h3>
                <p className="text-xs text-slate-500">Teachers, students and parents — each in their own table.</p>
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
                <Button onClick={() => { setNewUser({ name: "", email: "", password: generatePassword(), role: "teacher", assigned_class: "" }); setUserDlg(true); }} className="cs-bg-green text-white hover:opacity-90 rounded-full btn-anim" data-testid="add-user-btn"><Plus size={14} className="mr-1" /> Add user</Button>
              </div>
            </div>

            {/* Sub-tab pills */}
            <div className="inline-flex gap-1 bg-slate-100 rounded-full p-1 mb-4">
              {[
                { key: "teachers", label: "Teachers", role: "teacher" },
                { key: "students", label: "Students", role: "student" },
                { key: "parents", label: "Parents", role: "parent" },
              ].map((t) => {
                const count = usersList.filter((u) => u.role === t.role && u.id !== user.id).length;
                return (
                  <button
                    key={t.key}
                    onClick={() => setUsersSubtab(t.key)}
                    data-testid={`users-subtab-${t.key}`}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors cs-noflip ${usersSubtab === t.key ? "cs-bg-navy text-white shadow" : "text-slate-600 hover:bg-white"}`}
                  >
                    {t.label} <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${usersSubtab === t.key ? "bg-white/20" : "bg-slate-200"}`}>{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="cs-card overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="cs-bg-navy hover:cs-bg-navy">
                      <TableHead className="text-white">Name</TableHead>
                      <TableHead className="text-white">Login</TableHead>
                      <TableHead className="text-white">Password</TableHead>
                      {usersSubtab === "teachers" && <TableHead className="text-white">Classes</TableHead>}
                      {usersSubtab === "students" && <TableHead className="text-white">Class</TableHead>}
                      {usersSubtab === "parents" && <TableHead className="text-white">Children</TableHead>}
                      <TableHead className="text-white text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersList.filter((u) => {
                      if (u.id === user.id || u.role === "super_admin") return false;
                      if (usersSubtab === "teachers") return u.role === "teacher";
                      if (usersSubtab === "students") return u.role === "student";
                      if (usersSubtab === "parents") return u.role === "parent";
                      return false;
                    }).map((u, i) => {
                      const isAdminPower = u.role === "school_admin" || u.is_admin;
                      const isPromoted = u.is_admin && u.role !== "school_admin";
                      const pwChanged = u.password_changed_by_user;
                      const linkedStudents = u.role === "parent"
                        ? students.filter((s) => (s.parent_email || "").toLowerCase() === (u.email || "").toLowerCase())
                        : (u.role === "student" ? students.filter((s) => s.id === u.student_id) : []);
                      return (
                        <TableRow key={u.id} className={i % 2 ? "bg-slate-50" : ""} data-testid={`user-row-${u.id}`}>
                          <TableCell className="font-medium">
                            <div className="flex flex-col">
                              <span>{u.name}</span>
                              {isPromoted && <span className="text-[10px] text-emerald-700 flex items-center gap-1"><ShieldCheck size={9} /> Admin powers</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{u.email}</TableCell>
                          <TableCell>
                            {pwChanged
                              ? <Badge variant="outline" className="text-slate-600 border-slate-300">User-set</Badge>
                              : <Badge variant="outline" className="text-emerald-700 border-emerald-300">Auto</Badge>}
                          </TableCell>
                          <TableCell className="text-xs">
                            {usersSubtab === "teachers" && (u.assigned_class || (u.assigned_classes || []).join(", ") || "—")}
                            {usersSubtab === "students" && (linkedStudents[0]?.class_name || "—")}
                            {usersSubtab === "parents" && (linkedStudents.length ? linkedStudents.map((s) => s.name).slice(0, 2).join(", ") + (linkedStudents.length > 2 ? ` +${linkedStudents.length - 2}` : "") : "—")}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex gap-1">
                              {!pwChanged && (
                                <Button size="sm" variant="ghost" onClick={() => revealPwd(u)} title="Reveal password" data-testid={`reveal-${u.id}`} className="cs-noflip"><Eye size={14} /></Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => resetPwd(u)} title="Reset password" data-testid={`reset-${u.id}`} className="cs-noflip"><RotateCcw size={14} /></Button>
                              {isPromoted ? (
                                <Button size="sm" variant="ghost" onClick={() => demoteUser(u)} title="Revoke admin" data-testid={`demote-${u.id}`} className="cs-noflip"><UserMinus size={14} className="text-red-500" /></Button>
                              ) : (
                                (u.role === "teacher" || u.role === "parent") &&
                                <Button size="sm" variant="ghost" onClick={() => promoteUser(u)} title="Grant admin" data-testid={`promote-${u.id}`} className="cs-noflip"><UserCog size={14} className="cs-text-blue" /></Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => removeUser(u.id)} title="Delete" data-testid={`user-del-${u.id}`} className="cs-noflip"><Trash2 size={14} className="text-red-500" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!usersList.filter((u) => u.id !== user.id && u.role !== "super_admin" && (usersSubtab === "teachers" ? u.role === "teacher" : usersSubtab === "students" ? u.role === "student" : u.role === "parent")).length && (
                      <TableRow><TableCell colSpan={5} className="text-center text-slate-500 py-8">No {usersSubtab} yet. Use <strong>Bulk {usersSubtab}</strong> or <strong>Add user</strong>.</TableCell></TableRow>
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
              <div className="overflow-x-auto">
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
            </div>
          </TabsContent>

          <TabsContent value="subjects" className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="font-display font-semibold cs-text-navy text-lg">Subjects per class</h3>
              <Button onClick={openNewSubjects} className="cs-bg-green text-white hover:opacity-90 rounded-full" data-testid="add-subjects-btn"><Plus size={14} className="mr-1" /> Add class subjects</Button>
            </div>
            {(() => {
              const isMixed = school.school_type === "mixed";
              // For non-mixed schools, pre-pin the filter to the school's own level so the chip row is informational only.
              const effectiveFilter = isMixed ? subjectsLevelFilter : (school.school_type === "primary" ? "primary" : "secondary");
              const filtered = classSubjects.filter((cs) => {
                if (effectiveFilter === "all") return true;
                return getClassLevel(cs.class_name) === effectiveFilter;
              });
              const chip = (k, l) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => isMixed && setSubjectsLevelFilter(k)}
                  disabled={!isMixed && k !== effectiveFilter}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition ${effectiveFilter === k ? "cs-bg-navy text-white border-transparent" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"} ${!isMixed && k !== effectiveFilter ? "opacity-40 cursor-not-allowed" : ""}`}
                  data-testid={`subjects-filter-${k}`}
                >
                  {l}
                </button>
              );
              return (
                <>
                  <div className="flex flex-wrap items-center gap-2 mb-4" data-testid="subjects-filter-row">
                    <span className="text-xs text-slate-500">Filter by School Type:</span>
                    {chip("all", "All")}
                    {chip("primary", "Primary")}
                    {chip("secondary", "Secondary")}
                    {!isMixed && (
                      <span className="text-[11px] text-slate-400 ml-1">
                        (Single-type school — locked to <strong className="cs-text-navy capitalize">{school.school_type || "secondary"}</strong>)
                      </span>
                    )}
                    <span className="ml-auto text-xs text-slate-500" data-testid="subjects-filter-count">
                      Showing <strong className="cs-text-navy">{filtered.length}</strong> of {classSubjects.length}
                    </span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {filtered.map((cs) => {
                      const lvl = getClassLevel(cs.class_name);
                      const lvlChip = lvl === "primary"
                        ? <Badge className="cs-bg-blue text-white text-[10px] uppercase tracking-wide">Primary</Badge>
                        : lvl === "secondary"
                          ? <Badge className="cs-bg-navy text-white text-[10px] uppercase tracking-wide">Secondary</Badge>
                          : <Badge className="bg-slate-300 text-white text-[10px] uppercase tracking-wide">Unsorted</Badge>;
                      return (
                        <div key={cs.class_name} className="cs-card p-5" data-testid={`subjects-${cs.class_name}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-9 h-9 rounded-md cs-bg-blue text-white flex items-center justify-center shrink-0"><BookOpen size={16} /></div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="font-display font-bold cs-text-navy truncate">{cs.class_name}</div>
                                  {lvlChip}
                                </div>
                                <div className="text-[11px] text-slate-500">{cs.subjects.length} subject{cs.subjects.length !== 1 ? "s" : ""}</div>
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <Button size="sm" variant="outline" onClick={() => editSubjects(cs)} data-testid={`edit-subjects-${cs.class_name}`}>Edit</Button>
                              <Button size="sm" variant="destructive" onClick={() => deleteSubjects(cs.class_name)} data-testid={`del-subjects-${cs.class_name}`}><Trash2 size={12} /></Button>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {cs.subjects.map((sub) => <Badge key={sub} variant="outline" className="text-xs">{sub}</Badge>)}
                          </div>
                        </div>
                      );
                    })}
                    {!filtered.length && (
                      <div className="cs-card p-8 col-span-full text-center text-slate-500" data-testid="subjects-empty-state">
                        {classSubjects.length === 0
                          ? <>No subjects assigned yet. Click <strong>Add class subjects</strong> to get started.</>
                          : effectiveFilter === "all"
                            ? <>No matching subjects.</>
                            : <>No <strong className="capitalize">{effectiveFilter}</strong> classes have subjects yet.</>}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </TabsContent>

          {/* ---------------- MESSAGES & MATERIALS (Admin local-only) ---------------- */}
          <TabsContent value="messages" className="mt-6">
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Composer */}
              <div className="cs-card p-6" data-testid="school-messages-composer">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-11 h-11 rounded-lg cs-bg-navy text-white flex items-center justify-center flex-shrink-0"><Send size={18} /></div>
                  <div className="flex-1">
                    <h3 className="font-display font-semibold cs-text-navy text-lg">Compose</h3>
                    <p className="text-sm text-slate-500 mt-1">Broadcast announcements, assignments or learning material to teachers, students or parents in your school.</p>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Message type</Label>
                    <Select value={composeForm.message_type} onValueChange={(v) => setComposeForm((f) => ({ ...f, message_type: v }))}>
                      <SelectTrigger data-testid="school-msg-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="announcement">Announcement</SelectItem>
                        <SelectItem value="assignment">Assignment</SelectItem>
                        <SelectItem value="material">Material</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Target audience</Label>
                    <Select value={composeForm.target_role} onValueChange={(v) => setComposeForm((f) => ({ ...f, target_role: v }))}>
                      <SelectTrigger data-testid="school-msg-target-role"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Everyone in school</SelectItem>
                        <SelectItem value="teachers">Teachers</SelectItem>
                        <SelectItem value="students">Students</SelectItem>
                        <SelectItem value="parents">Parents</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-3">
                  <Label className="text-xs">Target class (optional)</Label>
                  <Select value={composeForm.target_class} onValueChange={(v) => setComposeForm((f) => ({ ...f, target_class: v }))}>
                    <SelectTrigger data-testid="school-msg-target-class"><SelectValue placeholder="No specific class" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No specific class</SelectItem>
                      {(school?.classes || []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="mt-3">
                  <Label className="text-xs">Content</Label>
                  <Textarea
                    rows={4}
                    placeholder="Write your message…"
                    value={composeForm.content}
                    onChange={(e) => setComposeForm((f) => ({ ...f, content: e.target.value }))}
                    data-testid="school-msg-content"
                  />
                </div>
                <div className="mt-3">
                  <Label className="text-xs flex items-center gap-1"><Paperclip size={12} /> Attachment URL (optional)</Label>
                  <Input
                    placeholder="https://drive.google.com/…"
                    value={composeForm.attachment_url}
                    onChange={(e) => setComposeForm((f) => ({ ...f, attachment_url: e.target.value }))}
                    data-testid="school-msg-attachment"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Maximum file upload size supported: 25MB</p>
                </div>
                <Button
                  onClick={sendMessage}
                  disabled={sendingMsg || !composeForm.content.trim()}
                  className="cs-bg-green text-white hover:opacity-90 w-full mt-4 rounded-full btn-anim"
                  data-testid="school-msg-send"
                >
                  <Send size={14} className="mr-2" /> {sendingMsg ? "Sending…" : "Send message"}
                </Button>
              </div>

              {/* Stream */}
              <div className="cs-card p-6" data-testid="school-messages-stream">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-11 h-11 rounded-lg cs-bg-blue text-white flex items-center justify-center flex-shrink-0"><MessageSquare size={18} /></div>
                  <div className="flex-1">
                    <h3 className="font-display font-semibold cs-text-navy text-lg">My stream</h3>
                    <p className="text-sm text-slate-500 mt-1" data-testid="school-msg-stream-summary">
                      <span className="font-semibold cs-text-navy">{unreadCount}</span> unread · <span className="font-semibold">{messages.length}</span> total
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={loadMessages} disabled={msgsLoading} data-testid="school-msg-refresh">
                    {msgsLoading ? "Refreshing…" : "Refresh"}
                  </Button>
                </div>
                <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1" data-testid="school-msg-list">
                  {messages.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center text-sm text-slate-500" data-testid="school-msg-empty">
                      {msgsLoading ? "Loading…" : "No messages yet. Use the composer to send your first one."}
                    </div>
                  ) : messages.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => openMessage(m)}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${m.unread ? "bg-emerald-50/50 border-emerald-200 hover:bg-emerald-50" : "bg-white border-slate-200 hover:bg-slate-50"}`}
                      data-testid={`school-msg-row-${m.id}`}
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
                          <div className="text-sm cs-text-navy line-clamp-3">{m.content}</div>
                          <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-500">
                            {m.attachment_url && <a href={m.attachment_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 cs-text-blue hover:underline"><Paperclip size={11} /> Attachment</a>}
                            <span>{m.created_at ? new Date(m.created_at).toLocaleString() : ""}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {Object.entries(PRICING).map(([k, t]) => {
                const price = t[duration];
                const featured = k === "unified_enterprise";
                const dur = duration;
                return (
                  <div key={k} className={`cs-card p-6 flex flex-col ${featured ? "tier-featured" : ""}`} data-testid={`subscribe-card-${k}`}>
                    <h3 className="font-display font-bold cs-text-navy text-lg">{t.name}</h3>
                    {featured && <span className="inline-block mt-1 text-[10px] uppercase tracking-wider font-bold cs-text-green">★ Most popular</span>}
                    {t.blurb && <p className="text-xs text-slate-500 mt-2 leading-relaxed">{t.blurb}</p>}
                    <div className="mt-4">
                      {price ? (
                        <>
                          <div className="font-display text-3xl font-extrabold cs-text-navy">₦{price.toLocaleString()}</div>
                          <div className="text-[11px] text-slate-500 uppercase tracking-wider mt-1">per school · {DURS.find((d) => d.k === duration)?.l || duration}</div>
                        </>
                      ) : (
                        <div className="text-sm text-slate-400 italic">Full Session only</div>
                      )}
                    </div>
                    {Array.isArray(t.features) && t.features.length > 0 && (
                      <ul className="mt-4 space-y-1.5" data-testid={`subscribe-features-${k}`}>
                        {t.features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-xs text-slate-700">
                            <CheckCircle2 size={13} className="cs-text-green flex-shrink-0 mt-0.5" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <Button
                      disabled={!price}
                      onClick={() => { if (price) { setBankForm((f) => ({ ...f, tier: k, duration: dur, amount_ngn: price })); setBankDlg(true); } }}
                      className={`mt-5 rounded-full text-[11px] sm:text-xs font-semibold whitespace-nowrap px-2.5 sm:px-3 py-1.5 h-auto leading-tight ${price ? "cs-bg-green text-white hover:opacity-90" : "bg-slate-200 text-slate-400 cursor-not-allowed hover:bg-slate-200"}`}
                      data-testid={`subscribe-btn-${k}`}
                    >
                      {price ? <>Pay by bank transfer <ArrowRight size={12} className="ml-1" /></> : "Not available"}
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="mt-8 cs-card p-6">
              <h3 className="font-display font-semibold cs-text-navy text-lg">Already paid by transfer?</h3>
              <p className="text-sm text-slate-500 mt-1">Upload your Nigerian bank transfer receipt — Super Admin verifies within hours and activates your subscription.</p>
              <Button onClick={() => setBankDlg(true)} className="mt-4 cs-bg-navy text-white hover:opacity-90 rounded-full" data-testid="open-bank-dlg">Upload bank receipt</Button>
            </div>
          </TabsContent>

          <TabsContent value="receipts" className="mt-6">
            <h3 className="font-display font-semibold cs-text-navy text-lg mb-4">Bank receipts queue</h3>
            <div className="cs-card overflow-hidden">
              <div className="overflow-x-auto">
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
            </div>
          </TabsContent>
        </Tabs>
        </div>
      </main>

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
        <DialogContent className="max-w-md sm:max-w-lg w-[95vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Upload bank transfer receipt</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl border-2 border-[#28A745] bg-green-50 p-3 sm:p-4" data-testid="bank-details-box">
              <div className="text-[11px] sm:text-xs font-semibold cs-text-green uppercase tracking-wider mb-2">Transfer NGN to</div>
              <div className="grid grid-cols-1 gap-1.5 text-xs sm:text-sm">
                <div className="flex justify-between items-center gap-2"><span className="text-slate-600 shrink-0">Account No.</span><span className="font-mono font-bold cs-text-navy">2936722942</span></div>
                <div className="flex justify-between items-center gap-2"><span className="text-slate-600 shrink-0">Bank</span><span className="font-semibold cs-text-navy text-right">United Bank of Africa (UBA)</span></div>
                <div className="flex justify-between items-start gap-2"><span className="text-slate-600 shrink-0">Account Name</span><span className="font-semibold cs-text-navy text-right leading-tight">Mervyndean Ifeanyichukwu Hilary</span></div>
              </div>
              <div className="mt-3 pt-3 border-t border-green-200 text-[11px] sm:text-[12px] text-slate-700 leading-relaxed">
                <span className="font-semibold cs-text-navy">Add the name of school and sender's name for validation.</span> We're working on our Paystack integration — these details will update soon. For confirmation, WhatsApp or call <a href="tel:+2348141880550" className="font-semibold cs-text-green whitespace-nowrap">+234 814 188 0550</a>.
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Tier</Label>
                <select
                  value={bankForm.tier}
                  onChange={(e) => {
                    const t = e.target.value;
                    const newDur = t === "unified_enterprise" ? "full_session" : bankForm.duration;
                    const newPrice = PRICING[t]?.[newDur] || 0;
                    setBankForm({ ...bankForm, tier: t, duration: newDur, amount_ngn: newPrice });
                  }}
                  className="mt-1 flex h-10 w-full items-center rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#28A745]"
                  data-testid="bank-tier"
                >
                  {Object.entries(PRICING).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Duration</Label>
                <select
                  value={bankForm.duration}
                  onChange={(e) => {
                    const d = e.target.value;
                    const newPrice = PRICING[bankForm.tier]?.[d] || 0;
                    setBankForm({ ...bankForm, duration: d, amount_ngn: newPrice });
                  }}
                  disabled={bankForm.tier === "unified_enterprise"}
                  className="mt-1 flex h-10 w-full items-center rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#28A745] disabled:bg-slate-100 disabled:text-slate-500"
                  data-testid="bank-dur"
                >
                  {DURS.map((d) => {
                    const allowed = PRICING[bankForm.tier]?.[d.k] !== undefined;
                    return <option key={d.k} value={d.k} disabled={!allowed}>{d.l}{allowed ? "" : " — not available"}</option>;
                  })}
                </select>
              </div>
            </div>
            <div><Label>Amount paid (₦)</Label><Input type="number" value={bankForm.amount_ngn} onChange={(e) => setBankForm({ ...bankForm, amount_ngn: parseFloat(e.target.value || "0") })} data-testid="bank-amount" /></div>
            <div>
              <Label>Receipt file</Label>
              <Input type="file" accept="image/*,.pdf" onChange={onReceiptFile} data-testid="bank-file" />
              {bankForm.file_data_url && <div className="text-xs cs-text-green mt-1">Attached.</div>}
            </div>
            <div><Label>School name + Sender's name (for validation) *</Label><Input value={bankForm.note} onChange={(e) => setBankForm({ ...bankForm, note: e.target.value })} placeholder="e.g. Sunrise Academy — paid by Chinedu Eze" data-testid="bank-note" /></div>
          </div>
          <DialogFooter><Button onClick={submitBank} className="cs-bg-green text-white hover:opacity-90" data-testid="bank-submit">Submit receipt</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Subjects dialog */}
      <Dialog open={subjDlg} onOpenChange={setSubjDlg}>
        <DialogContent>
          <DialogHeader><DialogTitle>{subjForm.class_name && classSubjects.find((c) => c.class_name === subjForm.class_name) ? "Edit class subjects" : "Add class subjects"}</DialogTitle></DialogHeader>
          {/* Bulk path — download a template, fill it, upload back */}
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-4 mb-1" data-testid="subj-bulk-block">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-md cs-bg-blue text-white flex items-center justify-center shrink-0"><FileSpreadsheet size={16} /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold cs-text-navy">Bulk import via Excel</div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Long format: one row per <code className="text-[10px] bg-white px-1 rounded border">class_name</code> + <code className="text-[10px] bg-white px-1 rounded border">subject_name</code> pair. Replaces lists for every class found in the file.
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => downloadTemplate("subjects")} data-testid="subj-template-download">
                <FileSpreadsheet size={14} className="mr-1.5" /> Download template
              </Button>
              <label className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md cs-bg-green text-white text-xs font-medium hover:opacity-90 cursor-pointer">
                <Upload size={14} />
                {subjUploading ? "Uploading…" : "Upload filled file"}
                <input
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  disabled={subjUploading}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; bulkUploadSubjects(f); }}
                  data-testid="subj-bulk-upload-input"
                />
              </label>
            </div>
          </div>
          <div className="relative my-3" role="separator">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
            <div className="relative flex justify-center"><span className="bg-white px-2 text-[10px] uppercase tracking-wider text-slate-400">Or enter manually</span></div>
          </div>
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
            <div>
              <Label>Password</Label>
              <div className="flex items-center gap-2">
                <Input value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} data-testid="login-create-pw" />
                <Button type="button" size="sm" variant="outline" title="Regenerate" onClick={() => setLoginForm({ ...loginForm, password: generatePassword() })} data-testid="login-pw-regenerate"><RefreshCw size={14} /></Button>
                <Button type="button" size="sm" variant="outline" title="Copy to clipboard" onClick={async () => { const ok = await copyToClipboard(loginForm.password); toast[ok ? "success" : "error"](ok ? "Password copied" : "Copy failed — select and copy manually"); }} data-testid="login-pw-copy"><Copy size={14} /></Button>
              </div>
              <p className="text-xs text-slate-500 mt-1">Copy this password before saving — you can reset it later but it won't be shown again here.</p>
            </div>
            <p className="text-xs text-slate-500">Share these credentials with the student. They can log in at the main page.</p>
          </div>
          <DialogFooter><Button onClick={submitLogin} className="cs-bg-green text-white hover:opacity-90" data-testid="login-create-submit">Create login</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Passport upload dialog */}
      <Dialog open={!!passportDlg} onOpenChange={(o) => !o && (setPassportDlg(null), setPassportPreview(null))}>
        <DialogContent>
          <DialogHeader><DialogTitle>Passport — {passportDlg?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="aspect-[3/4] w-40 mx-auto border rounded overflow-hidden bg-slate-100 flex items-center justify-center" data-testid="passport-preview-box">
              {passportPreview
                ? <img src={passportPreview} alt="preview" className="w-full h-full object-cover" />
                : passportDlg?.passport_url
                  ? <img src={passportDlg.passport_url} alt="" className="w-full h-full object-cover" />
                  : <div className="text-xs text-slate-400">NO PHOTO</div>}
            </div>
            <Label>Upload new passport</Label>
            <Input type="file" accept="image/*" onChange={(e) => onPassportFile(passportDlg, e)} data-testid="passport-input" />
            {passportPreview && (
              <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1" data-testid="passport-preview-hint">
                Preview ready — click <strong>Confirm &amp; Save Passport</strong> to write it to the student record.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPassportDlg(null); setPassportPreview(null); }} data-testid="passport-cancel">Cancel</Button>
            <Button
              onClick={savePassport}
              disabled={!passportPreview}
              className="cs-bg-green text-white hover:opacity-90 btn-anim"
              data-testid="passport-save"
            >
              Confirm &amp; Save Passport
            </Button>
          </DialogFooter>
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
            <div>
              <Label>Password</Label>
              <div className="flex items-center gap-2">
                <Input value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} data-testid="nu-password" />
                <Button type="button" size="sm" variant="outline" title="Regenerate" onClick={() => setNewUser({ ...newUser, password: generatePassword() })} data-testid="nu-pw-regenerate"><RefreshCw size={14} /></Button>
                <Button type="button" size="sm" variant="outline" title="Copy to clipboard" onClick={async () => { const ok = await copyToClipboard(newUser.password); toast[ok ? "success" : "error"](ok ? "Password copied" : "Copy failed — select and copy manually"); }} data-testid="nu-pw-copy"><Copy size={14} /></Button>
              </div>
              <p className="text-xs text-slate-500 mt-1">Copy this password before saving — you can reset it later but it won't be shown again here.</p>
            </div>
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
