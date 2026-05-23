import React, { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { FileSpreadsheet, Upload, Download, Loader2 } from "lucide-react";
import CredentialsModal from "@/components/CredentialsModal.jsx";

/** Bulk upload dialog used by School Admin (teachers/students/parents) and by class teachers (parents only). */
export default function BulkUploadDialog({ open, onOpenChange, role, onUploaded }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // {created, skipped, note}
  const inputRef = useRef(null);

  const config = {
    teacher: {
      title: "Bulk upload teachers",
      blurb: "Upload an Excel file of teachers. Passwords will be auto-generated for blank cells. The admin sees credentials once after upload.",
      template: "/templates/teachers.xlsx",
      filename: "corner-streams-teachers-template.xlsx",
      upload: "/users/bulk-teachers",
    },
    parent: {
      title: "Bulk upload parents",
      blurb: "Upload an Excel file of parents linked to existing students. Passwords are auto-generated and revealed once to the admin.",
      template: "/templates/parents.xlsx",
      filename: "corner-streams-parents-template.xlsx",
      upload: "/users/bulk-parents",
    },
    student: {
      title: "Bulk upload students",
      blurb: "Upload an Excel file of students. A student login (username + password) is auto-created for each row.",
      template: "/templates/students.xlsx",
      filename: "corner-streams-students-template.xlsx",
      upload: "/users/bulk-students",
    },
  }[role || "teacher"];

  const downloadTpl = async () => {
    try {
      const res = await api.get(config.template, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url; a.download = config.filename;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Template downloaded — fill it in and re-upload");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Only .xlsx files are supported");
      e.target.value = "";
      return;
    }
    const form = new FormData();
    form.append("file", file);
    setBusy(true);
    try {
      const { data } = await api.post(config.upload, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult({
        created: data.created || [],
        skipped: data.skipped || [],
        note: data.note || "",
      });
      toast.success(`Upload complete — ${data.created?.length || 0} created, ${data.skipped?.length || 0} skipped`);
      onUploaded?.();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const closeResult = () => {
    setResult(null);
    onOpenChange?.(false);
  };

  return (
    <>
      <Dialog open={open && !result} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg" data-testid={`bulk-upload-${role}-dialog`}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 cs-text-navy">
              <FileSpreadsheet size={18} className="cs-text-blue" /> {config.title}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 -mt-2">{config.blurb}</p>

          <div className="space-y-3 mt-2">
            <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
              <div className="flex items-start gap-3">
                <FileSpreadsheet size={28} className="cs-text-blue mt-1 shrink-0" />
                <div className="flex-1">
                  <h4 className="font-medium cs-text-navy">Step 1 — Download the template</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Open it in Excel or Google Sheets, fill rows, save as .xlsx.</p>
                </div>
                <Button variant="outline" size="sm" onClick={downloadTpl} data-testid={`bulk-${role}-tpl-btn`}>
                  <Download size={14} className="mr-1" /> Template
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-start gap-3">
                <Upload size={24} className="cs-text-green mt-1 shrink-0" />
                <div className="flex-1">
                  <h4 className="font-medium cs-text-navy">Step 2 — Upload your filled file</h4>
                  <p className="text-xs text-slate-500 mt-0.5">We'll create logins and show you the credentials once.</p>
                </div>
                <label className="inline-flex">
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx"
                    onChange={onFileChange}
                    className="hidden"
                    data-testid={`bulk-${role}-file`}
                  />
                  <span className={`inline-flex items-center px-4 h-9 rounded-md text-sm font-medium cursor-pointer ${busy ? "bg-slate-300 text-white" : "cs-bg-green text-white hover:opacity-90"}`}>
                    {busy ? <><Loader2 size={14} className="mr-1 animate-spin" /> Uploading…</> : <><Upload size={14} className="mr-1" /> Choose .xlsx</>}
                  </span>
                </label>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-3">
            <Button variant="ghost" onClick={() => onOpenChange?.(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CredentialsModal
        open={!!result}
        onOpenChange={(o) => !o && closeResult()}
        title={`${config.title} — credentials`}
        created={result?.created || []}
        skipped={result?.skipped || []}
        role={role || "user"}
        note={result?.note || ""}
      />
    </>
  );
}
