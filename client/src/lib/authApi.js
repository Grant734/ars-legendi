// client/src/lib/authApi.js
// API helper functions for authentication
import { API_BASE_URL } from "./api";

function getToken() {
  return localStorage.getItem("auth_token");
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
}

export async function register(email, password, displayName, role = "student") {
  return apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName, role }),
  });
}

export async function login(email, password, role = "student") {
  return apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, role }),
  });
}

export async function getMe() {
  return apiFetch("/api/auth/me");
}

// Class APIs
export async function getClasses() {
  return apiFetch("/api/classes");
}

export async function createClass(name) {
  return apiFetch("/api/classes", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function joinClass(code) {
  return apiFetch("/api/classes/join", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function getClassDetails(classId) {
  return apiFetch(`/api/classes/${classId}`);
}

export async function getClassInsights(classId) {
  return apiFetch(`/api/classes/${classId}/insights`);
}

// Student data APIs
export async function syncEvents(events) {
  return apiFetch("/api/student/sync", {
    method: "POST",
    body: JSON.stringify({ events }),
  });
}

export async function getStudentMastery(studentId) {
  return apiFetch(`/api/student/${studentId}/mastery`);
}

export async function getStudentEvents(studentId, options = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.skill) params.set("skill", options.skill);
  if (options.after) params.set("after", String(options.after));

  const qs = params.toString();
  return apiFetch(`/api/student/${studentId}/events${qs ? `?${qs}` : ""}`);
}
