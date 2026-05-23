import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import PasswordInput from "@/components/PasswordInput.jsx";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { KeyRound, CheckCircle2 } from "lucide-react";

/** Reusable Change Password dialog — works in every dashboard. */
export default function ChangePasswordDialog({ open, onOpenChange, onSuccess }) {
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!form.current_password || !form.new_password) {
      toast.error("Please fill all fields");
      return;
    }
    if (form.new_password.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (form.new_password !== form.confirm) {
      toast.error("New password and confirmation don't match");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/change-password", {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      toast.success("Password updated successfully");
      setForm({ current_password: "", new_password: "", confirm: "" });
      onOpenChange?.(false);
      onSuccess?.();
    } catch (e2) {
      toast.error(formatApiError(e2.response?.data?.detail) || e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="change-password-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 cs-text-navy">
            <KeyRound size={18} className="cs-text-blue" /> Change your password
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 mt-2">
          <div>
            <Label htmlFor="cp-current" className="text-xs">Current password</Label>
            <PasswordInput
              id="cp-current"
              value={form.current_password}
              onChange={(e) => setForm({ ...form, current_password: e.target.value })}
              data-testid="cp-current"
              required
            />
          </div>
          <div>
            <Label htmlFor="cp-new" className="text-xs">New password (min 6 chars)</Label>
            <PasswordInput
              id="cp-new"
              value={form.new_password}
              onChange={(e) => setForm({ ...form, new_password: e.target.value })}
              data-testid="cp-new"
              minLength={6}
              required
            />
          </div>
          <div>
            <Label htmlFor="cp-confirm" className="text-xs">Confirm new password</Label>
            <PasswordInput
              id="cp-confirm"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              data-testid="cp-confirm"
              minLength={6}
              required
            />
            {form.confirm && form.new_password !== form.confirm && (
              <p className="text-[11px] text-red-500 mt-1">Passwords don't match</p>
            )}
            {form.confirm && form.new_password === form.confirm && form.new_password.length >= 6 && (
              <p className="text-[11px] cs-text-green mt-1 flex items-center gap-1"><CheckCircle2 size={12} /> Looks good</p>
            )}
          </div>
          <DialogFooter className="mt-4 gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange?.(false)}>Cancel</Button>
            <Button type="submit" disabled={busy} className="cs-bg-green text-white hover:opacity-90" data-testid="cp-submit">
              {busy ? "Saving…" : "Update password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
