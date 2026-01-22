// client/src/pages/TeacherClasses.jsx
// Teacher Dashboard - Class management

import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import useAuth from "../hooks/useAuth.jsx";
import * as authApi from "../lib/authApi";

export default function TeacherClasses() {
  const navigate = useNavigate();
  const { user, isLoggedIn, isTeacher, logout } = useAuth();

  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newClassName, setNewClassName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdClass, setCreatedClass] = useState(null);

  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/login");
      return;
    }
    if (!isTeacher) {
      navigate("/profile");
      return;
    }

    loadClasses();
  }, [isLoggedIn, isTeacher, navigate]);

  const loadClasses = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await authApi.getClasses();
      if (result.ok) {
        setClasses(result.classes || []);
      } else {
        setError(result.error || "Failed to load classes");
      }
    } catch (e) {
      setError(e?.message || "Failed to load classes");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClass = async (e) => {
    e.preventDefault();
    if (!newClassName.trim()) {
      setCreateError("Enter a class name");
      return;
    }

    setCreating(true);
    setCreateError("");
    setCreatedClass(null);

    try {
      const result = await authApi.createClass(newClassName.trim());
      if (result.ok) {
        setCreatedClass(result.class);
        setNewClassName("");
        loadClasses();
      } else {
        setCreateError(result.error || "Failed to create class");
      }
    } catch (e) {
      setCreateError(e?.message || "Failed to create class");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="h-32 bg-gray-100 rounded mb-6"></div>
          <div className="h-24 bg-gray-100 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-primary">Teacher Dashboard</h1>
          <p className="text-gray-600 mt-1">Welcome back, {user?.displayName}</p>
        </div>
        <button
          onClick={logout}
          className="px-4 py-2 border-2 border-red-500 text-red-500 rounded-lg hover:bg-red-50 transition-colors font-medium"
        >
          Log Out
        </button>
      </div>

      {/* Create Class Card */}
      <div className="bg-primary rounded-xl p-6 mb-8 text-white shadow-lg">
        <h2 className="text-xl font-bold text-accent mb-4">Create New Class</h2>
        <form onSubmit={handleCreateClass} className="flex gap-3">
          <input
            type="text"
            value={newClassName}
            onChange={(e) => setNewClassName(e.target.value)}
            placeholder="Class name (e.g., Latin II Period 3)"
            className="flex-1 px-4 py-3 rounded-lg text-primary font-medium placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={creating}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              creating
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-accent text-primary hover:bg-yellow-400 hover:scale-105"
            }`}
          >
            {creating ? "Creating..." : "Create Class"}
          </button>
        </form>

        {createError && (
          <div className="mt-3 p-3 bg-red-500/20 border border-red-400 rounded-lg text-red-200 text-sm">
            {createError}
          </div>
        )}

        {createdClass && (
          <div className="mt-4 p-4 bg-green-500/20 border border-green-400 rounded-lg">
            <div className="font-bold text-green-300 mb-2">Class Created Successfully!</div>
            <div className="flex items-center gap-4">
              <span className="text-white/80">Class Code:</span>
              <code className="px-4 py-2 bg-white/20 rounded-lg text-xl font-bold tracking-wider text-accent">
                {createdClass.classCode}
              </code>
            </div>
            <p className="text-white/60 text-sm mt-2">
              Share this code with your students so they can join the class.
            </p>
          </div>
        )}
      </div>

      {/* Class List */}
      <div>
        <h2 className="text-2xl font-bold text-primary mb-4">Your Classes</h2>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {classes.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
            <div className="text-4xl mb-3">📚</div>
            <p className="text-gray-600 mb-2">No classes yet</p>
            <p className="text-gray-500 text-sm">Create your first class above to get started!</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {classes.map((cls) => (
              <Link
                key={cls.classId}
                to={`/teacher-class/${cls.classId}`}
                className="block bg-white border-2 border-gray-200 rounded-xl p-5 hover:border-accent hover:shadow-lg transition-all group"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold text-primary group-hover:text-accent transition-colors">
                      {cls.name}
                    </h3>
                    <p className="text-gray-600 mt-1">
                      {cls.studentCount} student{cls.studentCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <code className="px-3 py-1.5 bg-primary/10 rounded-lg text-sm font-bold tracking-wider text-primary">
                      {cls.classCode}
                    </code>
                    <p className="text-gray-500 text-xs mt-2">
                      Created {new Date(cls.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center text-sm text-accent font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  View class details →
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
