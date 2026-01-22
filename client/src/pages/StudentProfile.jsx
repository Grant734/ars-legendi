// client/src/pages/StudentProfile.jsx
// Student's profile page with class management and mastery link

import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import useAuth from "../hooks/useAuth.jsx";
import * as authApi from "../lib/authApi";

export default function StudentProfile() {
  const navigate = useNavigate();
  const { user, isLoggedIn, isStudent, logout } = useAuth();

  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joinSuccess, setJoinSuccess] = useState("");

  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/login");
      return;
    }
    if (!isStudent) {
      navigate("/teacher-classes");
      return;
    }

    loadClasses();
  }, [isLoggedIn, isStudent, navigate]);

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

  const handleJoinClass = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) {
      setJoinError("Enter a class code");
      return;
    }

    setJoining(true);
    setJoinError("");
    setJoinSuccess("");

    try {
      const result = await authApi.joinClass(joinCode.trim());
      if (result.ok) {
        setJoinSuccess(`Joined "${result.class.name}" successfully!`);
        setJoinCode("");
        loadClasses();
      } else {
        setJoinError(result.error || "Failed to join class");
      }
    } catch (e) {
      setJoinError(e?.message || "Failed to join class");
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="h-24 bg-gray-100 rounded mb-6"></div>
          <div className="h-32 bg-gray-100 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Header Card */}
      <div className="bg-primary rounded-xl p-6 mb-8 text-white shadow-lg">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-accent">{user?.displayName}</h1>
            <p className="text-white/70 mt-1">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="px-4 py-2 border-2 border-red-400 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors font-medium"
          >
            Log Out
          </button>
        </div>

        {/* Quick Stats */}
        <div className="mt-6 flex gap-4">
          <Link
            to="/mastery"
            className="flex-1 bg-white/10 rounded-lg p-4 hover:bg-white/20 transition-colors group"
          >
            <div className="text-white/60 text-sm mb-1">My Progress</div>
            <div className="text-accent font-bold group-hover:underline">View Mastery →</div>
          </Link>
          <Link
            to="/grammar-practice"
            className="flex-1 bg-white/10 rounded-lg p-4 hover:bg-white/20 transition-colors group"
          >
            <div className="text-white/60 text-sm mb-1">Practice</div>
            <div className="text-accent font-bold group-hover:underline">Grammar Practice →</div>
          </Link>
        </div>
      </div>

      {/* Join Class */}
      <div className="bg-white border-2 border-gray-200 rounded-xl p-6 mb-8">
        <h2 className="text-xl font-bold text-primary mb-4">Join a Class</h2>
        <form onSubmit={handleJoinClass} className="flex gap-3">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Enter class code (e.g., ABC123)"
            className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-lg font-mono text-lg tracking-wider uppercase focus:outline-none focus:border-accent"
            maxLength={8}
          />
          <button
            type="submit"
            disabled={joining}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              joining
                ? "bg-gray-400 cursor-not-allowed text-white"
                : "bg-primary text-white hover:bg-primary/90"
            }`}
          >
            {joining ? "Joining..." : "Join Class"}
          </button>
        </form>

        {joinError && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {joinError}
          </div>
        )}
        {joinSuccess && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {joinSuccess}
          </div>
        )}
      </div>

      {/* My Classes */}
      <div>
        <h2 className="text-2xl font-bold text-primary mb-4">My Classes</h2>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {classes.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
            <div className="text-4xl mb-3">📝</div>
            <p className="text-gray-600 mb-2">No classes yet</p>
            <p className="text-gray-500 text-sm">Ask your teacher for a class code to join!</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {classes.map((cls) => (
              <div
                key={cls.classId}
                className="bg-white border-2 border-gray-200 rounded-xl p-5 hover:border-accent transition-colors"
              >
                <h3 className="text-lg font-bold text-primary">{cls.name}</h3>
                {cls.joinedAt && (
                  <p className="text-gray-500 text-sm mt-1">
                    Joined {new Date(cls.joinedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
