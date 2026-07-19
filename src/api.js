// Single source of truth for the backend base URL. VITE_API_URL (Vercel /
// Codemagic env) wins; the Railway URL is the fallback so a missing env var
// never produces "undefined/api/..." requests.
export const API = import.meta.env.VITE_API_URL || "https://roam-backend-production.up.railway.app";
