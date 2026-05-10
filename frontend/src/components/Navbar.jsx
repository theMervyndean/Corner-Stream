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
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 py-4 gap-2">
        <Link to="/" data-testid="nav-home-link" className="flex items-center gap-2 min-w-0">
          <Logo />
          <span className="hidden sm:inline text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 shrink-0" data-testid="nav-beta-badge">BETA</span>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium cs-text-navy">
          {variant === "landing" && (
            <>
              <a href="#features" className="hover:cs-text-blue transition-colors" data-testid="nav-features">Features</a>
              <a href="#samples" className="hover:cs-text-blue transition-colors" data-testid="nav-samples">Samples</a>
              <a href="#about" className="hover:cs-text-blue transition-colors" data-testid="nav-about">About</a>
              <a href="#pricing" className="hover:cs-text-blue transition-colors" data-testid="nav-pricing">Pricing</a>
              <a href="#contact" className="hover:cs-text-blue transition-colors" data-testid="nav-contact">Contact</a>
            </>
          )}
        </nav>
        <div className="flex items-center gap-1 sm:gap-3 shrink-0">
          {!isAuth ? (
            <>
              <Button variant="ghost" size="sm" className="px-2 sm:px-4" onClick={() => navigate("/login")} data-testid="nav-login-btn">Sign in</Button>
              <Button
                size="sm"
                onClick={() => navigate("/register")}
                className="cs-bg-green hover:opacity-90 text-white rounded-full px-3 sm:px-5"
                data-testid="nav-register-btn"
              >
                Get started
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full px-3 sm:px-4"
                onClick={() => navigate(ROLE_DASH[user.role] || "/")}
                data-testid="nav-dashboard-btn"
              >
                Dashboard
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="px-2 sm:px-4"
                onClick={async () => { await logout(); navigate("/"); }}
                data-testid="nav-logout-btn"
              >
                <LogOut size={16} className="sm:mr-1" /> <span className="hidden sm:inline">Sign out</span>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
