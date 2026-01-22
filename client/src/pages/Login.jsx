// client/src/pages/Login.jsx
// Login/register UI with student/teacher tabs

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../hooks/useAuth.jsx";

export default function Login() {
  const navigate = useNavigate();
  const { login, register, error, clearError } = useAuth();

  const [activeTab, setActiveTab] = useState("student"); // student | teacher
  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError("");
    clearError();

    if (!email.trim() || !password.trim()) {
      setLocalError("Email and password are required");
      return;
    }

    if (mode === "register" && !displayName.trim()) {
      setLocalError("Display name is required");
      return;
    }

    setLoading(true);

    try {
      let result;
      if (mode === "login") {
        result = await login(email, password, activeTab);
      } else {
        result = await register(email, password, displayName, activeTab);
      }

      if (result.ok) {
        // Redirect based on role
        if (activeTab === "teacher") {
          navigate("/teacher-classes");
        } else {
          navigate("/profile");
        }
      } else {
        setLocalError(result.error || "Authentication failed");
      }
    } catch (e) {
      setLocalError(e?.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-primary">
          {mode === "login" ? "Welcome Back" : "Create Account"}
        </h1>
        <p className="text-gray-600 mt-2">
          {mode === "login"
            ? "Sign in to continue your Latin journey"
            : "Join Caesar Atlas to track your progress"}
        </p>
      </div>

      {/* Role tabs */}
      <div className="flex rounded-t-xl overflow-hidden border-2 border-b-0 border-gray-200">
        <button
          className={`flex-1 py-4 font-bold transition-colors ${
            activeTab === "student"
              ? "bg-primary text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
          onClick={() => setActiveTab("student")}
        >
          Student
        </button>
        <button
          className={`flex-1 py-4 font-bold transition-colors ${
            activeTab === "teacher"
              ? "bg-primary text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
          onClick={() => setActiveTab("teacher")}
        >
          Teacher
        </button>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white border-2 border-gray-200 rounded-b-xl p-6"
      >
        {mode === "register" && (
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        {(localError || error) && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {localError || error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-4 rounded-lg font-bold text-lg transition-all ${
            loading
              ? "bg-gray-400 cursor-not-allowed text-white"
              : "bg-primary text-white hover:bg-primary/90"
          }`}
        >
          {loading
            ? "Please wait..."
            : mode === "login"
            ? "Sign In"
            : "Create Account"}
        </button>

        <div className="mt-6 text-center">
          {mode === "login" ? (
            <p className="text-gray-600">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => setMode("register")}
                className="text-accent font-bold hover:underline"
              >
                Sign up
              </button>
            </p>
          ) : (
            <p className="text-gray-600">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => setMode("login")}
                className="text-accent font-bold hover:underline"
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        {activeTab === "student"
          ? "Students can join classes and track their progress."
          : "Teachers can create classes and view student progress."}
      </p>
    </div>
  );
}
