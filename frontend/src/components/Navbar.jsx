import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth.jsx";
import Logo from "@/components/Logo.jsx";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

const ROLE_DASH = {
  super_admin: "/dashboard/super",
  school_admin: "/dashboard/school",
  teacher: "/dashboard/teacher",
  parent: "/dashboard/parent",
  student: "/dashboard/student",
};

export default function Navbar({ variant = "landing" }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const isAuth = user && typeof user === "object";

  return (
    <header className={`w-full ${variant === "dashboard" ? "bg-white border-b border-[#E2E8F0]" : "bg-transparent"}`}>
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
        <Link to="/" data-testid="nav-home-link">
          <Logo />
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium cs-text-navy">
          {variant === "landing" && (
            <>
              <a href="#features" className="hover:cs-text-blue transition-colors" data-testid="nav-features">Features</a>
              <a href="#pricing" className="hover:cs-text-blue transition-colors" data-testid="nav-pricing">Pricing</a>
              <a href="#contact" className="hover:cs-text-blue transition-colors" data-testid="nav-contact">Contact</a>
            </>
          )}
        </nav>
        <div className="flex items-center gap-3">
          {!isAuth ? (
            <>
              <Button variant="ghost" onClick={() => navigate("/login")} data-testid="nav-login-btn">Sign in</Button>
              <Button
                onClick={() => navigate("/register")}
                className="cs-bg-green hover:opacity-90 text-white rounded-full px-5"
                data-testid="nav-register-btn"
              >
                Get started
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => navigate(ROLE_DASH[user.role] || "/")}
                data-testid="nav-dashboard-btn"
              >
                Dashboard
              </Button>
              <Button
                variant="ghost"
                onClick={async () => { await logout(); navigate("/"); }}
                data-testid="nav-logout-btn"
              >
                <LogOut size={16} className="mr-1" /> Sign out
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
