import React, { useEffect, useState } from "react";
import Navbar from "@/components/Navbar.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Building2, Users, Inbox, AlertTriangle, Receipt, KeyRound, Eye } from "lucide-react";

export default function SuperAdmin() {
  const [stats, setStats] = useState(null);
  const [schools, setSchools] = useState([]);
  const [leads, setLeads] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [override, setOverride] = useState({ user_email: "", new_password: "" });
  const [viewReceipt, setViewReceipt] = useState(null);

  const refresh = async () => {
    try {
      const [s, sc, l, r] = await Promise.all([
        api.get("/superadmin/stats"),
        api.get("/superadmin/schools"),
        api.get("/leads"),
        api.get("/payments/bank-receipts"),
      ]);
      setStats(s.data);
      setSchools(sc.data.schools || []);
      setLeads(l.data.leads || []);
      setReceipts(r.data.receipts || []);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };
  useEffect(() => { refresh(); }, []);

  const toggleKill = async (id, current) => {
    try {
      await api.post(`/superadmin/schools/${id}/kill-switch`, { kill_switch: !current });
      toast.success(`Kill-switch ${!current ? "ENGAGED" : "released"}`);
      refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  const submitOverride = async () => {
    try {
      await api.post("/superadmin/password-override", override);
      toast.success("Password updated");
      setOverrideOpen(false);
      setOverride({ user_email: "", new_password: "" });
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  const resolveLead = async (id) => {
    try { await api.put(`/leads/${id}/resolve`); toast.success("Lead resolved"); refresh(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  const decideReceipt = async (id, decision) => {
    try {
      await api.post(`/payments/bank-receipts/${id}/decision`, { decision });
      toast.success(decision === "approve" ? "Receipt approved & subscription activated" : "Receipt rejected");
      refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  const openReceipt = async (id) => {
    try {
      const { data } = await api.get(`/payments/bank-receipts/${id}`);
      setViewReceipt(data.receipt);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  return (
    <div className="min-h-screen">
      <Navbar variant="dashboard" />
      <div className="max-w-7xl mx-auto px-6 py-8" data-testid="super-admin">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="eyebrow">GOD MODE</span>
            <h1 className="font-display text-3xl font-bold cs-text-navy mt-1">Super Admin Console</h1>
            <p className="text-sm text-slate-500 mt-1">Global control over Corner Streams.</p>
          </div>
          <Button onClick={() => setOverrideOpen(true)} className="cs-bg-navy text-white hover:opacity-90 rounded-full" data-testid="open-pw-override"><KeyRound size={14} className="mr-2" /> Password override</Button>
        </div>

        {stats && (
          <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-8">
            {[
              { i: Building2, l: "Schools", v: stats.schools },
              { i: Users, l: "Users", v: stats.users },
              { i: Users, l: "Students", v: stats.students },
              { i: Inbox, l: "Leads", v: stats.leads },
              { i: AlertTriangle, l: "Open leads", v: stats.open_leads },
              { i: Receipt, l: "Pending receipts", v: stats.pending_receipts },
            ].map((s, i) => {
              const Icon = s.i;
              return (
                <div key={i} className="cs-card p-4 flex items-center gap-3" data-testid={`super-stat-${i}`}>
                  <div className="w-9 h-9 rounded-md cs-bg-navy text-white flex items-center justify-center"><Icon size={16} /></div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">{s.l}</div>
                    <div className="font-display text-xl font-bold cs-text-navy">{s.v}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Tabs defaultValue="schools" className="mt-10">
          <TabsList>
            <TabsTrigger value="schools" data-testid="super-tab-schools">Schools</TabsTrigger>
            <TabsTrigger value="receipts" data-testid="super-tab-receipts">Bank receipts</TabsTrigger>
            <TabsTrigger value="leads" data-testid="super-tab-leads">Leads</TabsTrigger>
          </TabsList>
          <TabsContent value="schools" className="mt-4">
            <div className="cs-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="cs-bg-navy hover:cs-bg-navy">
                    <TableHead className="text-white">School</TableHead>
                    <TableHead className="text-white">Tier</TableHead>
                    <TableHead className="text-white">Duration</TableHead>
                    <TableHead className="text-white">Students</TableHead>
                    <TableHead className="text-white">Users</TableHead>
                    <TableHead className="text-white">Kill-switch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schools.map((s, i) => (
                    <TableRow key={s.id} className={i % 2 ? "bg-slate-50" : ""} data-testid={`super-school-row-${s.id}`}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.subscription_tier || "—"}</TableCell>
                      <TableCell>{s.subscription_duration || "—"}</TableCell>
                      <TableCell>{s.student_count}</TableCell>
                      <TableCell>{s.user_count}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch checked={!!s.kill_switch} onCheckedChange={() => toggleKill(s.id, s.kill_switch)} data-testid={`kill-switch-${s.id}`} />
                          {s.kill_switch && <Badge className="bg-red-500 text-white">ENGAGED</Badge>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="receipts" className="mt-4">
            <div className="cs-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="cs-bg-navy hover:cs-bg-navy">
                    <TableHead className="text-white">School</TableHead>
                    <TableHead className="text-white">Tier</TableHead>
                    <TableHead className="text-white">Amount (₦)</TableHead>
                    <TableHead className="text-white">Status</TableHead>
                    <TableHead className="text-white">Submitted</TableHead>
                    <TableHead className="text-white">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.map((r, i) => (
                    <TableRow key={r.id} className={i % 2 ? "bg-slate-50" : ""} data-testid={`super-receipt-row-${r.id}`}>
                      <TableCell className="text-xs">{schools.find((s) => s.id === r.school_id)?.name || r.school_id}</TableCell>
                      <TableCell>{r.tier}</TableCell>
                      <TableCell>₦{Number(r.amount_ngn).toLocaleString()}</TableCell>
                      <TableCell><Badge className={r.status === "approved" ? "cs-bg-green text-white" : r.status === "rejected" ? "bg-red-500 text-white" : "bg-amber-500 text-white"}>{r.status}</Badge></TableCell>
                      <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                      <TableCell className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openReceipt(r.id)} data-testid={`view-receipt-${r.id}`}><Eye size={14} /></Button>
                        {r.status === "pending" && (
                          <>
                            <Button size="sm" className="cs-bg-green text-white hover:opacity-90" onClick={() => decideReceipt(r.id, "approve")} data-testid={`approve-receipt-${r.id}`}>Approve</Button>
                            <Button size="sm" variant="destructive" onClick={() => decideReceipt(r.id, "reject")} data-testid={`reject-receipt-${r.id}`}>Reject</Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!receipts.length && (<TableRow><TableCell colSpan={6} className="text-center text-slate-500 py-8">No receipts.</TableCell></TableRow>)}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="leads" className="mt-4">
            <div className="cs-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="cs-bg-navy hover:cs-bg-navy">
                    <TableHead className="text-white">Name</TableHead>
                    <TableHead className="text-white">Email</TableHead>
                    <TableHead className="text-white">School</TableHead>
                    <TableHead className="text-white">Message</TableHead>
                    <TableHead className="text-white">Status</TableHead>
                    <TableHead className="text-white">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((l, i) => (
                    <TableRow key={l.id} className={i % 2 ? "bg-slate-50" : ""} data-testid={`super-lead-row-${l.id}`}>
                      <TableCell className="font-medium">{l.name}</TableCell>
                      <TableCell className="text-xs">{l.email}</TableCell>
                      <TableCell className="text-xs">{l.school_name || "—"}</TableCell>
                      <TableCell className="text-xs max-w-xs truncate">{l.message}</TableCell>
                      <TableCell>{l.resolved ? <Badge className="cs-bg-green text-white">Resolved</Badge> : <Badge className="bg-amber-500 text-white">Open</Badge>}</TableCell>
                      <TableCell>{!l.resolved && <Button size="sm" onClick={() => resolveLead(l.id)} data-testid={`resolve-lead-${l.id}`}>Resolve</Button>}</TableCell>
                    </TableRow>
                  ))}
                  {!leads.length && (<TableRow><TableCell colSpan={6} className="text-center text-slate-500 py-8">No leads yet.</TableCell></TableRow>)}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Password override</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>User email</Label><Input value={override.user_email} onChange={(e) => setOverride({ ...override, user_email: e.target.value })} data-testid="po-email" /></div>
            <div><Label>New password</Label><Input type="password" value={override.new_password} onChange={(e) => setOverride({ ...override, new_password: e.target.value })} data-testid="po-pw" /></div>
          </div>
          <DialogFooter><Button onClick={submitOverride} className="cs-bg-navy text-white hover:opacity-90" data-testid="po-submit">Update password</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewReceipt} onOpenChange={(o) => !o && setViewReceipt(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bank transfer receipt</DialogTitle></DialogHeader>
          {viewReceipt && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500">From: {viewReceipt.submitted_by} · ₦{Number(viewReceipt.amount_ngn).toLocaleString()} · {viewReceipt.tier}</div>
              {viewReceipt.file_data_url?.startsWith("data:image") ? (
                <img src={viewReceipt.file_data_url} alt="receipt" className="max-h-[400px] rounded border" />
              ) : (
                <a href={viewReceipt.file_data_url} target="_blank" rel="noreferrer" className="cs-text-blue underline">Open file</a>
              )}
              {viewReceipt.note && <div className="text-sm text-slate-600">Note: {viewReceipt.note}</div>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
