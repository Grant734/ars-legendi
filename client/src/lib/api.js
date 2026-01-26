// API configuration
// In development, Vite proxy handles /api routes
// In production, set VITE_API_BASE_URL to your Railway backend URL

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// Helper to build full API URLs
export function apiUrl(path) {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
