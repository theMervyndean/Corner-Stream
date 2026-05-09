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
  AlertTriangle, CreditCard,
} from "lucide-react";

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

  const refresh = async () => {
    try {
      const [sRes, stRes, rRes] = await Promise.all([
        api.get("/schools/me"),
        api.get("/students"),
        api.get("/payments/bank-receipts"),
      ]);
      setSchool(sRes.data.school);
      setStudents(stRes.data.students || []);
      setReceipts(rRes.data.receipts || []);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };
  useEffect(() => { refresh(); }, []);

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
          <TabsList className="grid grid-cols-4 w-full max-w-2xl">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="students" data-testid="tab-students">Students</TabsTrigger>
            <TabsTrigger value="subscription" data-testid="tab-subscription">Subscription</TabsTrigger>
            <TabsTrigger value="receipts" data-testid="tab-receipts">Bank receipts</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 grid md:grid-cols-2 gap-6">
            <div className="cs-card p-6">
              <h3 className="font-display font-semibold cs-text-navy text-lg">Quick actions</h3>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Button onClick={() => setStudentDlg(true)} className="cs-bg-navy hover:opacity-90 text-white" data-testid="quick-add-student"><Plus size={16} className="mr-1" /> Add student</Button>
                <label className="cursor-pointer">
                  <input type="file" accept=".xlsx" className="hidden" onChange={onUpload} data-testid="quick-bulk-upload" />
                  <span className="inline-flex items-center justify-center w-full h-9 rounded-md cs-bg-blue text-white text-sm font-medium hover:opacity-90"><Upload size={16} className="mr-1" /> Bulk upload .xlsx</span>
                </label>
                <Button variant="outline" onClick={() => setTab("subscription")} data-testid="quick-pay"><CreditCard size={16} className="mr-1" /> Pay subscription</Button>
                <Button variant="outline" onClick={() => setTab("receipts")} data-testid="quick-receipts"><Receipt size={16} className="mr-1" /> Bank receipts</Button>
              </div>
            </div>
            <div className="cs-card p-6">
              <h3 className="font-display font-semibold cs-text-navy text-lg">Excel bulk upload format</h3>
              <p className="text-sm text-slate-500 mt-2">Required columns (row 1):</p>
              <code className="block mt-2 text-xs bg-slate-50 rounded p-3 border">name | age | gender | class_name | parent_email (optional) | balance_due (optional)</code>
              <p className="text-xs text-slate-500 mt-3">parent_email links a student to a Parent Portal user. balance_due triggers Debt Lock.</p>
            </div>
          </TabsContent>

          <TabsContent value="students" className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold cs-text-navy text-lg">Students</h3>
              <div className="flex gap-3">
                <label className="cursor-pointer">
                  <input type="file" accept=".xlsx" className="hidden" onChange={onUpload} data-testid="students-bulk-upload" />
                  <span className="inline-flex items-center px-4 h-9 rounded-md cs-bg-blue text-white text-sm font-medium hover:opacity-90"><Upload size={16} className="mr-1" /> Upload .xlsx</span>
                </label>
                <Button onClick={() => setStudentDlg(true)} className="cs-bg-green text-white hover:opacity-90" data-testid="students-add-btn"><Plus size={16} className="mr-1" /> Add student</Button>
              </div>
            </div>
            <div className="cs-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="cs-bg-navy hover:cs-bg-navy">
                    <TableHead className="text-white">Name</TableHead>
                    <TableHead className="text-white">Class</TableHead>
                    <TableHead className="text-white">Age</TableHead>
                    <TableHead className="text-white">Gender</TableHead>
                    <TableHead className="text-white">Parent email</TableHead>
                    <TableHead className="text-white">Balance (₦)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((s, i) => (
                    <TableRow key={s.id} className={i % 2 ? "bg-slate-50" : ""} data-testid={`student-row-${i}`}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.class_name}</TableCell>
                      <TableCell>{s.age}</TableCell>
                      <TableCell>{s.gender}</TableCell>
                      <TableCell className="text-slate-500">{s.parent_email || "—"}</TableCell>
                      <TableCell>
                        {s.balance_due > 0 ? <span className="text-red-600 font-semibold">₦{s.balance_due.toLocaleString()}</span> : <span className="cs-text-green">Clear</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!students.length && (
                    <TableRow><TableCell colSpan={6} className="text-center text-slate-500 py-8">No students yet. Add one or upload an Excel file.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
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
            <div><Label>Class</Label><Input value={newStudent.class_name} onChange={(e) => setNewStudent({ ...newStudent, class_name: e.target.value })} data-testid="ns-class" /></div>
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
    </div>
  );
}
