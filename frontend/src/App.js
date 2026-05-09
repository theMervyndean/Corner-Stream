import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth.jsx";
import ProtectedRoute from "@/components/ProtectedRoute.jsx";
import { Toaster } from "sonner";

import Landing from "@/pages/Landing.jsx";
import Login from "@/pages/Login.jsx";
import Register from "@/pages/Register.jsx";
import StudentDashboard from "@/pages/StudentDashboard.jsx";
import CBTTake from "@/pages/CBTTake.jsx";
import SchoolAdminDashboard from "@/pages/SchoolAdminDashboard.jsx";
import TeacherDashboard from "@/pages/TeacherDashboard.jsx";
import ParentPortal from "@/pages/ParentPortal.jsx";
import SuperAdmin from "@/pages/SuperAdmin.jsx";
import ReportCard from "@/pages/ReportCard.jsx";
import CheckoutReturn from "@/pages/CheckoutReturn.jsx";

import "@/App.css";

function HomeRoute() {
  const { user } = useAuth();
  if (user === null) return <div className="h-screen flex items-center justify-center text-slate-500">Loading…</div>;
  if (user && user.role === "super_admin") return <Navigate to="/dashboard/super" replace />;
  if (user && user.role === "school_admin") return <Navigate to="/dashboard/school" replace />;
  if (user && user.role === "teacher") return <Navigate to="/dashboard/teacher" replace />;
  if (user && user.role === "parent") return <Navigate to="/dashboard/parent" replace />;
  if (user && user.role === "student") return <Navigate to="/dashboard/student" replace />;
  return <Landing />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster richColors position="top-right" />
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard/school" element={<ProtectedRoute roles={["school_admin"]}><SchoolAdminDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/teacher" element={<ProtectedRoute roles={["teacher"]}><TeacherDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/parent" element={<ProtectedRoute roles={["parent"]}><ParentPortal /></ProtectedRoute>} />
          <Route path="/dashboard/student" element={<ProtectedRoute roles={["student"]}><StudentDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/super" element={<ProtectedRoute roles={["super_admin"]}><SuperAdmin /></ProtectedRoute>} />
          <Route path="/cbt/:examId" element={<ProtectedRoute roles={["student"]}><CBTTake /></ProtectedRoute>} />
          <Route path="/report/:studentId/:term" element={<ProtectedRoute><ReportCard /></ProtectedRoute>} />
          <Route path="/checkout/return" element={<ProtectedRoute><CheckoutReturn /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
