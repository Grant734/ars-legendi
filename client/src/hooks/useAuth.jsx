// client/src/hooks/useAuth.js
// Authentication state management - replaces useCreator

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import * as authApi from "../lib/authApi";
import { startAuthSync, stopAuthSync } from "../lib/attemptEvents";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load user from localStorage on mount
  useEffect(() => {
    const loadUser = async () => {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const result = await authApi.getMe();
        if (result.ok && result.user) {
          setUser(result.user);
          // Start auth sync for students
          if (result.user.role === "student") {
            startAuthSync();
          }
        } else {
          // Token is invalid, clear it
          localStorage.removeItem("auth_token");
          stopAuthSync();
        }
      } catch (e) {
        localStorage.removeItem("auth_token");
        stopAuthSync();
      } finally {
        setLoading(false);
      }
    };

    loadUser();

    // Cleanup on unmount
    return () => {
      stopAuthSync();
    };
  }, []);

  const login = useCallback(async (email, password, role) => {
    setError(null);
    try {
      const result = await authApi.login(email, password, role);
      if (result.ok) {
        localStorage.setItem("auth_token", result.token);
        setUser(result.user);
        // Start auth sync for students
        if (result.user.role === "student") {
          startAuthSync();
        }
        return { ok: true };
      } else {
        setError(result.error || "Login failed");
        return { ok: false, error: result.error };
      }
    } catch (e) {
      const msg = e?.message || "Login failed";
      setError(msg);
      return { ok: false, error: msg };
    }
  }, []);

  const register = useCallback(async (email, password, displayName, role) => {
    setError(null);
    try {
      const result = await authApi.register(email, password, displayName, role);
      if (result.ok) {
        localStorage.setItem("auth_token", result.token);
        setUser(result.user);
        // Start auth sync for students
        if (result.user.role === "student") {
          startAuthSync();
        }
        return { ok: true };
      } else {
        setError(result.error || "Registration failed");
        return { ok: false, error: result.error };
      }
    } catch (e) {
      const msg = e?.message || "Registration failed";
      setError(msg);
      return { ok: false, error: msg };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("auth_token");
    setUser(null);
    setError(null);
    stopAuthSync();
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = {
    user,
    loading,
    error,
    isLoggedIn: !!user,
    isStudent: user?.role === "student",
    isTeacher: user?.role === "teacher",
    login,
    register,
    logout,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
