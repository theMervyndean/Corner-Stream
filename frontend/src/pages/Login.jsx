import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Navbar from "@/components/Navbar.jsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth.jsx";
import { toast } from "sonner";

const ROLE_DASH = {
  super_admin: "/dashboard/super",
  school_admin: "/dashboard/school",
  teacher: "/dashboard/teacher",
  parent: "/dashboard/parent",
};

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const u = await login(email, password);
      toast.success(`Welcome back, ${u.name}`);
      navigate(ROLE_DASH[u.role] || "/");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar variant="landing" />
      <div className="max-w-md mx-auto px-6 pt-10 pb-20" data-testid="login-page">
        <div className="cs-card p-8">
          <span className="eyebrow">SIGN IN</span>
          <h1 className="font-display text-3xl font-bold cs-text-navy mt-2">Welcome back</h1>
          <p className="text-sm text-slate-500 mt-2">Pick up where you left off.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="login-email" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} data-testid="login-password" />
            </div>
            <Button type="submit" disabled={submitting} className="cs-bg-navy hover:opacity-90 text-white w-full rounded-full h-11" data-testid="login-submit">
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <div className="text-sm text-slate-500 mt-6 text-center">
            New to Corner Streams? <Link to="/register" className="cs-text-blue font-semibold">Create account</Link>
          </div>
          <div className="mt-6 text-xs text-slate-400 border-t pt-4">
            <div className="font-semibold cs-text-navy mb-2 text-sm">Demo accounts</div>
            <div>super@cornerstreams.com / Super@123</div>
            <div>admin@demo.school / Admin@123</div>
            <div>teacher@demo.school / Teacher@123</div>
            <div>parent@demo.school / Parent@123</div>
          </div>
        </div>
      </div>
    </div>
  );
}
