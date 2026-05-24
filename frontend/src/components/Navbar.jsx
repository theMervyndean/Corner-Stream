import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth.jsx";
import Logo from "@/components/Logo.jsx";
import { Button } from "@/components/ui/button";
import { LogOut, KeyRound, ShieldCheck, ChevronDown } from "lucide-react";
import ChangePasswordDialog from "@/components/ChangePasswordDialog.jsx";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

const ROLE_DASH = {
  super_admin: "/dashboard/super",
  school_admin: "/dashboard/school",
  teacher: "/dashboard/teacher",
  parent: "/dashboard/parent",
  student: "/dashboard/student",
};

const ROLE_LABEL = {
  super_admin: "Super admin",
  school_admin: "School admin",
  teacher: "Teacher",
  parent: "Parent",
  student: "Student",
};

export default function Navbar({ variant = "landing" }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [cpOpen, setCpOpen] = useState(false);

  const isAuth = user && typeof user === "object";
  const hasAdminPowers = isAuth && (user.role === "school_admin" || user.is_admin);
  const isPromoted = isAuth && user.is_admin && user.role !== "school_admin";

  return (
    <header className={`w-full ${variant === "dashboard" ? "bg-white border-b border-[#E2E8F0] fixed top-0 left-0 right-0 z-40 h-14 shadow-sm" : "bg-transparent"}`}>
      <div className={`${variant === "dashboard" ? "w-full pl-3 pr-4 sm:pl-4 sm:pr-6 h-full" : "max-w-7xl mx-auto px-4 sm:px-6 py-3"} flex items-center justify-between gap-2`}>
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
              {isPromoted && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300" data-testid="nav-admin-badge">
                  <ShieldCheck size={10} /> ADMIN POWERS
                </span>
              )}
              {/* Quick admin-dashboard button for promoted users */}
              {isPromoted && (
                <Button
                  variant="outline" size="sm" className="rounded-full px-3 sm:px-4 hidden sm:inline-flex"
                  onClick={() => navigate("/dashboard/school")}
                  data-testid="nav-admin-dash-btn"
                >
                  <ShieldCheck size={14} className="mr-1" /> Admin
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-full px-3 sm:px-4" data-testid="nav-user-menu">
                    <span className="hidden sm:inline mr-1">{user.name?.split(" ")[0] || "Account"}</span>
                    <ChevronDown size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={6} collisionPadding={8} className="w-56">
                  <DropdownMenuLabel>
                    <div className="font-medium cs-text-navy">{user.name}</div>
                    <div className="text-[11px] text-slate-500 font-normal">{ROLE_LABEL[user.role] || user.role}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate(ROLE_DASH[user.role] || "/")} data-testid="menu-dashboard">
                    My dashboard
                  </DropdownMenuItem>
                  {hasAdminPowers && user.role !== "school_admin" && (
                    <DropdownMenuItem onClick={() => navigate("/dashboard/school")} data-testid="menu-admin-dashboard">
                      <ShieldCheck size={14} className="mr-2" /> Admin dashboard
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setCpOpen(true)} data-testid="menu-change-password">
                    <KeyRound size={14} className="mr-2" /> Change password
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => { await logout(); navigate("/"); }}
                    data-testid="menu-logout"
                    className="text-red-600 focus:text-red-700"
                  >
                    <LogOut size={14} className="mr-2" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      <ChangePasswordDialog open={cpOpen} onOpenChange={setCpOpen} />
    </header>
  );
}
