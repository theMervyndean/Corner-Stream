import React, { useEffect, useState, useMemo } from "react";
import Navbar from "@/components/Navbar.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth.jsx";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import StarRating from "@/components/StarRating.jsx";
import { Save } from "lucide-react";

const SUBJECTS = ["Mathematics", "English Language", "Basic Science", "Social Studies", "Civic Education", "Computer Studies"];
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

  const refresh = async () => {
    try {
      const { data } = await api.get("/students");
      setStudents(data.students || []);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };
  useEffect(() => { refresh(); }, []);

  const classes = useMemo(() => Array.from(new Set(students.map((s) => s.class_name))).sort(), [students]);
  const filtered = useMemo(() => students.filter((s) => !classFilter || s.class_name === classFilter), [students, classFilter]);

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

  // Reload when term changes
  useEffect(() => { if (selected) loadStudentScores(selected); }, [term]); // eslint-disable-line

  const saveAll = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const items = SUBJECTS
        .filter((s) => scoreMap[s])
        .map((s) => ({
          student_id: selected.id, term, year, subject: s,
          ca_score: Number(scoreMap[s].ca || 0),
          exam_score: Number(scoreMap[s].exam || 0),
        }));
      if (items.length) await api.post("/scores/batch", { items });
      for (const skill of SKILLS) {
        if (skillMap[skill]) {
          await api.post("/scores/skills", {
            student_id: selected.id, term, year, skill_name: skill, rating: skillMap[skill],
          });
        }
      }
      toast.success("Saved successfully");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar variant="dashboard" />
      <div className="max-w-7xl mx-auto px-6 py-8" data-testid="teacher-dashboard">
        <span className="eyebrow">TEACHER PORTAL</span>
        <h1 className="font-display text-3xl font-bold cs-text-navy mt-1">Hello, {user?.name}</h1>
        <p className="text-sm text-slate-500 mt-1">Enter CA + Exam scores and skill ratings. Auto-graded on save.</p>

        <div className="mt-6 cs-card p-5 grid sm:grid-cols-3 gap-4">
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

        <div className="mt-8 grid lg:grid-cols-[320px_1fr] gap-6">
          {/* Roster */}
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

          {/* Editor */}
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
                    <TabsTrigger value="academic" data-testid="tab-academic">Academic scores</TabsTrigger>
                    <TabsTrigger value="skills" data-testid="tab-skills">Skill ratings</TabsTrigger>
                  </TabsList>
                  <TabsContent value="academic" className="mt-4">
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
                          {SUBJECTS.map((s) => {
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
      </div>
    </div>
  );
}
