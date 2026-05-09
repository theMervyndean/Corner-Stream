import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import Navbar from "@/components/Navbar.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth.jsx";
import { api } from "@/lib/api";
import { toast } from "sonner";

const ROLE_DASH = {
  school_admin: "/dashboard/school",
  teacher: "/dashboard/teacher",
  parent: "/dashboard/parent",
};

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [role, setRole] = useState("school_admin");
  const [form, setForm] = useState({ name: "", email: "", password: "", school_name: "", school_id: "" });
  const [schools, setSchools] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const tier = params.get("tier");
  const duration = params.get("duration");

  useEffect(() => {
    api.get("/auth/schools-public").then(({ data }) => setSchools(data.schools || []));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { name: form.name, email: form.email, password: form.password, role };
      if (role === "school_admin") payload.school_name = form.school_name;
      else payload.school_id = form.school_id;
      const u = await register(payload);
      toast.success(`Welcome, ${u.name}`);
      const dest = ROLE_DASH[u.role] || "/";
      const search = tier && duration ? `?tier=${tier}&duration=${duration}` : "";
      navigate(`${dest}${search}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar variant="landing" />
      <div className="max-w-md mx-auto px-6 pt-10 pb-20" data-testid="register-page">
        <div className="cs-card p-8">
          <span className="eyebrow">CREATE ACCOUNT</span>
          <h1 className="font-display text-3xl font-bold cs-text-navy mt-2">Join Corner Streams</h1>
          <p className="text-sm text-slate-500 mt-2">Choose how you'll use the platform.</p>

          <Tabs value={role} onValueChange={setRole} className="mt-6">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="school_admin" data-testid="role-tab-school_admin">School</TabsTrigger>
              <TabsTrigger value="teacher" data-testid="role-tab-teacher">Teacher</TabsTrigger>
              <TabsTrigger value="parent" data-testid="role-tab-parent">Parent</TabsTrigger>
            </TabsList>
            <TabsContent value="school_admin" className="mt-4">
              <p className="text-xs text-slate-500">Register your school and become its administrator.</p>
            </TabsContent>
            <TabsContent value="teacher" className="mt-4">
              <p className="text-xs text-slate-500">Pick the school that already onboarded you.</p>
            </TabsContent>
            <TabsContent value="parent" className="mt-4">
              <p className="text-xs text-slate-500">Pick your child's school to access reports.</p>
            </TabsContent>
          </Tabs>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="rname">Full name</Label>
              <Input id="rname" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="register-name" />
            </div>
            <div>
              <Label htmlFor="remail">Email</Label>
              <Input id="remail" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="register-email" />
            </div>
            <div>
              <Label htmlFor="rpw">Password</Label>
              <Input id="rpw" type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="register-password" />
            </div>
            {role === "school_admin" ? (
              <div>
                <Label htmlFor="rschool">School name</Label>
                <Input id="rschool" required value={form.school_name} onChange={(e) => setForm({ ...form, school_name: e.target.value })} data-testid="register-school-name" />
              </div>
            ) : (
              <div>
                <Label>School</Label>
                <Select value={form.school_id} onValueChange={(v) => setForm({ ...form, school_id: v })}>
                  <SelectTrigger data-testid="register-school-select"><SelectValue placeholder="Pick a school" /></SelectTrigger>
                  <SelectContent>
                    {schools.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button type="submit" disabled={submitting} className="cs-bg-green hover:opacity-90 text-white w-full rounded-full h-11" data-testid="register-submit">
              {submitting ? "Creating…" : "Create account"}
            </Button>
          </form>
          <div className="text-sm text-slate-500 mt-6 text-center">
            Already have an account? <Link to="/login" className="cs-text-blue font-semibold">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
