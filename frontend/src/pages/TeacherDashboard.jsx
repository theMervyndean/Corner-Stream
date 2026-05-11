import React, { useEffect, useMemo, useState } from "react";
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
import { Save, Plus, Trash2, FileText, CheckCircle2, Eye, Image as ImageIcon, X, FileSpreadsheet, Users } from "lucide-react";
import BulkUploadDialog from "@/components/BulkUploadDialog.jsx";

const SKILLS = ["Punctuality", "Attentiveness", "Neatness", "Honesty", "Sportsmanship", "Leadership"];
const TERMS = ["1st Term", "2nd Term", "3rd Term"];

export default function TeacherDashboard() {
  const { user } = useAuth();
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
  const [attemptsDlg, setAttemptsDlg] = useState(null); // exam_id
  const [parentBulkOpen, setParentBulkOpen] = useState(false);

  const myClasses = useMemo(() => {
    const list = [];
    if (user?.assigned_classes && user.assigned_classes.length) list.push(...user.assigned_classes);
    else if (user?.assigned_class) list.push(user.assigned_class);
    return Array.from(new Set(list));
  }, [user]);

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

  const loadStudentScores = async (st) => {
    setSelected(st);
    try {
      const { data } = await api.get(`/scores`, { params: { student_id: st.id, term } });
      const sm = {};
      (data.scores || []).forEach((s) => { sm[s.subject] = { ca: s.ca_score, exam: s.exam_score }; });
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
      const items = subjectsForSelected.filter((s) => scoreMap[s]).map((s) => ({
        student_id: selected.id, term, year, subject: s,
        ca_score: Number(scoreMap[s].ca || 0),
        exam_score: Number(scoreMap[s].exam || 0),
      }));
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
    // Re-anchor correct_idx if it was on/after removed option
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
      await api.put(`/cbt/exams/${e.id}`, { published: !e.published });
      toast.success(!e.published ? "Published" : "Unpublished");
      refresh();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail) || err.message); }
  };

  const deleteExam = async (id) => {
    if (!window.confirm("Delete this exam and all attempts?")) return;
    try { await api.delete(`/cbt/exams/${id}`); refresh(); toast.success("Deleted"); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail) || err.message); }
  };

  return (
    <div className="min-h-screen">
      <Navbar variant="dashboard" />
      <div className="max-w-7xl mx-auto px-6 py-8" data-testid="teacher-dashboard">
        <span className="eyebrow">TEACHER PORTAL</span>
        <h1 className="font-display text-3xl font-bold cs-text-navy mt-1">Hello, {user?.name}</h1>
        <p className="text-sm text-slate-500 mt-1">Enter scores & skill ratings — and create CBT exams that auto-grade.</p>

        <Tabs defaultValue="scores" className="mt-6">
          <TabsList>
            <TabsTrigger value="scores" data-testid="t-tab-scores">Score entry</TabsTrigger>
            <TabsTrigger value="cbt" data-testid="t-tab-cbt">CBT exams</TabsTrigger>
            <TabsTrigger value="parents" data-testid="t-tab-parents">Parents</TabsTrigger>
          </TabsList>

          <TabsContent value="scores" className="mt-6">
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
                        <div className="overflow-hidden rounded-lg border">
                          <Table>
                            <TableHeader>
                              <TableRow className="cs-bg-navy hover:cs-bg-navy">
                                <TableHead className="text-white">Subject</TableHead>
                                <TableHead className="text-white w-32">CA (40)</TableHead>
                                <TableHead className="text-white w-32">Exam (60)</TableHead>
                                <TableHead className="text-white w-32">Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {subjectsForSelected.map((s) => {
                                const v = scoreMap[s] || { ca: "", exam: "" };
                                const total = (Number(v.ca) || 0) + (Number(v.exam) || 0);
                                return (
                                  <TableRow key={s}>
                                    <TableCell className="font-medium">{s}</TableCell>
                                    <TableCell><Input type="number" max={40} value={v.ca} onChange={(e) => setScoreMap({ ...scoreMap, [s]: { ...v, ca: e.target.value } })} data-testid={`ca-${s}`} /></TableCell>
                                    <TableCell><Input type="number" max={60} value={v.exam} onChange={(e) => setScoreMap({ ...scoreMap, [s]: { ...v, exam: e.target.value } })} data-testid={`exam-${s}`} /></TableCell>
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
          </TabsContent>

          <TabsContent value="cbt" className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold cs-text-navy text-lg">CBT exam library</h3>
              <Button onClick={openCreateExam} className="cs-bg-green text-white hover:opacity-90 rounded-full" data-testid="cbt-new-exam"><Plus size={14} className="mr-1" /> New exam</Button>
            </div>
            <div className="cs-card overflow-hidden">
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
                  {exams.map((e, i) => (
                    <TableRow key={e.id} className={i % 2 ? "bg-slate-50" : ""} data-testid={`exam-row-${e.id}`}>
                      <TableCell className="font-medium">{e.title}</TableCell>
                      <TableCell>{e.class_name}</TableCell>
                      <TableCell>{e.subject}</TableCell>
                      <TableCell>{e.term}</TableCell>
                      <TableCell>{e.questions?.length}</TableCell>
                      <TableCell>{e.duration_min}</TableCell>
                      <TableCell>{e.published ? <Badge className="cs-bg-green text-white">Published</Badge> : <Badge className="bg-slate-400 text-white">Draft</Badge>}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEditExam(e)} data-testid={`exam-edit-${e.id}`}>Edit</Button>
                          <Button size="sm" className={e.published ? "bg-amber-500 text-white" : "cs-bg-blue text-white"} onClick={() => togglePublish(e)} data-testid={`exam-publish-${e.id}`}>{e.published ? "Unpublish" : "Publish"}</Button>
                          <Button size="sm" variant="outline" onClick={() => setAttemptsDlg(e)} data-testid={`exam-attempts-${e.id}`}><Eye size={12} /></Button>
                          <Button size="sm" variant="destructive" onClick={() => deleteExam(e.id)} data-testid={`exam-delete-${e.id}`}><Trash2 size={12} /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!exams.length && (<TableRow><TableCell colSpan={8} className="text-center text-slate-500 py-8">No exams. Click <strong>New exam</strong> to create one.</TableCell></TableRow>)}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="parents" className="mt-6">
            <div className="cs-card p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-11 h-11 rounded-lg cs-bg-blue text-white flex items-center justify-center shrink-0"><Users size={20} /></div>
                <div className="flex-1">
                  <h3 className="font-display font-semibold cs-text-navy text-lg">Bulk upload parents for your class{myClasses.length > 1 ? "es" : ""}</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Class teacher: <strong className="cs-text-navy">{user?.name}</strong>
                    {myClasses.length > 0 && <> · Assigned to <strong className="cs-text-navy">{myClasses.join(", ")}</strong></>}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 mb-4">
                <div className="font-medium mb-1">How this works</div>
                <ul className="list-disc ml-5 space-y-0.5 text-[13px]">
                  <li>Download the parents template, fill in parent name + email + your students' names and class.</li>
                  <li>Upload it back — the system creates the parent login accounts.</li>
                  <li>Only the school admin can see the generated passwords — they distribute to parents securely.</li>
                  <li>Rows pointing to students <em>not on your class roster</em> will be skipped (you'll see the reasons).</li>
                </ul>
              </div>
              <Button onClick={() => setParentBulkOpen(true)} className="cs-bg-green text-white hover:opacity-90 btn-anim" data-testid="teacher-bulk-parents-btn" disabled={myClasses.length === 0}>
                <FileSpreadsheet size={16} className="mr-2" /> Upload parents for {myClasses.length === 1 ? myClasses[0] : "my class"}
              </Button>
              {myClasses.length === 0 && (
                <p className="text-xs text-amber-700 mt-2">⚠️ You don't have any assigned classes yet — ask your school admin to assign one.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

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
                      <button type="button" onClick={() => updateQuestion(qi, { image_url: "" })} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5" data-testid={`ex-q-img-remove-${qi}`}><X size={12} /></button>
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
                              <X size={14} />
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

function ExamAttemptsTable({ examId }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api.get(`/cbt/exams/${examId}/attempts`).then(({ data }) => setRows(data.attempts))
      .catch((e) => toast.error(formatApiError(e.response?.data?.detail) || e.message));
  }, [examId]);
  if (!rows) return <div className="text-sm text-slate-500">Loading…</div>;
  if (!rows.length) return <div className="text-sm text-slate-500">No attempts yet.</div>;
  return (
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
  );
}
