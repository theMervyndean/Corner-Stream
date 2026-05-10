import React, { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import Navbar from "@/components/Navbar.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PasswordInput from "@/components/PasswordInput.jsx";
import { useAuth } from "@/lib/auth.jsx";
import { toast } from "sonner";
import { Building2, ArrowRight } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    school_name: "", principal_name: "", school_address: "", school_phone: "",
    name: "", email: "", password: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const tier = params.get("tier");
  const duration = params.get("duration");

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await register(form);
      toast.success(`Welcome — ${form.school_name} is live on Corner Streams.`);
      const search = tier && duration ? `?tier=${tier}&duration=${duration}` : "";
      navigate(`/dashboard/school${search}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar variant="landing" />
      <div className="max-w-2xl mx-auto px-6 pt-10 pb-20" data-testid="register-page">
        <div className="cs-card p-8 fade-up">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg cs-bg-green text-white flex items-center justify-center"><Building2 size={22} /></div>
            <div>
              <span className="eyebrow">REGISTER YOUR SCHOOL</span>
              <h1 className="font-display text-3xl font-bold cs-text-navy mt-1">Onboard your school in minutes</h1>
              <p className="text-sm text-slate-500 mt-1">
                You'll be the first school administrator. After signing up you can build the full school profile and create logins for your teachers, parents and students.
              </p>
            </div>
          </div>

          <form onSubmit={submit} className="mt-8 space-y-6">
            <div>
              <div className="eyebrow mb-3">SCHOOL DETAILS</div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div><Label htmlFor="sn">School name *</Label><Input id="sn" required value={form.school_name} onChange={(e) => setForm({ ...form, school_name: e.target.value })} data-testid="register-school-name" /></div>
                <div><Label htmlFor="pn">Principal name</Label><Input id="pn" value={form.principal_name} onChange={(e) => setForm({ ...form, principal_name: e.target.value })} data-testid="register-principal" /></div>
                <div className="sm:col-span-2"><Label htmlFor="sa">Address</Label><Input id="sa" placeholder="Street, City, State" value={form.school_address} onChange={(e) => setForm({ ...form, school_address: e.target.value })} data-testid="register-address" /></div>
                <div><Label htmlFor="sp">Phone / WhatsApp</Label><Input id="sp" placeholder="+234..." value={form.school_phone} onChange={(e) => setForm({ ...form, school_phone: e.target.value })} data-testid="register-phone" /></div>
              </div>
            </div>

            <div>
              <div className="eyebrow mb-3">ADMINISTRATOR ACCOUNT</div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><Label htmlFor="rn">Your full name *</Label><Input id="rn" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="register-name" /></div>
                <div><Label htmlFor="re">Email *</Label><Input id="re" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="register-email" /></div>
                <div>
                  <Label htmlFor="rp">Password *</Label>
                  <PasswordInput id="rp" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="register-password" />
                </div>
              </div>
            </div>

            <Button type="submit" disabled={submitting} className="cs-bg-green hover:opacity-90 text-white w-full rounded-full h-12 btn-anim text-base" data-testid="register-submit">
              {submitting ? "Creating your school…" : (<>Create my school <ArrowRight size={16} className="ml-2" /></>)}
            </Button>
          </form>

          <div className="text-sm text-slate-500 mt-6 text-center">
            Already have an account? <Link to="/login" className="cs-text-blue font-semibold">Sign in</Link>
          </div>
        </div>

        <div className="mt-6 text-xs text-slate-500 text-center">
          Are you a teacher, parent or student? Your school's administrator will create your login from inside the dashboard.
        </div>
      </div>
    </div>
  );
}
