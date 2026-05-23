import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, formatApiError } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = not auth, object = auth
  const [error, setError] = useState("");

  const fetchMe = useCallback(async () => {
    const token = localStorage.getItem("cs_token");
    if (!token) {
      setUser(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
    } catch {
      localStorage.removeItem("cs_token");
      setUser(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = async (email, password) => {
    setError("");
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("cs_token", data.token);
      setUser(data.user);
      return data.user;
    } catch (e) {
      const msg = formatApiError(e.response?.data?.detail) || e.message;
      setError(msg);
      throw new Error(msg);
    }
  };

  const register = async (payload) => {
    setError("");
    try {
      const { data } = await api.post("/auth/register", payload);
      // If backend signals payment-verification pending, do NOT auto-login.
      // Caller will navigate to /pending with the returned school info.
      if (data && data.pending_verification) {
        return { pending: true, school_id: data.school_id, school_email: data.school_email, school_name: data.school_name, message: data.message };
      }
      localStorage.setItem("cs_token", data.token);
      setUser(data.user);
      return data.user;
    } catch (e) {
      const msg = formatApiError(e.response?.data?.detail) || e.message;
      setError(msg);
      throw new Error(msg);
    }
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    localStorage.removeItem("cs_token");
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, error, refresh: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
