import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth.jsx";

export default function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();

  if (user === null) {
    return (
      <div className="h-screen flex items-center justify-center" data-testid="route-loading">
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (roles && roles.length && !roles.includes(user.role)) {
    // Promoted users with is_admin flag can access school_admin routes too.
    if (roles.includes("school_admin") && user.is_admin) {
      return children;
    }
    return <Navigate to="/" replace />;
  }

  return children;
}
