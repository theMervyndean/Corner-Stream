import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Eye, EyeOff, Copy, Download, ShieldAlert, CheckCircle2, XCircle, KeyRound,
} from "lucide-react";

/**
 * One-stop modal for displaying credentials:
 *  - After bulk-upload (created[] + skipped[])
 *  - After single Reveal / Reset (created = [one row])
 *
 * Show-once UX: passwords are masked by default with a "Reveal all" toggle.
 * Admin can copy individual passwords or download the whole batch as Excel.
 */
export default function CredentialsModal({ open, onOpenChange, title, created = [], skipped = [], role = "user", note = "" }) {
  const [showAll, setShowAll] = useState(false);
  const [revealMap, setRevealMap] = useState({});

  const toggleOne = (idx) => setRevealMap((m) => ({ ...m, [idx]: !m[idx] }));

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed — please select and copy manually");
    }
  };

  const downloadExcel = async () => {
    // Lazy-load to keep bundle slim
    const xlsx = await import("xlsx");
    const wsData = [
      ["Name", "Email / Username", "Password", role === "student" ? "Class" : "Linked Student", "Role"],
      ...created.map((c) => [
        c.name,
        c.email || c.username || "",
        c.password || "",
        c.student_name || c.class_name || c.assigned_class || "—",
        c.role || role,
      ]),
    ];
    const ws = xlsx.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 28 }, { wch: 32 }, { wch: 18 }, { wch: 22 }, { wch: 12 }];
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Credentials");
    if (skipped.length) {
      const sk = xlsx.utils.aoa_to_sheet([["Row", "Reason"], ...skipped.map((s) => [s.row, s.reason])]);
      sk["!cols"] = [{ wch: 8 }, { wch: 70 }];
      xlsx.utils.book_append_sheet(wb, sk, "Skipped");
    }
    const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    xlsx.writeFile(wb, `corner-streams-${role}-credentials-${ts}.xlsx`);
    toast.success("Credentials Excel downloaded — store it safely");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" data-testid="credentials-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 cs-text-navy">
            <KeyRound size={18} className="cs-text-blue" /> {title || "Login credentials"}
          </DialogTitle>
        </DialogHeader>

        {note && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2 text-sm text-amber-900">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            <div>{note}</div>
          </div>
        )}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex gap-2 text-sm text-blue-900">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <div>
            <strong>Important:</strong> share these credentials securely. Each user can change their own password from their dashboard.
            Once they do, you'll need to <em>Reset</em> to view a new one.
          </div>
        </div>

        <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <Badge className="cs-bg-green text-white" data-testid="cred-created-count">{created.length} created</Badge>
            {skipped.length > 0 && (
              <Badge variant="outline" className="text-amber-700 border-amber-300" data-testid="cred-skipped-count">{skipped.length} skipped</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowAll((s) => !s)} data-testid="cred-show-all">
              {showAll ? <><EyeOff size={14} className="mr-1" /> Hide all</> : <><Eye size={14} className="mr-1" /> Reveal all</>}
            </Button>
            {created.length > 0 && (
              <Button size="sm" className="cs-bg-blue text-white hover:opacity-90" onClick={downloadExcel} data-testid="cred-download">
                <Download size={14} className="mr-1" /> Download Excel
              </Button>
            )}
          </div>
        </div>

        {created.length > 0 && (
          <div className="border rounded-lg overflow-hidden mt-2 max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="cs-bg-navy hover:cs-bg-navy">
                  <TableHead className="text-white">Name</TableHead>
                  <TableHead className="text-white">Login</TableHead>
                  <TableHead className="text-white">Password</TableHead>
                  <TableHead className="text-white">Linked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {created.map((c, i) => {
                  const visible = showAll || revealMap[i];
                  const pw = c.password || "";
                  return (
                    <TableRow key={i} className={i % 2 ? "bg-slate-50" : ""}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-xs">
                        <div>{c.email || c.username || "—"}</div>
                        {c.username && c.email && <div className="text-slate-500">{c.username}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono">
                            {visible ? pw : pw ? "•".repeat(Math.min(10, pw.length)) : "—"}
                          </code>
                          <button
                            type="button"
                            onClick={() => toggleOne(i)}
                            className="p-1 text-slate-500 hover:cs-text-blue"
                            aria-label={visible ? "Hide" : "Reveal"}
                          >
                            {visible ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          {pw && (
                            <button type="button" onClick={() => copy(pw, "Password")} className="p-1 text-slate-500 hover:cs-text-blue" aria-label="Copy password">
                              <Copy size={12} />
                            </button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {c.student_name ? <span><CheckCircle2 size={10} className="inline cs-text-green mr-1" />{c.student_name}{c.student_class ? ` · ${c.student_class}` : ""}</span> : (c.class_name || c.assigned_class || "—")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {skipped.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-medium text-amber-700 flex items-center gap-1">
              <XCircle size={14} /> {skipped.length} row{skipped.length > 1 ? "s" : ""} skipped — view reasons
            </summary>
            <div className="border rounded-lg overflow-hidden mt-2 max-h-48 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Row</TableHead><TableHead>Reason</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {skipped.map((s, i) => (
                    <TableRow key={i}><TableCell className="font-mono text-xs">{s.row}</TableCell><TableCell className="text-xs">{s.reason}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </details>
        )}

        <DialogFooter className="mt-4">
          <Button onClick={() => onOpenChange?.(false)} className="cs-bg-navy text-white" data-testid="cred-close">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
