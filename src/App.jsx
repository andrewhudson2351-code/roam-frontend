import React, { useState, useEffect, useRef, useMemo } from "react";
import { Map as MapboxMap, Source, Layer, Marker } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { Capacitor } from "@capacitor/core";
import PricingPage from "./PricingPage";
import BillingSuccess from "./BillingSuccess";
import BillingCancel from "./BillingCancel";
import BillingDashboard from "./BillingDashboard";
import { API } from "./api";

const IS_NATIVE = Capacitor.isNativePlatform();

const C = {
  aureus:   "#C8A96E",
  ivory:    "#E8D5A3",
  carbon:   "#1C1C1C",
  obsidian: "#2D2D2D",
  marble:   "#FAFAF8",
  packed:   "#FF2D2D",
  busy:     "#FF7A00",
  buzzing:  "#2ECC71",
  moderate: "#F0C040",
  quiet:    "#6B7280",
  mapBg:    "#0E0F0B",
};

const heatColor = { packed: C.packed, busy: C.busy, buzzing: C.buzzing, moderate: C.moderate, quiet: C.quiet };

function scoreToHeat(score) {
  if (score >= 80) return "packed";
  if (score >= 60) return "busy";
  if (score >= 40) return "buzzing";
  if (score >= 20) return "moderate";
  return "quiet";
}

function getBusyColor(score) { return heatColor[scoreToHeat(score)]; }
function getBusyLabel(score) {
  return { packed: "Packed", busy: "Busy", buzzing: "Buzzing", moderate: "Moderate", quiet: "Quiet" }[scoreToHeat(score)];
}

const CITIES = [
  { name: "Charlotte",        lat: 35.2271, lng: -80.8431 },
  { name: "Raleigh",          lat: 35.7796, lng: -78.6382 },
  { name: "Atlanta",          lat: 33.7490, lng: -84.3880 },
  { name: "Nashville",        lat: 36.1627, lng: -86.7816 },
  { name: "Washington DC",    lat: 38.9072, lng: -77.0369 },
  { name: "Baltimore",        lat: 39.2904, lng: -76.6122 },
  { name: "Philadelphia",     lat: 39.9526, lng: -75.1652 },
  { name: "New York",         lat: 40.7128, lng: -74.0060 },
  { name: "Boston",           lat: 42.3601, lng: -71.0589 },
  { name: "Miami",            lat: 25.7617, lng: -80.1918 },
  { name: "Saratoga Springs", lat: 43.0831, lng: -73.7846 },
];

function getCityFromCoords(lat, lng) {
  let closest = CITIES[0], minDist = Infinity;
  CITIES.forEach(c => {
    const d = Math.sqrt(Math.pow(c.lat - lat, 2) + Math.pow(c.lng - lng, 2));
    if (d < minDist) { minDist = d; closest = c; }
  });
  return closest.name;
}

async function apiFetch(path, options = {}, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    const res = await fetch(`${API}${path}`, { ...options, headers });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON body, e.g. 502 HTML */ }
    if (!res.ok) return { ...(data || {}), error: data?.error || `Request failed (${res.status})`, status: res.status };
    return data;
  } catch {
    return { error: "Network error. Check your connection." };
  }
}

// Downscale a photo to maxDim and re-encode as JPEG so uploads stay small
// (iOS camera shots are 12MP+; the stories bucket caps files at 5 MB).
function compressImage(file, maxDim = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable image")); };
    img.src = url;
  });
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const EMOJIS = ["🔥","🍺","🎵","🍸","🎸","💃","🎉","🌙"];

function Compass({ size = 28 }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="cg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={C.ivory} />
          <stop offset="100%" stopColor={C.aureus} />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="44" fill="none" stroke={C.aureus} strokeWidth="2" opacity=".4" />
      {[0,90,180,270].map((a,i) => {
        const r = (a * Math.PI) / 180;
        return <line key={i} x1={50+39*Math.sin(r)} y1={50-39*Math.cos(r)} x2={50+44*Math.sin(r)} y2={50-44*Math.cos(r)} stroke={C.aureus} strokeWidth="1.5" opacity=".5" />;
      })}
      <polygon points="50,10 46,50 50,40 54,50" fill="url(#cg)" />
      <polygon points="50,90 54,50 50,60 46,50" fill={C.aureus} opacity=".35" />
      <polygon points="10,50 50,54 40,50 50,46" fill={C.aureus} opacity=".35" />
      <polygon points="90,50 50,46 60,50 50,54" fill="url(#cg)" />
      <circle cx="50" cy="50" r="6" fill={C.carbon} />
      <circle cx="50" cy="50" r="3.5" fill="url(#cg)" />
    </svg>
  );
}

const HEATMAP_LAYER = {
  id: "venue-heat",
  type: "heatmap",
  paint: {
    "heatmap-weight": ["/", ["get", "busy_score"], 100],
    "heatmap-intensity": 1,
    "heatmap-radius": 60,
    "heatmap-opacity": 0.7,
    "heatmap-color": [
      "interpolate", ["linear"], ["heatmap-density"],
      0, "rgba(0,0,0,0)",
      0.2, "rgba(65,105,225,0.5)",
      0.4, "rgba(46,204,113,0.6)",
      0.6, "rgba(240,192,64,0.7)",
      0.8, "rgba(255,122,0,0.85)",
      1, "rgba(255,45,45,1)",
    ],
  },
};

// Dim quiet venues so active ones carry the visual hierarchy
const PIN_OPACITY = ["interpolate", ["linear"], ["get", "busy_score"], 25, 0.45, 45, 1];

const CIRCLE_LAYER = {
  id: "venue-points",
  type: "circle",
  paint: {
    "circle-radius": ["step", ["get", "busy_score"], 6, 60, 7, 80, 8],
    "circle-color": ["get", "color"],
    "circle-stroke-color": "#FAFAF8",
    "circle-stroke-width": 1.5,
    "circle-opacity": PIN_OPACITY,
    "circle-stroke-opacity": PIN_OPACITY,
  },
};

const DEAL_CIRCLE_LAYER = {
  id: "venue-points",
  type: "circle",
  paint: {
    "circle-radius": ["step", ["get", "busy_score"], 8, 60, 9, 80, 10],
    "circle-color": ["get", "color"],
    "circle-stroke-color": C.aureus,
    "circle-stroke-width": 3,
  },
};

const DEAL_TAG_GROUPS = {
  Food: ["Wings", "Tacos", "Brunch", "Pizza", "Apps/Small Plates"],
  Drinks: ["Happy Hour", "Beer", "Cocktails", "Wine", "Shots"],
  Occasion: ["Live Music", "Trivia", "Karaoke", "Sports", "Ladies Night"],
};
const DEAL_TAGS = Object.values(DEAL_TAG_GROUPS).flat();

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function fmtTime(t) {
  const [h, m] = String(t).split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}${ap}` : `${h12}${ap}`;
}
function recurLabel(d) {
  const days = d.recur_days.length === 7 ? "Daily" : d.recur_days.map(i => DAY_LABELS[i]).join(", ");
  return `${days} · ${fmtTime(d.recur_start)}–${fmtTime(d.recur_end)}`;
}

const EVENT_TAG_GROUPS = { ...DEAL_TAG_GROUPS, Events: ["Tasting", "Comedy", "DJ Set", "Theme Night"] };

function eventDateLabel(dateStr) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
}

function eventScheduleLabel(e) {
  if (e.event_date) return `${eventDateLabel(e.event_date)} · ${fmtTime(e.start_time)}–${fmtTime(e.end_time)}`;
  const days = e.recur_days.length === 7 ? "Daily" : `Every ${e.recur_days.map(i => DAY_LABELS[i]).join(", ")}`;
  const until = e.recur_until ? ` · until ${eventDateLabel(e.recur_until)}` : "";
  return `${days} · ${fmtTime(e.recur_start)}–${fmtTime(e.recur_end)}${until}`;
}

function useRedemptions(token) {
  const [redeemed, setRedeemed] = useState({});
  const [receipt, setReceipt] = useState(null);
  const [redeemError, setRedeemError] = useState(null);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/deals/my-redemptions", {}, token).then(data => {
      if (!Array.isArray(data)) return;
      setRedeemed(r => {
        const next = { ...r };
        for (const row of data) next[row.deal_id] = { code: row.code, redeemed_at: row.redeemed_at };
        return next;
      });
    });
  }, [token]);

  useEffect(() => {
    if (!redeemError) return;
    const t = setTimeout(() => setRedeemError(null), 4000);
    return () => clearTimeout(t);
  }, [redeemError]);

  async function redeem(deal) {
    const existing = redeemed[deal.id];
    if (existing) { setReceipt({ deal, ...existing }); return; }
    const data = await apiFetch(`/api/deals/${deal.id}/redeem`, { method: "POST" }, token);
    const info = data.redemption ? { code: data.redemption.code, redeemed_at: data.redemption.redeemed_at } : null;
    if ((data.success || data.already_redeemed) && info) {
      setRedeemed(r => ({ ...r, [deal.id]: info }));
      setReceipt({ deal, ...info });
    } else if (data.error) {
      setRedeemError(data.error);
    }
  }

  return { redeemed, receipt, setReceipt, redeem, redeemError };
}

function ReceiptModal({ receipt, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)", padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 320, background: C.carbon, border: `1px solid rgba(200,169,110,0.4)`, borderRadius: 20, padding: "28px 22px", textAlign: "center" }}>
        <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 3, textTransform: "uppercase", marginBottom: 14 }}>✦ Deal Redeemed ✦</div>
        <div style={{ fontSize: 12, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 1, marginBottom: 4 }}>{receipt.deal.venues?.name}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif", marginBottom: 4 }}>{receipt.deal.title}</div>
        {receipt.deal.detail && <div style={{ fontSize: 12, color: C.marble, opacity: 0.6, fontFamily: "'EB Garamond', serif", marginBottom: 14 }}>{receipt.deal.detail}</div>}
        <div style={{ background: "rgba(200,169,110,0.08)", border: `1px dashed rgba(200,169,110,0.5)`, borderRadius: 14, padding: "14px 10px", margin: "0 0 12px" }}>
          <div style={{ fontSize: 8, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6, opacity: 0.7 }}>Redemption Code</div>
          <div data-testid="redemption-code" style={{ fontSize: 30, fontWeight: 700, color: C.ivory, fontFamily: "monospace", letterSpacing: 6 }}>{receipt.code}</div>
        </div>
        <div style={{ fontSize: 11, color: C.marble, opacity: 0.5, fontFamily: "'EB Garamond', serif", marginBottom: 4 }}>
          Redeemed {new Date(receipt.redeemed_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </div>
        <div style={{ fontSize: 10, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 1, textTransform: "uppercase", opacity: 0.7, marginBottom: 18 }}>Single use · Show this to your server</div>
        <button onClick={onClose} style={{ width: "100%", padding: "11px 0", borderRadius: 12, border: "none", cursor: "pointer", fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 13, background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: C.carbon }}>Done</button>
      </div>
    </div>
  );
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", username: "", home_city: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit() {
    setLoading(true); setError(""); setNotice("");
    try {
      if (mode === "forgot") {
        const data = await apiFetch("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: form.email }) });
        if (data.error) { setError(data.error); setLoading(false); return; }
        setNotice("If that email exists, a reset link has been sent. Check your inbox.");
        setLoading(false);
        return;
      }
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body = mode === "login" ? { email: form.email, password: form.password } : form;
      const data = await apiFetch(endpoint, { method: "POST", body: JSON.stringify(body) });
      if (data.error) { setError(data.error); setLoading(false); return; }
      onAuth(data.user, data.token);
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, background: C.mapBg }}>
      <Compass size={48} />
      <div style={{ fontSize: 28, fontWeight: 700, color: C.marble, marginTop: 14, marginBottom: 4, fontFamily: "'Playfair Display', serif", letterSpacing: 3 }}>ROAMAN</div>
      <div style={{ fontSize: 14, color: C.aureus, marginBottom: 6, fontFamily: "'EB Garamond', serif", fontStyle: "italic", textAlign: "center" }}>"When in Roam, Do as the Romans Do"</div>
      <div style={{ fontSize: 9, color: C.aureus, marginBottom: 32, fontFamily: "sans-serif", letterSpacing: 3, textTransform: "uppercase", opacity: 0.5 }}>The Navigator</div>
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
        {mode === "register" && (
          <>
            <input placeholder="Username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              style={{ background: "rgba(200,169,110,0.08)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 12, padding: "12px 16px", color: C.marble, fontSize: 16, fontFamily: "'EB Garamond', serif", outline: "none" }} />
            <input placeholder="Home City (optional)" value={form.home_city} onChange={e => setForm(f => ({ ...f, home_city: e.target.value }))}
              style={{ background: "rgba(200,169,110,0.08)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 12, padding: "12px 16px", color: C.marble, fontSize: 16, fontFamily: "'EB Garamond', serif", outline: "none" }} />
          </>
        )}
        <input placeholder="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          style={{ background: "rgba(200,169,110,0.08)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 12, padding: "12px 16px", color: C.marble, fontSize: 16, fontFamily: "'EB Garamond', serif", outline: "none" }} />
        {mode !== "forgot" && (
          <input placeholder="Password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            style={{ background: "rgba(200,169,110,0.08)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 12, padding: "12px 16px", color: C.marble, fontSize: 16, fontFamily: "'EB Garamond', serif", outline: "none" }} />
        )}
        {error && <div style={{ fontSize: 12, color: C.packed, textAlign: "center" }}>{error}</div>}
        {notice && <div style={{ fontSize: 12, color: C.aureus, textAlign: "center" }}>{notice}</div>}
        <button onClick={submit} disabled={loading}
          style={{ padding: "14px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: C.carbon, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Playfair Display', serif", letterSpacing: 1.5, opacity: loading ? 0.7 : 1 }}>
          {loading ? "..." : mode === "login" ? "Enter" : mode === "register" ? "Create Account" : "Send Reset Link"}
        </button>
        {mode === "login" && (
          <button onClick={() => { setMode("forgot"); setError(""); setNotice(""); }}
            style={{ background: "none", border: "none", color: C.aureus, fontSize: 12, cursor: "pointer", fontFamily: "'EB Garamond', serif", opacity: 0.6 }}>
            Forgot password?
          </button>
        )}
        <button onClick={() => { setMode(m => m === "login" ? "register" : "login"); setError(""); setNotice(""); }}
          style={{ background: "none", border: "none", color: C.aureus, fontSize: 12, cursor: "pointer", fontFamily: "'EB Garamond', serif", opacity: 0.6 }}>
          {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
}

function ResetPasswordScreen() {
  const token = new URLSearchParams(window.location.search).get("token");
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const inputStyle = { background: "rgba(200,169,110,0.08)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 12, padding: "12px 16px", color: C.marble, fontSize: 16, fontFamily: "'EB Garamond', serif", outline: "none" };

  async function submit() {
    setError("");
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (form.password !== form.confirm) { setError("Passwords don't match."); return; }
    setLoading(true);
    try {
      const data = await apiFetch("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password: form.password }) });
      if (data.error) { setError(data.error); setLoading(false); return; }
      setDone(true);
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, background: C.mapBg }}>
      <Compass size={48} />
      <div style={{ fontSize: 28, fontWeight: 700, color: C.marble, marginTop: 14, marginBottom: 24, fontFamily: "'Playfair Display', serif", letterSpacing: 3 }}>ROAMAN</div>
      {!token ? (
        <div style={{ fontSize: 14, color: C.marble, textAlign: "center", fontFamily: "'EB Garamond', serif" }}>
          This reset link is invalid. Request a new one from the login screen.
        </div>
      ) : done ? (
        <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 16, textAlign: "center" }}>
          <div style={{ fontSize: 15, color: C.aureus, fontFamily: "'EB Garamond', serif" }}>Password updated. You can now log in with your new password.</div>
          <button onClick={() => { window.location.href = "/"; }}
            style={{ padding: "14px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: C.carbon, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Playfair Display', serif", letterSpacing: 1.5 }}>
            Go to Login
          </button>
        </div>
      ) : (
        <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 14, color: C.marble, textAlign: "center", fontFamily: "'EB Garamond', serif", marginBottom: 8 }}>Choose a new password</div>
          <input placeholder="New password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} style={inputStyle} />
          <input placeholder="Confirm new password" type="password" value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} style={inputStyle} />
          {error && <div style={{ fontSize: 12, color: C.packed, textAlign: "center" }}>{error}</div>}
          <button onClick={submit} disabled={loading}
            style={{ padding: "14px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: C.carbon, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Playfair Display', serif", letterSpacing: 1.5, opacity: loading ? 0.7 : 1 }}>
            {loading ? "..." : "Reset Password"}
          </button>
        </div>
      )}
    </div>
  );
}

const HOUR_MARKS = [[0, "6am"], [6, "12pm"], [12, "6pm"], [18, "12am"]];

function VenueDetailScreen({ venue, token, onClose, onReported, onClaim }) {
  const [data, setData] = useState(null);
  const [weekOpen, setWeekOpen] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [msg, setMsg] = useState(null);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    let stale = false;
    apiFetch(`/api/venues/${venue.id}`, {}, token).then(d => {
      if (stale) return;
      if (d?.error) setMsg(d.error);
      else if (d) setData(d);
    });
    return () => { stale = true; };
  }, [venue.id]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  async function report(level) {
    const result = await apiFetch(`/api/venues/${venue.id}/crowd`, { method: "POST", body: JSON.stringify({ busy_level: level }) }, token);
    if (result?.error) { setMsg(result.error); return; }
    setReported(true);
    // Backend rejects with 403 when location_sharing is off; ignore silently
    apiFetch("/api/friends/location", { method: "PATCH", body: JSON.stringify({ venue_id: venue.id, latitude: venue.latitude, longitude: venue.longitude, last_seen: new Date().toISOString() }) }, token).catch(() => {});
    onReported?.();
  }

  const v = data || venue;
  const score = venue.busy_score ?? data?.busy_score ?? 0;
  const photos = data?.place?.photos || [];
  const phone = data?.place?.phone || v.phone;
  const website = data?.place?.website || v.website;
  const hoursWeek = data?.place?.hours?.descriptions || null;
  const todayIdx = (new Date().getDay() + 6) % 7; // weekdayDescriptions are Monday-first
  const description = data?.place?.editorial_summary || v.description;
  const typical = data?.typical_today;
  const hasTypical = typical?.hour_data?.some(h => (h || 0) > 0);
  const friendsHere = data?.friends_here || [];
  const deals = data?.deals || [];
  const events = data?.events || [];
  const sectionLabel = { fontSize: 9, color: C.marble, opacity: 0.4, fontFamily: "sans-serif", letterSpacing: 1.5, marginBottom: 8 };
  const actionBtn = { flex: 1, padding: "10px 6px", borderRadius: 12, border: `1px solid rgba(200,169,110,0.25)`, background: "rgba(200,169,110,0.06)", color: C.aureus, fontSize: 11, fontFamily: "'EB Garamond', serif", cursor: "pointer", textAlign: "center", textDecoration: "none" };

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 30 }}>
      {/* content scrolls in an inner div so the back button can anchor to the
          non-scrolling overlay — position:fixed put it under the iOS status bar */}
      <div style={{ position: "absolute", inset: 0, background: C.carbon, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>

      {photos.length > 0 ? (
        <div style={{ position: "relative" }}>
          <div onScroll={e => setPhotoIdx(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
            style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", height: 230, scrollbarWidth: "none" }}>
            {photos.map(p => (
              <div key={p.index} style={{ flexShrink: 0, width: "100%", height: "100%", scrollSnapAlign: "start", position: "relative", background: C.obsidian }}>
                <img src={`${API}/api/venues/${venue.id}/photos/${p.index}`} alt="" loading="lazy"
                  onError={e => { e.currentTarget.style.display = "none"; }}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {p.attribution && (
                  <a href={p.attribution_uri || undefined} target="_blank" rel="noreferrer"
                    style={{ position: "absolute", bottom: 8, right: 10, fontSize: 8, color: "rgba(250,250,248,0.75)", background: "rgba(14,15,11,0.6)", borderRadius: 6, padding: "2px 6px", fontFamily: "sans-serif", textDecoration: "none" }}>📷 {p.attribution}</a>
                )}
              </div>
            ))}
          </div>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(to bottom, rgba(28,28,28,0.35), transparent 30%, transparent 70%, rgba(28,28,28,0.9))" }} />
          {photos.length > 1 && (
            <div style={{ position: "absolute", bottom: 10, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 5 }}>
              {photos.map((_, i) => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: i === photoIdx ? C.aureus : "rgba(250,250,248,0.35)", transition: "background 0.2s" }} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ height: 150, background: `linear-gradient(135deg, ${C.mapBg}, ${C.obsidian})`, display: "flex", alignItems: "center", justifyContent: "center", borderBottom: `1px solid rgba(200,169,110,0.12)` }}>
          <Compass size={54} />
        </div>
      )}

      <div style={{ padding: "16px 18px 90px" }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif", lineHeight: 1.15 }}>{v.name}</div>
        <div style={{ fontSize: 12, color: C.aureus, marginTop: 4, fontFamily: "'EB Garamond', serif", opacity: 0.85 }}>
          {[v.category, v.neighborhood, v.city].filter(Boolean).join(" · ")}
        </div>
        <div style={{ fontSize: 11, color: C.marble, opacity: 0.5, marginTop: 3, fontFamily: "'EB Garamond', serif" }}>{v.address}</div>
        {description && <div style={{ fontSize: 12, color: C.marble, opacity: 0.7, marginTop: 10, lineHeight: 1.5, fontFamily: "'EB Garamond', serif" }}>{description}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {phone && <a href={`tel:${phone}`} style={actionBtn}>📞 Call</a>}
          <a href={`https://maps.apple.com/?daddr=${encodeURIComponent(`${v.address}, ${v.city}`)}`} target="_blank" rel="noreferrer" style={actionBtn}>🧭 Directions</a>
          {website && <a href={website} target="_blank" rel="noreferrer" style={actionBtn}>🌐 Website</a>}
          {v.instagram && (
            <a href={v.instagram.startsWith("http") ? v.instagram : `https://instagram.com/${v.instagram.replace(/^@/, "")}`}
              target="_blank" rel="noreferrer" style={actionBtn}>📸 Insta</a>
          )}
        </div>

        {hoursWeek && (
          <div style={{ marginTop: 18, background: "rgba(200,169,110,0.05)", borderRadius: 14, padding: "12px 14px", border: `1px solid rgba(200,169,110,0.15)` }}>
            <div onClick={() => setWeekOpen(o => !o)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <div>
                <div style={sectionLabel}>HOURS</div>
                <div style={{ fontSize: 13, color: C.marble, fontFamily: "'EB Garamond', serif" }}>{hoursWeek[todayIdx]}</div>
              </div>
              <span style={{ color: C.aureus, fontSize: 12, transform: weekOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
            </div>
            {weekOpen && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
                {hoursWeek.map((line, i) => (
                  <div key={i} style={{ fontSize: 11, fontFamily: "'EB Garamond', serif", color: i === todayIdx ? C.aureus : C.marble, opacity: i === todayIdx ? 1 : 0.55 }}>{line}</div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <div style={sectionLabel}>LIVE BUSYNESS</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: getBusyColor(score), boxShadow: `0 0 10px ${getBusyColor(score)}` }} />
            <span style={{ fontSize: 14, color: getBusyColor(score), fontFamily: "sans-serif", letterSpacing: 1, fontWeight: 700 }}>{getBusyLabel(score).toUpperCase()} · {score}%</span>
          </div>
          {hasTypical && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 60 }}>
                {typical.hour_data.map((val, i) => (
                  <div key={i} style={{ flex: 1, height: `${Math.max(4, val || 0)}%`, borderRadius: 2, background: i === typical.now_index ? getBusyColor(score) : "rgba(200,169,110,0.28)", boxShadow: i === typical.now_index ? `0 0 6px ${getBusyColor(score)}` : "none" }} />
                ))}
              </div>
              <div style={{ position: "relative", height: 12, marginTop: 4 }}>
                {HOUR_MARKS.map(([i, label]) => (
                  <span key={label} style={{ position: "absolute", left: `${(i / 24) * 100}%`, fontSize: 8, color: C.marble, opacity: 0.4, fontFamily: "sans-serif" }}>{label}</span>
                ))}
              </div>
              <div style={{ fontSize: 9, color: C.marble, opacity: 0.35, fontFamily: "sans-serif", letterSpacing: 1 }}>TYPICAL CROWD TODAY</div>
            </div>
          )}
          <div style={{ fontSize: 9, color: C.marble, opacity: 0.4, margin: "14px 0 8px", fontFamily: "sans-serif", letterSpacing: 1.5 }}>HOW BUSY IS IT RIGHT NOW?</div>
          {reported ? (
            <div style={{ fontSize: 12, color: C.aureus, fontFamily: "'EB Garamond', serif", padding: "10px 0" }}>✓ Thanks — your report keeps the map live.</div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              {[["😴", 20, "Quiet"], ["🙂", 50, "Busy"], ["🔥", 85, "Packed"]].map(([emoji, level, label]) => (
                <button key={level} onClick={() => report(level)}
                  style={{ flex: 1, padding: "10px 8px", borderRadius: 12, border: `1px solid rgba(200,169,110,0.2)`, background: "rgba(200,169,110,0.06)", cursor: "pointer", fontFamily: "inherit" }}>
                  <div style={{ fontSize: 22 }}>{emoji}</div>
                  <div style={{ fontSize: 9, color: C.aureus, marginTop: 4, fontFamily: "sans-serif", letterSpacing: 0.5 }}>{label}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {deals.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={sectionLabel}>ACTIVE DEALS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {deals.map(d => (
                <div key={d.id} style={{ background: "rgba(200,169,110,0.05)", borderRadius: 14, padding: "12px 14px", border: `1px solid rgba(200,169,110,0.18)` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif" }}>{d.title}</span>
                    {d.recur_days && d.is_live_now && <span style={{ fontSize: 8, color: C.carbon, background: `linear-gradient(135deg, ${C.buzzing}, #7FE3A8)`, borderRadius: 6, padding: "2px 6px", fontFamily: "sans-serif", fontWeight: 700, letterSpacing: 0.5 }}>LIVE NOW</span>}
                    {d.is_premium_only && <span style={{ fontSize: 8, color: C.aureus, background: "rgba(200,169,110,0.1)", border: `1px solid rgba(200,169,110,0.3)`, borderRadius: 6, padding: "2px 6px" }}>✦ PREMIUM</span>}
                    {d.source === "scraped" && <span style={{ fontSize: 8, color: C.marble, opacity: 0.55, border: "1px solid rgba(232,230,225,0.18)", borderRadius: 6, padding: "2px 6px", fontFamily: "sans-serif", letterSpacing: 1, textTransform: "uppercase" }}>Not owner verified</span>}
                  </div>
                  {d.detail && <div style={{ fontSize: 11, color: C.marble, opacity: 0.6, marginTop: 2, fontFamily: "'EB Garamond', serif" }}>{d.detail}</div>}
                  <div style={{ fontSize: 10, color: C.aureus, marginTop: 4, fontFamily: "'EB Garamond', serif" }}>
                    {d.recur_days ? `↻ ${recurLabel(d)}` : `Expires ${new Date(d.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                  </div>
                  {d.tags?.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                      {d.tags.map(t => (
                        <span key={t} style={{ fontSize: 9, color: C.aureus, background: "rgba(200,169,110,0.08)", border: `1px solid rgba(200,169,110,0.25)`, borderRadius: 8, padding: "2px 7px", fontFamily: "sans-serif", letterSpacing: 0.5 }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {events.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={sectionLabel}>EVENTS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {events.map(e => (
                <div key={e.id} style={{ background: "rgba(200,169,110,0.05)", borderRadius: 14, border: `1px solid rgba(200,169,110,0.18)`, overflow: "hidden" }}>
                  {e.cover_image_url && (
                    <img src={e.cover_image_url} alt="" loading="lazy" onError={ev => { ev.currentTarget.style.display = "none"; }} style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }} />
                  )}
                  <div style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif" }}>{e.title}</span>
                      {e.is_now && <span style={{ fontSize: 8, color: C.carbon, background: `linear-gradient(135deg, ${C.buzzing}, #7FE3A8)`, borderRadius: 6, padding: "2px 6px", fontFamily: "sans-serif", fontWeight: 700, letterSpacing: 0.5 }}>HAPPENING NOW</span>}
                    </div>
                    {e.description && <div style={{ fontSize: 11, color: C.marble, opacity: 0.6, marginTop: 2, fontFamily: "'EB Garamond', serif" }}>{e.description}</div>}
                    <div style={{ fontSize: 10, color: C.aureus, marginTop: 4, fontFamily: "'EB Garamond', serif" }}>{e.recur_days ? "↻ " : ""}{eventScheduleLabel(e)}</div>
                    {e.tags?.length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                        {e.tags.map(t => (
                          <span key={t} style={{ fontSize: 9, color: C.aureus, background: "rgba(200,169,110,0.08)", border: `1px solid rgba(200,169,110,0.25)`, borderRadius: 8, padding: "2px 7px", fontFamily: "sans-serif", letterSpacing: 0.5 }}>{t}</span>
                        ))}
                      </div>
                    )}
                    {e.deals?.length > 0 && (
                      <div style={{ fontSize: 10, color: C.aureus, marginTop: 6, fontFamily: "'EB Garamond', serif", opacity: 0.85 }}>
                        ✦ {e.deals.map(d => d.title).join(" · ")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {friendsHere.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={sectionLabel}>FRIENDS</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(200,169,110,0.05)", borderRadius: 14, padding: "10px 14px", border: `1px solid rgba(200,169,110,0.18)` }}>
              <div style={{ display: "flex" }}>
                {friendsHere.slice(0, 4).map((f, i) => (
                  <div key={f.id} style={{ width: 28, height: 28, borderRadius: "50%", marginLeft: i ? -8 : 0, background: `linear-gradient(135deg, rgba(200,169,110,0.5), rgba(14,15,11,0.9))`, border: `2px solid ${C.aureus}`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {f.avatar_url
                      ? <img src={f.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ fontSize: 11, color: C.marble, fontFamily: "'Playfair Display', serif", fontWeight: 700 }}>{(f.display_name || f.username || "?")[0].toUpperCase()}</span>}
                  </div>
                ))}
              </div>
              <span style={{ fontSize: 12, color: C.marble, fontFamily: "'EB Garamond', serif" }}>
                {friendsHere.length === 1
                  ? `${friendsHere[0].display_name || friendsHere[0].username} is here now`
                  : `${friendsHere.length} friends here now`}
              </span>
            </div>
          </div>
        )}

        {data && data.is_claimed === false && (
          <div style={{ marginTop: 24 }}>
            <button onClick={() => onClaim?.(v)} style={{ width: "100%", padding: "12px", borderRadius: 14, border: `1px solid rgba(200,169,110,0.35)`, background: "rgba(200,169,110,0.06)", color: C.aureus, fontSize: 13, cursor: "pointer", fontFamily: "'Playfair Display', serif", fontWeight: 700, letterSpacing: 0.5 }}>
              Own this venue? Claim it
            </button>
            <div style={{ fontSize: 10, color: C.marble, opacity: 0.4, marginTop: 6, textAlign: "center", fontFamily: "'EB Garamond', serif" }}>Free — verify by phone in about two minutes</div>
          </div>
        )}
      </div>
      </div>

      <button onClick={onClose} style={{ position: "absolute", top: 14, left: 14, zIndex: 40, width: 34, height: 34, borderRadius: "50%", border: `1px solid rgba(200,169,110,0.35)`, background: "rgba(14,15,11,0.85)", color: C.aureus, fontSize: 16, cursor: "pointer", backdropFilter: "blur(8px)" }}>←</button>

      {msg && (
        <div style={{ position: "absolute", top: 60, left: "50%", transform: "translateX(-50%)", zIndex: 45, background: "rgba(42,13,13,0.95)", borderRadius: 20, padding: "6px 14px", border: `1px solid rgba(255,107,107,0.4)`, maxWidth: "85%", textAlign: "center" }}>
          <span style={{ color: "#FF6B6B", fontSize: 11, fontFamily: "'EB Garamond', serif" }}>{msg}</span>
        </div>
      )}
    </div>
  );
}

function HeatmapScreen({ token, user, currentCity, setCurrentCity, onClaimVenue }) {
  const [venues, setVenues] = useState([]);
  const [filter, setFilter] = useState("All");
  const [detailVenue, setDetailVenue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("visitor");
  const modeOverrideRef = useRef(false);
  const [pulse, setPulse] = useState(true);
  const [showFriends, setShowFriends] = useState(false);
  const [friendPins, setFriendPins] = useState([]);
  const [activeFriend, setActiveFriend] = useState(null);
  const [mapMsg, setMapMsg] = useState(null);
  const [dealTag, setDealTag] = useState(null);
  const [dealVenueIds, setDealVenueIds] = useState(null);
  const [liveEventVenues, setLiveEventVenues] = useState([]);
  const mapRef = useRef(null);
  const loadSeqRef = useRef(0);
  const moveDebounceRef = useRef(null);

  useEffect(() => {
    if (!mapMsg) return;
    const t = setTimeout(() => setMapMsg(null), 4000);
    return () => clearTimeout(t);
  }, [mapMsg]);

  useEffect(() => {
    if (modeOverrideRef.current) return;
    const home = (user?.home_city || "").trim().toLowerCase();
    setMode(home && home === currentCity.trim().toLowerCase() ? "local" : "visitor");
  }, [currentCity, user]);

  // initial venue load happens on the map's onLoad (bounds aren't known before then)
  useEffect(() => {
    const t = setInterval(() => setPulse(p => !p), 1500);
    return () => { clearInterval(t); clearTimeout(moveDebounceRef.current); };
  }, []);

  async function loadFriends() {
    const data = await apiFetch("/api/friends", {}, token).catch(() => null);
    if (!Array.isArray(data)) return;
    setFriendPins(data.filter(f => {
      const loc = f.location;
      return loc && !isNaN(parseFloat(loc.latitude)) && !isNaN(parseFloat(loc.longitude));
    }));
  }

  // Own position: watching GPS is what triggers the OS location-permission
  // prompt; the self pin renders only while Share My Location is on.
  const [selfPos, setSelfPos] = useState(null);
  useEffect(() => {
    if (!user?.location_sharing || !navigator.geolocation) { setSelfPos(null); return; }
    const id = navigator.geolocation.watchPosition(
      p => setSelfPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setMapMsg("Couldn't access your location — check Roaman's location permission in device settings."),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [user?.location_sharing]);

  useEffect(() => {
    loadFriends();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") loadFriends();
    }, 20000);
    const onVisible = () => { if (document.visibilityState === "visible") loadFriends(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  // deals are fetched for all cities (only dozens are active) and intersected
  // with whatever venues are in the viewport, so panning never refetches deals
  useEffect(() => {
    if (!dealTag) { setDealVenueIds(null); return; }
    let stale = false;
    apiFetch(`/api/deals?city=&tag=${encodeURIComponent(dealTag)}`).then(data => {
      if (stale) return;
      if (Array.isArray(data)) setDealVenueIds(new Set(data.map(d => d.venue_id)));
      else { setDealVenueIds(new Set()); if (data?.error) setMapMsg(data.error); }
    });
    return () => { stale = true; };
  }, [dealTag]);

  // venues with an event happening right now get a pulsing map badge
  useEffect(() => {
    let stale = false;
    function loadLive() {
      apiFetch(`/api/events?city=${encodeURIComponent(currentCity)}`).then(data => {
        if (stale || !Array.isArray(data)) return;
        const byVenue = new Map();
        for (const e of data) {
          if (!e.is_now || !e.venues || isNaN(parseFloat(e.venues.latitude))) continue;
          const cur = byVenue.get(e.venues.id);
          if (cur) cur.count++;
          else byVenue.set(e.venues.id, { venue: e.venues, count: 1 });
        }
        setLiveEventVenues([...byVenue.values()]);
      });
    }
    loadLive();
    const t = setInterval(loadLive, 5 * 60 * 1000);
    return () => { stale = true; clearInterval(t); };
  }, [currentCity]);

  function handleMoveEnd(evt) {
    const { latitude, longitude } = evt.viewState;
    // currentCity is display/mode state only — it never drives a fetch
    setCurrentCity(getCityFromCoords(latitude, longitude));
    clearTimeout(moveDebounceRef.current);
    moveDebounceRef.current = setTimeout(loadVenues, 300);
  }

  function handleMapClick(evt) {
    setActiveFriend(null);
    const f = evt.features && evt.features[0];
    if (!f) return;
    const venue = venues.find(v => v.id === f.properties.id);
    // no flyTo: the detail page covers the map, and skipping it keeps the
    // camera exactly where the user left it when they come back
    if (venue) setDetailVenue(venue);
  }

  async function loadVenues() {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const qs = `swLat=${b.getSouth()}&swLng=${b.getWest()}&neLat=${b.getNorth()}&neLng=${b.getEast()}`;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    const [venueData, baselineData] = await Promise.all([
      apiFetch(`/api/venues/bounds?${qs}`),
      apiFetch(`/api/venues/baseline?${qs}`),
    ]);
    // A newer load started while this one was in flight; discard this stale
    // response or it can clobber venues from an older viewport.
    if (seq !== loadSeqRef.current) return;
    if (venueData?.error) setMapMsg(venueData.error);
    if (Array.isArray(venueData)) {
      const baselineMap = {};
      if (baselineData?.baselines) {
        baselineData.baselines.forEach(b => { baselineMap[b.venue_id] = b.baseline_score; });
      }
      const merged = venueData.map(v => {
        const baseline = baselineMap[v.id] || 0;
        const live = v.busy_score || 0;
        const finalScore = live > 0 ? Math.round(live * 0.85 + baseline * 0.15) : Math.round(baseline * 0.75);
        return { ...v, busy_score: finalScore };
      });
      setVenues(merged);
    }
    setLoading(false);
  }

  function goToCity(city) {
    const c = CITIES.find(x => x.name === city);
    if (c) mapRef.current?.flyTo({ center: [c.lng, c.lat], zoom: 14 });
  }

  const filters = ["All", "Bar", "Club", "Restaurant"];
  const cityCenter = CITIES.find(c => c.name === currentCity);
  function sortByMode(list) {
    if (mode === "local" && cityCenter) {
      const localScore = v => {
        const dist = Math.hypot(parseFloat(v.latitude) - cityCenter.lat, parseFloat(v.longitude) - cityCenter.lng);
        const distScore = Math.min(100, isNaN(dist) ? 100 : dist * 2000);
        return (v.busy_score || 0) * 0.7 + distScore * 0.3;
      };
      const hasReports = v => (v.report_count || 0) > 0;
      return [...list].sort((a, b) => {
        if (hasReports(a) !== hasReports(b)) return hasReports(a) ? -1 : 1;
        return localScore(a) - localScore(b);
      });
    }
    return [...list].sort((a, b) => (b.busy_score || 0) - (a.busy_score || 0));
  }
  const filtered = useMemo(() => {
    if (dealTag) return sortByMode(dealVenueIds ? venues.filter(v => dealVenueIds.has(v.id)) : []);
    return sortByMode(filter === "All" ? venues : venues.filter(v => v.category === filter));
  }, [venues, mode, filter, currentCity, dealTag, dealVenueIds]);
  const geojson = useMemo(() => ({
    type: "FeatureCollection",
    features: filtered
      .filter(v => !isNaN(parseFloat(v.latitude)) && !isNaN(parseFloat(v.longitude)))
      .map(v => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [parseFloat(v.longitude), parseFloat(v.latitude)] },
        properties: { id: v.id, busy_score: v.busy_score || 0, color: getBusyColor(v.busy_score || 0) },
      })),
  }), [filtered]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", background: C.mapBg }}>
      <div style={{ position: "absolute", top: 12, left: 12, zIndex: 10, display: "flex", gap: 6, flexWrap: "wrap", maxWidth: "70%", opacity: dealTag ? 0.45 : 1, transition: "opacity 0.2s" }}>
        {filters.map(f => {
          const active = filter === f && !dealTag;
          return (
            <button key={f} onClick={() => { setFilter(f); setDealTag(null); }} style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${active ? C.aureus : "rgba(200,169,110,0.2)"}`, cursor: "pointer", fontSize: 10, fontFamily: "'EB Garamond', serif", background: active ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "rgba(14,15,11,0.88)", color: active ? C.carbon : C.aureus, backdropFilter: "blur(8px)" }}>{f}</button>
          );
        })}
      </div>
      {/* right: 88 keeps the scrolling chips from sliding under the 👥 Friends pill */}
      <div style={{ position: "absolute", top: 84, left: 0, right: 88, zIndex: 10, display: "flex", gap: 6, padding: "0 12px", overflowX: "auto" }}>
        {DEAL_TAGS.map(t => {
          const active = dealTag === t;
          return (
            <button key={t} onClick={() => setDealTag(cur => cur === t ? null : t)} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 20, border: `1px solid ${active ? C.aureus : "rgba(200,169,110,0.25)"}`, cursor: "pointer", fontSize: 10, fontFamily: "'EB Garamond', serif", background: active ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "rgba(14,15,11,0.88)", color: active ? C.carbon : C.aureus, backdropFilter: "blur(8px)", whiteSpace: "nowrap", boxShadow: active ? `0 0 10px rgba(200,169,110,0.5)` : "none" }}>✦ {t}</button>
          );
        })}
      </div>
      <div style={{ position: "absolute", top: 48, left: 12, zIndex: 10, display: "flex", background: "rgba(14,15,11,0.88)", borderRadius: 20, border: `1px solid rgba(200,169,110,0.25)`, padding: 2, backdropFilter: "blur(8px)" }}>
        {["local", "visitor"].map(m => (
          <button key={m} onClick={() => { modeOverrideRef.current = true; setMode(m); }}
            style={{ padding: "5px 14px", borderRadius: 18, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", fontFamily: "sans-serif",
              background: mode === m ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "transparent",
              color: mode === m ? C.carbon : C.aureus }}>
            {m === "local" ? "Local" : "Visitor"}
          </button>
        ))}
      </div>
      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(14,15,11,0.88)", borderRadius: 20, padding: "5px 10px", border: `1px solid rgba(200,169,110,0.2)`, backdropFilter: "blur(8px)" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.packed, boxShadow: `0 0 8px ${C.packed}`, opacity: pulse ? 1 : 0.3, transition: "opacity 0.5s" }} />
          <span style={{ fontSize: 9, color: C.marble, fontFamily: "sans-serif", fontWeight: 700, letterSpacing: 1.5 }}>LIVE</span>
        </div>
        <div style={{ background: "rgba(14,15,11,0.88)", borderRadius: 12, padding: "4px 10px", backdropFilter: "blur(8px)", border: `1px solid rgba(200,169,110,0.15)` }}>
          <span style={{ fontSize: 10, color: C.aureus, fontFamily: "'EB Garamond', serif" }}>{currentCity}</span>
        </div>
        <button onClick={() => setShowFriends(true)}
          style={{ background: "rgba(14,15,11,0.88)", borderRadius: 12, padding: "4px 10px", backdropFilter: "blur(8px)", border: `1px solid rgba(200,169,110,0.25)`, cursor: "pointer" }}>
          <span style={{ fontSize: 10, color: C.aureus, fontFamily: "'EB Garamond', serif" }}>👥 Friends</span>
        </button>
      </div>
      <div style={{ flex: 1, position: "relative" }}>
        <MapboxMap
          ref={mapRef}
          mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
          initialViewState={{ latitude: cityCenter?.lat ?? 35.2271, longitude: cityCenter?.lng ?? -80.8431, zoom: 14 }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          style={{ position: "absolute", inset: 0 }}
          onLoad={() => loadVenues()}
          onMoveEnd={handleMoveEnd}
          onClick={handleMapClick}
          interactiveLayerIds={["venue-points"]}
        >
          <Source id="venues" type="geojson" data={geojson}>
            {/* toggle visibility instead of unmounting so layer order stays stable */}
            <Layer {...HEATMAP_LAYER} layout={{ visibility: dealTag ? "none" : "visible" }} />
            <Layer {...(dealTag ? DEAL_CIRCLE_LAYER : CIRCLE_LAYER)} />
          </Source>
          {liveEventVenues.map(le => (
            <Marker key={`live-${le.venue.id}`} latitude={parseFloat(le.venue.latitude)} longitude={parseFloat(le.venue.longitude)} anchor="bottom" offset={[0, -12]}>
              <div onClick={e => { e.stopPropagation(); setDetailVenue(venues.find(v => v.id === le.venue.id) || le.venue); }}
                style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 4, background: "rgba(14,15,11,0.92)", border: `1px solid ${C.buzzing}`, borderRadius: 12, padding: "3px 8px", boxShadow: pulse ? `0 0 14px rgba(80,220,140,0.6)` : `0 0 4px rgba(80,220,140,0.25)`, transition: "box-shadow 0.6s" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.buzzing, boxShadow: `0 0 6px ${C.buzzing}`, opacity: pulse ? 1 : 0.35, transition: "opacity 0.6s" }} />
                <span style={{ fontSize: 8, fontWeight: 700, color: C.buzzing, fontFamily: "sans-serif", letterSpacing: 1, whiteSpace: "nowrap" }}>EVENT NOW{le.count > 1 ? ` · ${le.count}` : ""}</span>
              </div>
            </Marker>
          ))}
          {friendPins.map(f => (
            <Marker key={f.friendship_id} latitude={parseFloat(f.location.latitude)} longitude={parseFloat(f.location.longitude)} anchor="center">
              <div onClick={e => { e.stopPropagation(); setActiveFriend(f); }}
                style={{ width: 28, height: 28, borderRadius: "50%", cursor: "pointer", background: `linear-gradient(135deg, rgba(200,169,110,0.5), rgba(14,15,11,0.9))`, border: `2px solid ${C.aureus}`, boxShadow: `0 0 0 2px rgba(14,15,11,0.9), 0 2px 8px rgba(0,0,0,0.6)`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {f.friend?.avatar_url
                  ? <img src={f.friend.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontSize: 12, color: C.marble, fontFamily: "'Playfair Display', serif", fontWeight: 700 }}>{(f.friend?.display_name || f.friend?.username || "?")[0].toUpperCase()}</span>}
              </div>
            </Marker>
          ))}
          {selfPos && (
            <Marker latitude={selfPos.lat} longitude={selfPos.lng} anchor="center">
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg, rgba(200,169,110,0.5), rgba(14,15,11,0.9))`, border: `2px solid ${C.ivory}`, boxShadow: pulse ? `0 0 0 2px rgba(14,15,11,0.9), 0 0 16px ${C.aureus}` : `0 0 0 2px rgba(14,15,11,0.9), 0 0 6px ${C.aureus}`, transition: "box-shadow 0.6s", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {user?.avatar_url
                  ? <img src={user.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontSize: 13, color: C.marble, fontFamily: "'Playfair Display', serif", fontWeight: 700 }}>{(user?.display_name || user?.username || "?")[0].toUpperCase()}</span>}
              </div>
            </Marker>
          )}
        </MapboxMap>
      </div>
      {loading && (
        <div style={{ position: "absolute", top: 50, left: "50%", transform: "translateX(-50%)", zIndex: 15, background: "rgba(14,15,11,0.88)", borderRadius: 20, padding: "6px 14px", backdropFilter: "blur(8px)", border: `1px solid rgba(200,169,110,0.2)` }}>
          <span style={{ color: C.aureus, fontSize: 11, fontFamily: "'EB Garamond', serif" }}>Loading venues...</span>
        </div>
      )}
      {mapMsg && (
        <div style={{ position: "absolute", top: 80, left: "50%", transform: "translateX(-50%)", zIndex: 25, background: "rgba(42,13,13,0.95)", borderRadius: 20, padding: "6px 14px", backdropFilter: "blur(8px)", border: `1px solid rgba(255,107,107,0.4)`, maxWidth: "85%", textAlign: "center" }}>
          <span style={{ color: "#FF6B6B", fontSize: 11, fontFamily: "'EB Garamond', serif" }}>{mapMsg}</span>
        </div>
      )}
      {dealTag && dealVenueIds && filtered.length === 0 && (
        <div style={{ position: "absolute", top: 120, left: "50%", transform: "translateX(-50%)", zIndex: 15, background: "rgba(14,15,11,0.92)", borderRadius: 20, padding: "6px 14px", backdropFilter: "blur(8px)", border: `1px solid rgba(200,169,110,0.3)`, whiteSpace: "nowrap" }}>
          <span style={{ color: C.aureus, fontSize: 11, fontFamily: "'EB Garamond', serif" }}>No {dealTag} deals here right now</span>
        </div>
      )}
      {/* City chips and venue cards stack in one column so taller cards (POPULAR/LOCAL FAVORITE badge) can't slide under the chips */}
      <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, zIndex: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, padding: "0 12px", overflowX: "auto" }}>
        {CITIES.map(c => (
          <button key={c.name} onClick={() => goToCity(c.name)} style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 12, border: `1px solid ${currentCity === c.name ? C.aureus : "rgba(200,169,110,0.15)"}`, cursor: "pointer", background: currentCity === c.name ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "rgba(14,15,11,0.88)", color: currentCity === c.name ? C.carbon : C.marble, fontSize: 9, fontFamily: "'EB Garamond', serif", backdropFilter: "blur(8px)" }}>{c.name.split(",")[0]}</button>
        ))}
      </div>
      {filtered.length > 0 && (
        <div style={{ display: "flex", gap: 8, padding: "0 12px", overflowX: "auto" }}>
          {filtered.slice(0, 8).map(v => (
            <div key={v.id} onClick={() => setDetailVenue(v)}
              style={{ flexShrink: 0, background: "rgba(14,15,11,0.92)", borderRadius: 12, padding: "8px 12px", border: `1px solid rgba(200,169,110,0.15)`, cursor: "pointer", backdropFilter: "blur(8px)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.marble, whiteSpace: "nowrap", fontFamily: "'EB Garamond', serif" }}>{v.name}</div>
              {mode === "local" && (v.report_count || 0) > 0 && (v.busy_score || 0) <= 40 && (
                <div style={{ fontSize: 8, color: C.carbon, background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, borderRadius: 8, padding: "2px 6px", marginTop: 3, display: "inline-block", fontFamily: "sans-serif", fontWeight: 700, letterSpacing: 0.5 }}>LOCAL FAVORITE</div>
              )}
              {mode === "visitor" && (v.busy_score || 0) >= 60 && (
                <div style={{ fontSize: 8, color: C.carbon, background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, borderRadius: 8, padding: "2px 6px", marginTop: 3, display: "inline-block", fontFamily: "sans-serif", fontWeight: 700, letterSpacing: 0.5 }}>POPULAR</div>
              )}
              <div style={{ fontSize: 9, color: getBusyColor(v.busy_score || 0), fontWeight: 700, marginTop: 2, fontFamily: "sans-serif", letterSpacing: 0.5 }}>{getBusyLabel(v.busy_score || 0)} · {v.busy_score || 0}%</div>
            </div>
          ))}
        </div>
      )}
      </div>
      {activeFriend && (
        <div style={{ position: "absolute", top: 90, left: "50%", transform: "translateX(-50%)", zIndex: 15, background: "rgba(14,15,11,0.94)", borderRadius: 14, padding: "10px 16px", border: `1px solid rgba(200,169,110,0.3)`, backdropFilter: "blur(8px)", display: "flex", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif" }}>{activeFriend.friend?.display_name || activeFriend.friend?.username}</div>
            <div style={{ fontSize: 10, color: C.aureus, fontFamily: "'EB Garamond', serif" }}>📍 at {activeFriend.location?.venues?.name || "a venue"}</div>
          </div>
          <button onClick={() => setActiveFriend(null)} style={{ background: "none", border: "none", cursor: "pointer", color: C.aureus, fontSize: 14 }}>✕</button>
        </div>
      )}
      {detailVenue && <VenueDetailScreen venue={detailVenue} token={token} onClose={() => setDetailVenue(null)} onReported={() => loadVenues()} onClaim={onClaimVenue} />}
      {showFriends && <FriendsScreen token={token} onClose={() => setShowFriends(false)} />}
    </div>
  );
}

function FriendsScreen({ token, onClose }) {
  const [requests, setRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addUsername, setAddUsername] = useState("");
  const [addMsg, setAddMsg] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const searchTimerRef = useRef(null);
  const searchSeqRef = useRef(0);

  async function reload() {
    const [reqs, frs] = await Promise.all([
      apiFetch("/api/friends/requests", {}, token),
      apiFetch("/api/friends", {}, token),
    ]);
    if (Array.isArray(reqs)) setRequests(reqs);
    if (Array.isArray(frs)) setFriends(frs);
    setLoading(false);
  }
  useEffect(() => { reload(); }, []);

  async function accept(id) {
    const result = await apiFetch(`/api/friends/${id}/accept`, { method: "PATCH" }, token);
    if (result?.error) return setActionError(result.error);
    setActionError(null);
    reload();
  }
  async function remove(id) {
    const result = await apiFetch(`/api/friends/${id}`, { method: "DELETE" }, token);
    setConfirmRemove(null);
    if (result?.error) return setActionError(result.error);
    setActionError(null);
    reload();
  }

  function onAddInput(value) {
    setAddUsername(value); setAddMsg(null);
    clearTimeout(searchTimerRef.current);
    const q = value.trim();
    if (q.length < 2) { setSuggestions([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      const seq = ++searchSeqRef.current;
      const data = await apiFetch(`/api/friends/search?q=${encodeURIComponent(q)}`, {}, token);
      if (seq === searchSeqRef.current && Array.isArray(data)) setSuggestions(data);
    }, 300);
  }
  useEffect(() => () => clearTimeout(searchTimerRef.current), []);

  async function sendRequestTo(username) {
    if (!username || sending) return;
    setSending(true); setAddMsg(null);
    const result = await apiFetch("/api/friends/request", { method: "POST", body: JSON.stringify({ username }) }, token);
    if (result?.error) setAddMsg({ ok: false, text: result.error });
    else { setAddMsg({ ok: true, text: "Request sent!" }); setAddUsername(""); setSuggestions([]); }
    setSending(false);
  }
  const sendRequest = () => sendRequestTo(addUsername.trim());

  const Avatar = ({ u }) => (
    <div style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, background: `linear-gradient(135deg, rgba(200,169,110,0.3), rgba(200,169,110,0.1))`, border: `1px solid rgba(200,169,110,0.3)`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {u?.avatar_url
        ? <img src={u.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: 15, color: C.aureus, fontFamily: "'Playfair Display', serif", fontWeight: 700 }}>{(u?.display_name || u?.username || "?")[0].toUpperCase()}</span>}
    </div>
  );
  const sectionLabel = { fontSize: 9, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 2, textTransform: "uppercase", margin: "16px 0 8px" };
  const card = { background: "rgba(200,169,110,0.04)", borderRadius: 14, padding: 12, border: `1px solid rgba(200,169,110,0.12)`, display: "flex", gap: 10, alignItems: "center" };

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 30, background: C.mapBg, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid rgba(200,169,110,0.1)` }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif" }}>Friends</div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.aureus, fontSize: 18 }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 20px" }}>
        {loading && <div style={{ textAlign: "center", color: C.aureus, fontSize: 13, padding: 24, fontFamily: "'EB Garamond', serif", opacity: 0.6 }}>Loading...</div>}
        {actionError && (
          <div style={{ marginTop: 12, background: "rgba(255,45,45,0.08)", border: `1px solid rgba(255,45,45,0.3)`, borderRadius: 12, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "#FF6B6B", fontFamily: "'EB Garamond', serif" }}>{actionError}</span>
            <button onClick={() => setActionError(null)} style={{ background: "none", border: "none", color: "#FF6B6B", cursor: "pointer", fontSize: 12 }}>✕</button>
          </div>
        )}
        {!loading && (
          <>
            {requests.length > 0 && (
              <>
                <div style={sectionLabel}>Pending Requests</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {requests.map(r => (
                    <div key={r.friendship_id} style={card}>
                      <Avatar u={r.requester} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif" }}>{r.requester?.display_name || r.requester?.username}</div>
                        <div style={{ fontSize: 10, color: C.aureus, opacity: 0.6, fontFamily: "'EB Garamond', serif" }}>@{r.requester?.username} · {timeAgo(r.created_at)}</div>
                      </div>
                      <button onClick={() => accept(r.friendship_id)} style={{ padding: "6px 12px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: C.carbon, fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "'Playfair Display', serif" }}>Accept</button>
                      <button onClick={() => remove(r.friendship_id)} style={{ padding: "6px 10px", borderRadius: 12, border: `1px solid rgba(200,169,110,0.25)`, background: "transparent", color: C.aureus, fontSize: 11, cursor: "pointer", fontFamily: "'EB Garamond', serif" }}>Decline</button>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div style={sectionLabel}>My Friends</div>
            {friends.length === 0 && <div style={{ fontSize: 12, color: C.marble, opacity: 0.4, fontFamily: "'EB Garamond', serif", padding: "4px 0 8px" }}>No friends yet — add someone below.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {friends.map(f => (
                <div key={f.friendship_id} style={card}>
                  <Avatar u={f.friend} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif" }}>{f.friend?.display_name || f.friend?.username}</div>
                    <div style={{ fontSize: 10, color: C.aureus, opacity: 0.6, fontFamily: "'EB Garamond', serif" }}>@{f.friend?.username}</div>
                    {f.location?.venues?.name && (
                      <div style={{ fontSize: 10, color: C.aureus, fontFamily: "'EB Garamond', serif", marginTop: 2 }}>📍 at {f.location.venues.name}</div>
                    )}
                  </div>
                  {confirmRemove === f.friendship_id ? (
                    <button onClick={() => remove(f.friendship_id)} style={{ padding: "6px 10px", borderRadius: 12, border: `1px solid rgba(255,45,45,0.4)`, background: "rgba(255,45,45,0.08)", color: "#FF2D2D", fontSize: 10, cursor: "pointer", fontFamily: "sans-serif", fontWeight: 700 }}>Confirm?</button>
                  ) : (
                    <button onClick={() => setConfirmRemove(f.friendship_id)} style={{ padding: "6px 10px", borderRadius: 12, border: `1px solid rgba(200,169,110,0.2)`, background: "transparent", color: C.aureus, fontSize: 10, cursor: "pointer", fontFamily: "'EB Garamond', serif", opacity: 0.7 }}>✕ Unfriend</button>
                  )}
                </div>
              ))}
            </div>
            <div style={sectionLabel}>Add Friend</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={addUsername} onChange={e => onAddInput(e.target.value)} placeholder="Search by username..."
                onKeyDown={e => { if (e.key === "Enter") sendRequest(); }}
                style={{ flex: 1, background: "rgba(200,169,110,0.06)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 20, padding: "8px 14px", color: C.marble, fontSize: 16, fontFamily: "'EB Garamond', serif", outline: "none" }} />
              <button onClick={sendRequest} disabled={sending || !addUsername.trim()}
                style={{ padding: "8px 14px", borderRadius: 20, border: "none", background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: C.carbon, fontWeight: 700, fontSize: 12, cursor: (sending || !addUsername.trim()) ? "default" : "pointer", opacity: (sending || !addUsername.trim()) ? 0.5 : 1, fontFamily: "'Playfair Display', serif" }}>Send</button>
            </div>
            {suggestions.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {suggestions.map(u => (
                  <button key={u.id} onClick={() => sendRequestTo(u.username)} disabled={sending} style={{ ...card, cursor: "pointer", width: "100%", textAlign: "left", opacity: sending ? 0.6 : 1 }}>
                    <Avatar u={u} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif" }}>{u.display_name || u.username}</div>
                      <div style={{ fontSize: 10, color: C.aureus, opacity: 0.6, fontFamily: "'EB Garamond', serif" }}>@{u.username}</div>
                    </div>
                    <span style={{ fontSize: 10, color: C.aureus, fontFamily: "sans-serif", flexShrink: 0 }}>+ Add</span>
                  </button>
                ))}
              </div>
            )}
            {addMsg && <div style={{ marginTop: 8, fontSize: 11, color: addMsg.ok ? C.aureus : "#e07a6a", fontFamily: "'EB Garamond', serif" }}>{addMsg.text}</div>}
          </>
        )}
      </div>
    </div>
  );
}

function StoriesScreen({ token }) {
  const [stories, setStories] = useState([]);
  const [active, setActive] = useState(null);
  const [liked, setLiked] = useState({});
  const [loading, setLoading] = useState(true);
  const [newCaption, setNewCaption] = useState("");
  const [posting, setPosting] = useState(false);
  const [venueQuery, setVenueQuery] = useState("");
  const [venueResults, setVenueResults] = useState([]);
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [postError, setPostError] = useState("");
  const [storyVisibility, setStoryVisibility] = useState("public");
  const [feedError, setFeedError] = useState("");
  const [photo, setPhoto] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef(null);

  async function onPhotoPicked(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true); setPostError("");
    try { setPhoto(await compressImage(file)); }
    catch { setPostError("Couldn't read that photo — try another."); }
    setPhotoBusy(false);
  }

  useEffect(() => {
    apiFetch("/api/stories", {}, token).then(data => {
      if (Array.isArray(data)) { setStories(data); setFeedError(""); }
      else if (data?.error) setFeedError(data.error);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (selectedVenue || venueQuery.trim().length < 2) { setVenueResults([]); return; }
    const t = setTimeout(() => {
      apiFetch(`/api/venues/search?q=${encodeURIComponent(venueQuery.trim())}`, {}, token)
        .then(data => { if (Array.isArray(data)) setVenueResults(data.slice(0, 5)); })
        .catch(() => setVenueResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [venueQuery, selectedVenue]);

  async function postStory() {
    if (!newCaption.trim() || !selectedVenue || posting) return;
    setPosting(true); setPostError("");
    const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    try {
      let media_url = null;
      if (photo) {
        const up = await apiFetch("/api/stories/upload", { method: "POST", body: JSON.stringify({ image: photo }) }, token);
        if (up?.error) { setPostError(up.error); setPosting(false); return; }
        media_url = up.media_url;
      }
      const result = await apiFetch("/api/stories", { method: "POST", body: JSON.stringify({ venue_id: selectedVenue.id, caption: newCaption, emoji, visibility: storyVisibility, media_url }) }, token);
      if (result?.error) { setPostError(result.error); setPosting(false); return; }
      const data = await apiFetch("/api/stories", {}, token);
      if (Array.isArray(data)) { setStories(data); setFeedError(""); }
      else if (data?.error) setFeedError(data.error);
      setNewCaption(""); setSelectedVenue(null); setVenueQuery(""); setPhoto(null);
    } catch {
      setPostError("Failed to post story. Try again.");
    }
    setPosting(false);
  }

  async function toggleLike(storyId) {
    const result = await apiFetch(`/api/stories/${storyId}/like`, { method: "POST" }, token);
    if (result?.error) return;
    setLiked(l => ({ ...l, [storyId]: !l[storyId] }));
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: C.mapBg }}>
      <div style={{ padding: "12px 16px 8px", borderBottom: `1px solid rgba(200,169,110,0.1)` }}>
        {selectedVenue ? (
          <div onClick={() => { setSelectedVenue(null); setVenueQuery(""); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 8, padding: "5px 12px", borderRadius: 16, background: "rgba(200,169,110,0.15)", border: `1px solid rgba(200,169,110,0.4)`, cursor: "pointer" }}>
            <span style={{ fontSize: 12, color: C.aureus, fontFamily: "'Playfair Display', serif", fontWeight: 700 }}>📍 {selectedVenue.name}</span>
            <span style={{ fontSize: 11, color: C.aureus, opacity: 0.7 }}>✕</span>
          </div>
        ) : (
          <div style={{ marginBottom: 8, position: "relative" }}>
            <input value={venueQuery} onChange={e => setVenueQuery(e.target.value)} placeholder="Search for a venue..."
              style={{ width: "100%", boxSizing: "border-box", background: "rgba(200,169,110,0.06)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 20, padding: "8px 14px", color: C.marble, fontSize: 16, fontFamily: "'EB Garamond', serif", outline: "none" }} />
            {venueResults.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 40, marginTop: 4, background: C.obsidian, border: `1px solid rgba(200,169,110,0.25)`, borderRadius: 12, overflow: "hidden" }}>
                {venueResults.map(v => (
                  <div key={v.id} onClick={() => { setSelectedVenue(v); setVenueResults([]); }}
                    style={{ padding: "8px 14px", cursor: "pointer", borderBottom: `1px solid rgba(200,169,110,0.08)` }}>
                    <div style={{ fontSize: 13, color: C.marble, fontFamily: "'Playfair Display', serif" }}>{v.name}</div>
                    <div style={{ fontSize: 10, color: C.aureus, opacity: 0.6, fontFamily: "'EB Garamond', serif" }}>{[v.neighborhood, v.city].filter(Boolean).join(" · ")}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div style={{ display: "inline-flex", marginBottom: 8, background: "rgba(200,169,110,0.06)", borderRadius: 16, border: `1px solid rgba(200,169,110,0.2)`, padding: 2 }}>
          {[["public", "🌐 Public"], ["friends", "👥 Friends Only"]].map(([val, label]) => (
            <button key={val} onClick={() => setStoryVisibility(val)}
              style={{ padding: "4px 12px", borderRadius: 14, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, fontFamily: "sans-serif", letterSpacing: 0.5,
                background: storyVisibility === val ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "transparent",
                color: storyVisibility === val ? C.carbon : C.aureus }}>
              {label}
            </button>
          ))}
        </div>
        {photo && (
          <div style={{ position: "relative", display: "inline-block", marginBottom: 8 }}>
            <img src={photo} alt="" style={{ height: 72, borderRadius: 12, border: `1px solid rgba(200,169,110,0.3)`, display: "block" }} />
            <button onClick={() => setPhoto(null)} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", border: "none", background: C.obsidian, color: C.aureus, fontSize: 11, cursor: "pointer", lineHeight: 1 }}>✕</button>
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPhotoPicked} style={{ display: "none" }} />
          <button onClick={() => fileRef.current?.click()} disabled={photoBusy}
            style={{ width: 38, borderRadius: 20, border: `1px solid rgba(200,169,110,0.25)`, background: photo ? "rgba(200,169,110,0.15)" : "rgba(200,169,110,0.06)", color: C.aureus, fontSize: 15, cursor: "pointer", opacity: photoBusy ? 0.5 : 1 }}>{photoBusy ? "…" : "📷"}</button>
          <input value={newCaption} onChange={e => setNewCaption(e.target.value)} placeholder="What's happening at a venue?"
            style={{ flex: 1, background: "rgba(200,169,110,0.06)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 20, padding: "8px 14px", color: C.marble, fontSize: 16, fontFamily: "'EB Garamond', serif", outline: "none" }} />
          <button onClick={postStory} disabled={posting || !newCaption.trim() || !selectedVenue}
            style={{ padding: "8px 14px", borderRadius: 20, border: "none", background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: C.carbon, fontWeight: 700, fontSize: 12, cursor: (posting || !newCaption.trim() || !selectedVenue) ? "default" : "pointer", opacity: (posting || !newCaption.trim() || !selectedVenue) ? 0.5 : 1, fontFamily: "'Playfair Display', serif" }}>{posting ? "..." : "Post"}</button>
        </div>
        {postError && <div style={{ marginTop: 6, fontSize: 11, color: "#e07a6a", fontFamily: "'EB Garamond', serif" }}>{postError}</div>}
      </div>
      {active && (
        <div onClick={() => setActive(null)} style={{ position: "absolute", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "85%", borderRadius: 24, overflow: "hidden", background: C.obsidian, border: `1px solid rgba(200,169,110,0.2)` }}>
            {active.media_url ? (
              <div style={{ position: "relative" }}>
                <img src={active.media_url} alt="" style={{ width: "100%", maxHeight: 340, objectFit: "cover", display: "block" }} onError={e => { e.currentTarget.style.display = "none"; }} />
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "18px 14px 8px", background: "linear-gradient(to top, rgba(14,15,11,0.85), transparent)", fontSize: 13, color: C.marble, fontFamily: "'Playfair Display', serif" }}>{active.venues?.name || "A venue"}</div>
              </div>
            ) : (
            <div style={{ height: 160, background: `linear-gradient(135deg, rgba(200,169,110,0.2), rgba(14,15,11,0.9))`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <div style={{ fontSize: 48 }}>{active.emoji || "📸"}</div>
              <div style={{ fontSize: 13, color: C.marble, fontFamily: "'Playfair Display', serif" }}>{active.venues?.name || "A venue"}</div>
            </div>
            )}
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 14, color: C.marble, fontFamily: "'EB Garamond', serif", fontStyle: "italic", marginBottom: 10 }}>"{active.caption}"</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 10, color: C.aureus, fontFamily: "'EB Garamond', serif", opacity: 0.7 }}>{active.is_anonymous ? "Anonymous" : active.users?.display_name || "Roamer"} · {timeAgo(active.created_at)}</div>
                <button onClick={() => toggleLike(active.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>
                  {liked[active.id] ? "❤️" : "🤍"} <span style={{ fontSize: 10, color: C.aureus }}>{active.like_count + (liked[active.id] ? 1 : 0)}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {loading && <div style={{ textAlign: "center", color: C.aureus, fontSize: 13, padding: 20, fontFamily: "'EB Garamond', serif", opacity: 0.6 }}>Loading stories...</div>}
        {!loading && feedError && <div style={{ textAlign: "center", color: "#e07a6a", fontSize: 13, padding: 20, fontFamily: "'EB Garamond', serif" }}>{feedError}</div>}
        {!loading && !feedError && stories.length === 0 && <div style={{ textAlign: "center", color: C.marble, fontSize: 13, padding: 20, fontFamily: "'EB Garamond', serif", opacity: 0.4 }}>No stories yet — be the first to post!</div>}
        {stories.map(s => (
          <div key={s.id} onClick={() => setActive(s)}
            style={{ background: "rgba(200,169,110,0.04)", borderRadius: 16, padding: 14, border: `1px solid rgba(200,169,110,0.12)`, cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start" }}>
            {s.media_url ? (
              <img src={s.media_url} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = "none"; }} style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover", border: `1px solid rgba(200,169,110,0.3)`, flexShrink: 0 }} />
            ) : (
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: `linear-gradient(135deg, rgba(200,169,110,0.3), rgba(200,169,110,0.1))`, border: `1px solid rgba(200,169,110,0.3)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{s.emoji || "📸"}</div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif" }}>{s.venues?.name || "A venue"}</span>
                <span style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", opacity: 0.6 }}>{timeAgo(s.created_at)}</span>
              </div>
              <div style={{ fontSize: 12, color: C.marble, fontFamily: "'EB Garamond', serif", fontStyle: "italic", marginBottom: 4, opacity: 0.8 }}>"{s.caption}"</div>
              <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", opacity: 0.5 }}>by {s.is_anonymous ? "Anonymous" : s.users?.display_name || "Roamer"} · {liked[s.id] ? "❤️" : "🤍"} {s.like_count + (liked[s.id] ? 1 : 0)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DealsScreen({ token, city }) {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tagFilter, setTagFilter] = useState(null);
  const [day, setDay] = useState(new Date().getDay()); // 0=Sun; defaults to today
  const { redeemed, receipt, setReceipt, redeem, redeemError } = useRedemptions(token);
  const today = new Date().getDay();

  useEffect(() => {
    let stale = false;
    setLoading(true);
    apiFetch(`/api/deals?city=${encodeURIComponent(city || "Charlotte")}&day=${day}`).then(data => {
      if (stale) return;
      if (Array.isArray(data)) setDeals(data);
      setLoading(false);
    });
    return () => { stale = true; };
  }, [city, day]);

  const visibleDeals = tagFilter ? deals.filter(d => d.tags?.includes(tagFilter)) : deals;
  // Reorder day chips to start at today, so the default view leads the row
  const dayOrder = Array.from({ length: 7 }, (_, i) => (today + i) % 7);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 16px", background: C.mapBg }}>
      <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8, opacity: 0.7 }}>{day === today ? "Today's" : DAY_LABELS[day] + "'s"} Deals · {city || "Charlotte"} · {visibleDeals.length}</div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 10, paddingBottom: 4 }}>
        {dayOrder.map(d => (
          <button key={d} onClick={() => setDay(d)} style={{ flexShrink: 0, padding: "5px 14px", borderRadius: 16, cursor: "pointer", fontSize: 11, fontFamily: "sans-serif", fontWeight: 700, letterSpacing: 0.5, border: `1px solid ${day === d ? C.aureus : "rgba(200,169,110,0.2)"}`, background: day === d ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "rgba(200,169,110,0.05)", color: day === d ? C.carbon : C.aureus, whiteSpace: "nowrap" }}>{d === today ? "Today" : DAY_LABELS[d]}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 12, paddingBottom: 4 }}>
        {DEAL_TAGS.map(t => (
          <button key={t} onClick={() => setTagFilter(f => f === t ? null : t)} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 16, cursor: "pointer", fontSize: 11, fontFamily: "'EB Garamond', serif", border: `1px solid ${tagFilter === t ? C.aureus : "rgba(200,169,110,0.2)"}`, background: tagFilter === t ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "rgba(200,169,110,0.05)", color: tagFilter === t ? C.carbon : C.aureus, whiteSpace: "nowrap" }}>{t}</button>
        ))}
      </div>
      {redeemError && (
        <div style={{ background: "rgba(255,45,45,0.1)", border: "1px solid rgba(255,45,45,0.3)", borderRadius: 12, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#FF6B6B", fontFamily: "'EB Garamond', serif" }}>{redeemError}</div>
      )}
      {loading && <div style={{ textAlign: "center", color: C.aureus, fontSize: 13, padding: 20, fontFamily: "'EB Garamond', serif", opacity: 0.6 }}>Loading deals...</div>}
      {!loading && visibleDeals.length === 0 && <div style={{ textAlign: "center", color: C.marble, fontSize: 13, padding: 20, fontFamily: "'EB Garamond', serif", opacity: 0.4 }}>{tagFilter ? `No ${tagFilter} deals ${day === today ? "today" : "on " + DAY_LABELS[day]} — try another tag or day.` : `No deals ${day === today ? "today" : "on " + DAY_LABELS[day]} — try another day.`}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {visibleDeals.map(d => {
          const isRedeemed = redeemed[d.id];
          return (
            <div key={d.id} style={{ background: isRedeemed ? "rgba(200,169,110,0.02)" : "rgba(200,169,110,0.05)", borderRadius: 18, padding: 16, border: `1px solid ${isRedeemed ? "rgba(200,169,110,0.06)" : "rgba(200,169,110,0.18)"}`, opacity: isRedeemed ? 0.5 : 1, transition: "all 0.3s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.aureus, boxShadow: `0 0 6px ${C.aureus}` }} />
                    <span style={{ fontSize: 10, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 1 }}>{d.venues?.name}</span>
                    {day === today && d.is_live_now && <span style={{ fontSize: 8, color: C.carbon, background: `linear-gradient(135deg, ${C.buzzing}, #7FE3A8)`, borderRadius: 6, padding: "2px 6px", fontFamily: "sans-serif", fontWeight: 700, letterSpacing: 0.5 }}>LIVE NOW</span>}
                    {d.is_premium_only && <span style={{ fontSize: 8, color: C.aureus, background: "rgba(200,169,110,0.1)", border: `1px solid rgba(200,169,110,0.3)`, borderRadius: 6, padding: "2px 6px" }}>✦ PREMIUM</span>}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif" }}>{d.title}</div>
                  <div style={{ fontSize: 11, color: C.marble, fontFamily: "'EB Garamond', serif", marginTop: 2, opacity: 0.6 }}>{d.detail}</div>
                  {d.tags?.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
                      {d.tags.map(t => (
                        <span key={t} style={{ fontSize: 9, color: C.aureus, background: "rgba(200,169,110,0.08)", border: `1px solid rgba(200,169,110,0.25)`, borderRadius: 8, padding: "2px 7px", fontFamily: "sans-serif", letterSpacing: 0.5 }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", maxWidth: 110 }}>
                  <div style={{ fontSize: 9, color: C.marble, opacity: 0.4, fontFamily: "sans-serif" }}>{d.recur_days ? "Recurring" : "Expires"}</div>
                  <div style={{ fontSize: 11, color: C.aureus, fontFamily: "'EB Garamond', serif" }}>{d.recur_days ? recurLabel(d) : new Date(d.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 10, color: C.marble, opacity: 0.3, fontFamily: "sans-serif" }}>💾 {d.save_count} saved</div>
                {d.source === "scraped" ? (
                  <span style={{ padding: "7px 12px", borderRadius: 12, border: "1px solid rgba(232,230,225,0.18)", fontSize: 9, color: C.marble, opacity: 0.55, fontFamily: "sans-serif", letterSpacing: 1, textTransform: "uppercase" }}>Not owner verified</span>
                ) : (
                <button onClick={() => redeem(d)} style={{ padding: "7px 18px", borderRadius: 12, border: isRedeemed ? `1px solid rgba(200,169,110,0.4)` : "none", cursor: d.is_premium_only && !isRedeemed ? "not-allowed" : "pointer", fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 11, letterSpacing: 0.5, background: isRedeemed ? "rgba(200,169,110,0.1)" : d.is_premium_only ? "rgba(200,169,110,0.1)" : `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: isRedeemed || d.is_premium_only ? C.aureus : C.carbon }}>
                  {isRedeemed ? "View Receipt" : d.is_premium_only ? "🔒 Premium" : "Redeem"}
                </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {receipt && <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function EventsScreen({ token, city }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dayFilter, setDayFilter] = useState(null);
  const { redeemed, receipt, setReceipt, redeem, redeemError } = useRedemptions(token);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    apiFetch(`/api/events?city=${encodeURIComponent(city || "Charlotte")}`).then(data => {
      if (stale) return;
      if (Array.isArray(data)) setEvents(data);
      setLoading(false);
    });
    return () => { stale = true; };
  }, [city]);

  const days = useMemo(() => {
    const out = [];
    const d = new Date();
    for (let i = 0; i < 7; i++) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      out.push({ dateStr, label: i === 0 ? "Today" : `${DAY_LABELS[d.getDay()]} ${d.getDate()}` });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, []);

  const visible = dayFilter ? events.filter(e => e.occurrences?.includes(dayFilter)) : events;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 16px", background: C.mapBg }}>
      <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8, opacity: 0.7 }}>What's On · {city || "Charlotte"} · {visible.length} {visible.length === 1 ? "event" : "events"}</div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 12, paddingBottom: 4 }}>
        <button onClick={() => setDayFilter(null)} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 16, cursor: "pointer", fontSize: 11, fontFamily: "'EB Garamond', serif", border: `1px solid ${dayFilter === null ? C.aureus : "rgba(200,169,110,0.2)"}`, background: dayFilter === null ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "rgba(200,169,110,0.05)", color: dayFilter === null ? C.carbon : C.aureus, whiteSpace: "nowrap" }}>All</button>
        {days.map(d => (
          <button key={d.dateStr} onClick={() => setDayFilter(f => f === d.dateStr ? null : d.dateStr)} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 16, cursor: "pointer", fontSize: 11, fontFamily: "'EB Garamond', serif", border: `1px solid ${dayFilter === d.dateStr ? C.aureus : "rgba(200,169,110,0.2)"}`, background: dayFilter === d.dateStr ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "rgba(200,169,110,0.05)", color: dayFilter === d.dateStr ? C.carbon : C.aureus, whiteSpace: "nowrap" }}>{d.label}</button>
        ))}
      </div>
      {redeemError && (
        <div style={{ background: "rgba(255,45,45,0.1)", border: "1px solid rgba(255,45,45,0.3)", borderRadius: 12, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#FF6B6B", fontFamily: "'EB Garamond', serif" }}>{redeemError}</div>
      )}
      {loading && <div style={{ textAlign: "center", color: C.aureus, fontSize: 13, padding: 20, fontFamily: "'EB Garamond', serif", opacity: 0.6 }}>Loading events...</div>}
      {!loading && visible.length === 0 && <div style={{ textAlign: "center", color: C.marble, fontSize: 13, padding: 20, fontFamily: "'EB Garamond', serif", opacity: 0.4 }}>{dayFilter ? "Nothing on that day — try another." : "No upcoming events — check back soon!"}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {visible.map(e => (
          <div key={e.id} style={{ background: "rgba(200,169,110,0.05)", borderRadius: 18, border: `1px solid rgba(200,169,110,0.18)`, overflow: "hidden" }}>
            {e.cover_image_url && (
              <img src={e.cover_image_url} alt="" loading="lazy" onError={ev => { ev.currentTarget.style.display = "none"; }} style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />
            )}
            <div style={{ padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.aureus, boxShadow: `0 0 6px ${C.aureus}` }} />
                <span style={{ fontSize: 10, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 1 }}>{e.venues?.name}</span>
                {e.is_now && <span style={{ fontSize: 8, color: C.carbon, background: `linear-gradient(135deg, ${C.buzzing}, #7FE3A8)`, borderRadius: 6, padding: "2px 6px", fontFamily: "sans-serif", fontWeight: 700, letterSpacing: 0.5 }}>HAPPENING NOW</span>}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif" }}>{e.title}</div>
              <div style={{ fontSize: 11, color: C.aureus, fontFamily: "'EB Garamond', serif", marginTop: 3 }}>{e.recur_days ? "↻ " : ""}{eventScheduleLabel(e)}</div>
              {e.description && <div style={{ fontSize: 11, color: C.marble, fontFamily: "'EB Garamond', serif", marginTop: 3, opacity: 0.6 }}>{e.description}</div>}
              {e.tags?.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                  {e.tags.map(t => (
                    <span key={t} style={{ fontSize: 9, color: C.aureus, background: "rgba(200,169,110,0.08)", border: `1px solid rgba(200,169,110,0.25)`, borderRadius: 8, padding: "2px 7px", fontFamily: "sans-serif", letterSpacing: 0.5 }}>{t}</span>
                  ))}
                </div>
              )}
              {e.deals?.length > 0 && (
                <div style={{ marginTop: 10, borderTop: `1px solid rgba(200,169,110,0.12)`, paddingTop: 8 }}>
                  <div style={{ fontSize: 8, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.7, marginBottom: 6 }}>✦ Deals at this event</div>
                  {e.deals.map(d => {
                    const dealForModal = { ...d, venues: { name: e.venues?.name, city: e.venues?.city } };
                    const isRedeemed = redeemed[d.id];
                    return (
                      <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "5px 0" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: C.marble, fontFamily: "'EB Garamond', serif" }}>{d.title}</div>
                          {d.detail && <div style={{ fontSize: 10, color: C.marble, opacity: 0.5, fontFamily: "'EB Garamond', serif" }}>{d.detail}</div>}
                        </div>
                        {d.source === "scraped" ? (
                          <span style={{ flexShrink: 0, padding: "6px 10px", borderRadius: 10, border: "1px solid rgba(232,230,225,0.18)", fontSize: 8, color: C.marble, opacity: 0.55, fontFamily: "sans-serif", letterSpacing: 1, textTransform: "uppercase" }}>Not owner verified</span>
                        ) : (
                        <button onClick={() => redeem(dealForModal)} style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 10, border: isRedeemed ? `1px solid rgba(200,169,110,0.4)` : "none", cursor: d.is_premium_only && !isRedeemed ? "not-allowed" : "pointer", fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 10, letterSpacing: 0.5, background: isRedeemed ? "rgba(200,169,110,0.1)" : d.is_premium_only ? "rgba(200,169,110,0.1)" : `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: isRedeemed || d.is_premium_only ? C.aureus : C.carbon }}>
                          {isRedeemed ? "View Receipt" : d.is_premium_only ? "🔒 Premium" : "Redeem"}
                        </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {receipt && <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function DashboardScreen({ token, user, claimRequest, onClaimRequestHandled }) {
  const [venues, setVenues] = useState([]);
  const [selected, setSelected] = useState(null);
  const [dash, setDash] = useState(null);
  const [newDeal, setNewDeal] = useState({ title: "", detail: "", expires_at: "", tags: [] });
  const [dealMode, setDealMode] = useState("once");
  const [recur, setRecur] = useState({ days: [], start: "", end: "" });
  const [newEvent, setNewEvent] = useState({ title: "", description: "", cover_image_url: "", tags: [] });
  const [eventMode, setEventMode] = useState("once");
  const [eventOnce, setEventOnce] = useState({ date: "", start: "", end: "" });
  const [eventRecur, setEventRecur] = useState({ days: [], start: "", end: "", until: "" });
  const [eventOngoing, setEventOngoing] = useState(true);
  const [linkedDealIds, setLinkedDealIds] = useState([]);
  const [postingEvent, setPostingEvent] = useState(false);
  const [eventMsg, setEventMsg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [lastReport, setLastReport] = useState(null);
  // A claimRequest (venue passed from the map's "Claim it" CTA) opens the
  // claim flow directly on the confirm step for that venue.
  const [claimView, setClaimView] = useState(claimRequest ? "confirm" : "dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [claimTarget, setClaimTarget] = useState(claimRequest || null);
  const externalClaimRef = useRef(!!claimRequest);
  const [claiming, setClaiming] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [dashMsg, setDashMsg] = useState(null);
  const [claimError, setClaimError] = useState(null);
  const [phoneNeeded, setPhoneNeeded] = useState(false);
  const [claimPhone, setClaimPhone] = useState("");
  const [phoneLast4, setPhoneLast4] = useState(null);
  const [otpCode, setOtpCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [recentRedemptions, setRecentRedemptions] = useState([]);

  useEffect(() => { loadMyVenues(); if (claimRequest) onClaimRequestHandled?.(); }, []);

  async function loadMyVenues() {
    setLoading(true);
    const data = await apiFetch("/api/venues/mine", {}, token);
    if (Array.isArray(data) && data.length > 0) { setVenues(data); loadDash(data[0].id, externalClaimRef.current); }
    else { setLoading(false); if (!externalClaimRef.current) setClaimView("search"); }
  }

  async function loadDash(venueId, keepClaimView = false) {
    setLoading(true); setSelected(venueId);
    const [data, redemptions] = await Promise.all([
      apiFetch(`/api/dashboard/${venueId}`, {}, token),
      apiFetch(`/api/dashboard/${venueId}/redemptions`, {}, token),
    ]);
    if (data?.error) setDashMsg(data.error); else setDash(data);
    setRecentRedemptions(Array.isArray(redemptions) ? redemptions : []);
    setLoading(false); if (!keepClaimView) setClaimView("dashboard");
  }

  async function searchVenues() {
    if (searchQuery.trim().length < 2) return;
    setSearching(true);
    const data = await apiFetch(`/api/venues/search?q=${encodeURIComponent(searchQuery)}`, {}, token);
    if (Array.isArray(data)) setSearchResults(data);
    setSearching(false);
  }

  async function startClaim() {
    if (!claimTarget) return;
    externalClaimRef.current = false; // claim flow engaged; resume normal view handling
    setClaiming(true);
    setClaimError(null);
    const options = { method: "POST" };
    if (phoneNeeded && claimPhone.trim()) options.body = JSON.stringify({ phone: claimPhone.trim() });
    const data = await apiFetch(`/api/venues/${claimTarget.id}/claim/start`, options, token);
    if (data?.success) {
      setPhoneLast4(data.phone_last4);
      setOtpCode("");
      setClaimView("verify");
    } else if (data?.status === 422 && (data.error || "").startsWith("No phone number available")) {
      setPhoneNeeded(true);
      setClaimError(data.error);
    } else if (data?.status === 403) {
      setClaimView("review");
    } else {
      setClaimError(data?.error || "Failed to start verification.");
    }
    setClaiming(false);
  }

  async function confirmClaim() {
    if (!claimTarget || !otpCode.trim()) return;
    setVerifying(true);
    setClaimError(null);
    const data = await apiFetch(`/api/venues/${claimTarget.id}/claim/confirm`, { method: "POST", body: JSON.stringify({ code: otpCode.trim() }) }, token);
    if (data?.success) {
      setClaimView("success");
      setTimeout(() => loadMyVenues(), 1500);
    } else if (data?.status === 410 || data?.status === 404) {
      setClaimError(data?.error || "Verification expired. Please start again.");
      setOtpCode("");
      setClaimView("confirm");
    } else {
      setClaimError(data?.error || "Verification failed.");
    }
    setVerifying(false);
  }

  async function postDeal() {
    if (!newDeal.title) return setDashMsg("Deal title is required.");
    if (newDeal.tags.length < 1) return setDashMsg("Pick 1 to 3 tags so people can find your deal.");
    const recurring = dealMode === "recurring";
    if (recurring && (recur.days.length < 1 || !recur.start || !recur.end)) return setDashMsg("Pick day(s) and a time window for your recurring deal.");
    if (!recurring && !newDeal.expires_at) return setDashMsg("Deal expiry is required.");
    setPosting(true);
    const payload = recurring
      ? { venue_id: selected, title: newDeal.title, detail: newDeal.detail, tags: newDeal.tags, recur_days: recur.days, recur_start: recur.start, recur_end: recur.end }
      : { venue_id: selected, ...newDeal };
    const result = await apiFetch("/api/deals", { method: "POST", body: JSON.stringify(payload) }, token);
    if (result?.error) { setDashMsg(result.error); setPosting(false); return; }
    setDashMsg(null);
    setNewDeal({ title: "", detail: "", expires_at: "", tags: [] });
    setRecur({ days: [], start: "", end: "" });
    setDealMode("once");
    loadDash(selected); setPosting(false);
  }

  // action: "adopt" (deal becomes owner-verified and redeemable) or "dismiss" (deactivated)
  async function moderateScrapedDeal(dealId, action) {
    const result = await apiFetch(`/api/deals/${dealId}/${action}`, { method: "POST" }, token);
    if (result?.error) return setDashMsg(result.error);
    setDashMsg(null);
    loadDash(selected);
  }

  function toggleDealTag(tag) {
    setNewDeal(d => {
      if (d.tags.includes(tag)) return { ...d, tags: d.tags.filter(t => t !== tag) };
      if (d.tags.length >= 3) return d;
      return { ...d, tags: [...d.tags, tag] };
    });
  }

  function toggleEventTag(tag) {
    setNewEvent(ev => {
      if (ev.tags.includes(tag)) return { ...ev, tags: ev.tags.filter(t => t !== tag) };
      if (ev.tags.length >= 3) return ev;
      return { ...ev, tags: [...ev.tags, tag] };
    });
  }

  function toggleLinkedDeal(id) {
    setLinkedDealIds(ids => {
      if (ids.includes(id)) return ids.filter(x => x !== id);
      if (ids.length >= 10) return ids;
      return [...ids, id];
    });
  }

  async function postEvent() {
    if (!newEvent.title) return setDashMsg("Event title is required.");
    if (newEvent.tags.length < 1) return setDashMsg("Pick 1 to 3 tags so people can find your event.");
    let payload = { venue_id: selected, title: newEvent.title, description: newEvent.description, cover_image_url: newEvent.cover_image_url || null, tags: newEvent.tags, linked_deal_ids: linkedDealIds };
    if (eventMode === "once") {
      if (!eventOnce.date || !eventOnce.start || !eventOnce.end) return setDashMsg("Pick a date and time window for your event.");
      payload = { ...payload, event_date: eventOnce.date, start_time: eventOnce.start, end_time: eventOnce.end };
    } else {
      if (eventRecur.days.length < 1 || !eventRecur.start || !eventRecur.end) return setDashMsg("Pick day(s) and a time window for your event.");
      payload = { ...payload, recur_days: eventRecur.days, recur_start: eventRecur.start, recur_end: eventRecur.end, recur_until: eventOngoing ? null : (eventRecur.until || null) };
    }
    setPostingEvent(true);
    const result = await apiFetch("/api/events", { method: "POST", body: JSON.stringify(payload) }, token);
    setPostingEvent(false);
    if (result?.error) return setDashMsg(result.error);
    setDashMsg(null);
    setEventMsg(`"${result.title}" is live ✦`);
    setNewEvent({ title: "", description: "", cover_image_url: "", tags: [] });
    setEventOnce({ date: "", start: "", end: "" });
    setEventRecur({ days: [], start: "", end: "", until: "" });
    setEventOngoing(true);
    setLinkedDealIds([]);
    setEventMode("once");
    setTimeout(() => setEventMsg(null), 4000);
  }

  async function toggleBoost(enable) {
    const result = await apiFetch(`/api/dashboard/${selected}/boost`, { method: "PATCH", body: JSON.stringify({ enable }) }, token);
    if (result?.error) return setDashMsg(result.error);
    setDashMsg(null);
    loadDash(selected);
  }

  async function submitSelfReport(level, label) {
    setReporting(true);
    const data = await apiFetch(`/api/venues/${selected}/crowd`, { method: "POST", body: JSON.stringify({ busy_level: level }) }, token);
    if (data.success) { setLastReport({ label, score: data.new_score, time: new Date() }); loadDash(selected); }
    setReporting(false);
  }

  async function startUpgrade(targetPlan) {
    setUpgrading(true);
    const data = await apiFetch("/api/stripe/create-checkout-session", { method: "POST", body: JSON.stringify({ venueId: selected, tier: targetPlan }) }, token);
    if (data?.url) { window.open(data.url, "_blank"); } else { setDashMsg(data?.error || "Failed to start checkout."); }
    setUpgrading(false);
  }

  async function openPortal() {
    const data = await apiFetch("/api/stripe/create-portal-session", { method: "POST", body: JSON.stringify({ venueId: selected }) }, token);
    if (data?.url) window.open(data.url, "_blank");
    else setDashMsg(data?.error || "Failed to open billing portal.");
  }

  const inputStyle = { background: "rgba(200,169,110,0.06)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 10, padding: "8px 12px", color: C.marble, fontSize: 16, fontFamily: "'EB Garamond', serif", outline: "none", width: "100%" };

  if (claimView === "search" || claimView === "confirm" || claimView === "verify") {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: C.mapBg }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid rgba(200,169,110,0.1)` }}>
          <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>{claimView === "confirm" ? "Confirm Claim" : claimView === "verify" ? "Verify Ownership" : "Claim Your Venue"}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif" }}>{claimView === "search" ? "Find your establishment" : claimTarget?.name}</div>
        </div>
        {claimView === "confirm" && claimTarget && (
          <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "rgba(200,169,110,0.06)", borderRadius: 16, padding: 16, border: `1px solid rgba(200,169,110,0.2)` }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.marble, marginBottom: 4, fontFamily: "'Playfair Display', serif" }}>{claimTarget.name}</div>
              <div style={{ fontSize: 12, color: C.aureus, marginBottom: 2, fontFamily: "'EB Garamond', serif" }}>{claimTarget.address}</div>
              <div style={{ fontSize: 10, color: C.marble, opacity: 0.4, fontFamily: "sans-serif" }}>{claimTarget.neighborhood} · {claimTarget.city}</div>
            </div>
            <p style={{ fontSize: 12, color: C.marble, fontFamily: "'EB Garamond', serif", lineHeight: 1.7, margin: 0, opacity: 0.7 }}>To verify you're the owner or an authorized representative, we'll text a verification code to the venue's phone number on file.</p>
            {phoneNeeded && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input value={claimPhone} onChange={e => setClaimPhone(e.target.value)} type="tel" inputMode="tel" placeholder="Venue phone number, e.g. (704) 555-0123" style={inputStyle} />
                <div style={{ fontSize: 11, color: C.marble, fontFamily: "'EB Garamond', serif", opacity: 0.5, lineHeight: 1.6 }}>We don't have a phone number for this venue. Enter the venue's business line — claims with a user-supplied number get an extra review.</div>
              </div>
            )}
            <button onClick={startClaim} disabled={claiming || (phoneNeeded && !claimPhone.trim())} style={{ padding: "14px", borderRadius: 14, border: "none", background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: C.carbon, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Playfair Display', serif", opacity: claiming || (phoneNeeded && !claimPhone.trim()) ? 0.7 : 1, letterSpacing: 0.5 }}>
              {claiming ? "Sending code..." : "Send Verification Code"}
            </button>
            {claimError && <div style={{ fontSize: 12, color: "#FF6B6B", textAlign: "center", fontFamily: "'EB Garamond', serif" }}>{claimError}</div>}
            <button onClick={() => { setClaimView("search"); setClaimTarget(null); setPhoneNeeded(false); setClaimPhone(""); setClaimError(null); }} style={{ padding: "12px", borderRadius: 14, border: `1px solid rgba(200,169,110,0.2)`, background: "transparent", color: C.aureus, fontSize: 13, cursor: "pointer", fontFamily: "'EB Garamond', serif" }}>← Back</button>
          </div>
        )}
        {claimView === "verify" && claimTarget && (
          <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "rgba(200,169,110,0.06)", borderRadius: 16, padding: 16, border: `1px solid rgba(200,169,110,0.2)`, textAlign: "center" }}>
              <div style={{ fontSize: 13, color: C.marble, fontFamily: "'EB Garamond', serif", opacity: 0.8, lineHeight: 1.6 }}>
                We sent a verification code to the phone number ending in <span style={{ color: C.aureus, fontWeight: 700 }}>•••{phoneLast4}</span>. It expires in 10 minutes.
              </div>
            </div>
            <input value={otpCode} onChange={e => setOtpCode(e.target.value)} onKeyDown={e => e.key === "Enter" && confirmClaim()} type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="Enter code" style={{ ...inputStyle, textAlign: "center", fontSize: 20, letterSpacing: 8, fontFamily: "sans-serif", padding: "14px 12px" }} />
            <button onClick={confirmClaim} disabled={verifying || !otpCode.trim()} style={{ padding: "14px", borderRadius: 14, border: "none", background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: C.carbon, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Playfair Display', serif", opacity: verifying || !otpCode.trim() ? 0.7 : 1, letterSpacing: 0.5 }}>
              {verifying ? "Verifying..." : "✓ Verify & Claim Venue"}
            </button>
            {claimError && <div style={{ fontSize: 12, color: "#FF6B6B", textAlign: "center", fontFamily: "'EB Garamond', serif" }}>{claimError}</div>}
            <button onClick={startClaim} disabled={claiming} style={{ padding: "12px", borderRadius: 14, border: "none", background: "transparent", color: C.aureus, fontSize: 12, cursor: "pointer", fontFamily: "'EB Garamond', serif", opacity: claiming ? 0.6 : 0.8 }}>
              {claiming ? "Resending..." : "Didn't get it? Resend code"}
            </button>
            <button onClick={() => { setClaimView("confirm"); setOtpCode(""); setClaimError(null); }} style={{ padding: "12px", borderRadius: 14, border: `1px solid rgba(200,169,110,0.2)`, background: "transparent", color: C.aureus, fontSize: 13, cursor: "pointer", fontFamily: "'EB Garamond', serif" }}>← Back</button>
          </div>
        )}
        {claimView === "search" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", display: "flex", gap: 8 }}>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && searchVenues()} placeholder="Search by venue name..." style={{ ...inputStyle, flex: 1 }} />
              <button onClick={searchVenues} disabled={searching} style={{ padding: "10px 14px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: C.carbon, fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "'Playfair Display', serif", opacity: searching ? 0.7 : 1 }}>{searching ? "..." : "Search"}</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {searchResults.length === 0 && searchQuery.length === 0 && (
                <div style={{ textAlign: "center", padding: 40 }}>
                  <Compass size={40} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.marble, marginTop: 16, marginBottom: 8, fontFamily: "'Playfair Display', serif" }}>Claim your venue</div>
                  <div style={{ fontSize: 12, color: C.marble, fontFamily: "'EB Garamond', serif", lineHeight: 1.6, opacity: 0.5 }}>Search for your bar or restaurant to access your business dashboard</div>
                </div>
              )}
              {searchResults.map(v => (
                <div key={v.id} style={{ background: "rgba(200,169,110,0.04)", borderRadius: 14, padding: "14px 16px", border: `1px solid rgba(200,169,110,${v.is_claimed ? "0.06" : "0.2"})`, opacity: v.is_claimed ? 0.5 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.marble, marginBottom: 2, fontFamily: "'Playfair Display', serif" }}>{v.name}</div>
                      <div style={{ fontSize: 11, color: C.aureus, fontFamily: "'EB Garamond', serif", opacity: 0.8 }}>{v.address}</div>
                    </div>
                    {v.is_claimed ? (
                      <div style={{ fontSize: 10, color: C.aureus, flexShrink: 0, marginLeft: 8, fontFamily: "sans-serif", opacity: 0.5 }}>Claimed</div>
                    ) : (
                      <button onClick={() => { setClaimTarget(v); setPhoneNeeded(false); setClaimPhone(""); setOtpCode(""); setClaimError(null); setClaimView("confirm"); }} style={{ background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, border: "none", borderRadius: 10, padding: "7px 12px", fontSize: 11, fontWeight: 700, color: C.carbon, cursor: "pointer", fontFamily: "'Playfair Display', serif", flexShrink: 0, marginLeft: 8 }}>Claim</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (claimView === "review") {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, gap: 16, background: C.mapBg }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(200,169,110,0.08)", border: `1px solid rgba(200,169,110,0.3)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: C.aureus }}>!</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.marble, textAlign: "center", fontFamily: "'Playfair Display', serif" }}>Submitted for Review</div>
        <div style={{ fontSize: 13, color: C.aureus, textAlign: "center", fontFamily: "'EB Garamond', serif", lineHeight: 1.6, opacity: 0.8, maxWidth: 300 }}>
          This venue was previously claimed, so your request needs a manual review before ownership can be transferred. We'll be in touch.
        </div>
        <button onClick={() => { setClaimTarget(null); setClaimError(null); setClaimView("search"); }} style={{ marginTop: 8, padding: "12px 24px", borderRadius: 14, border: `1px solid rgba(200,169,110,0.2)`, background: "transparent", color: C.aureus, fontSize: 13, cursor: "pointer", fontFamily: "'EB Garamond', serif" }}>← Back to search</button>
      </div>
    );
  }

  if (claimView === "success") {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, gap: 16, background: C.mapBg }}>
        <Compass size={56} />
        <div style={{ fontSize: 20, fontWeight: 700, color: C.marble, textAlign: "center", fontFamily: "'Playfair Display', serif" }}>Venue Claimed!</div>
        <div style={{ fontSize: 13, color: C.aureus, textAlign: "center", fontFamily: "'EB Garamond', serif", lineHeight: 1.6, opacity: 0.8 }}>You are now the verified owner of {claimTarget?.name}.</div>
      </div>
    );
  }

  if (loading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: C.mapBg }}>
      <div style={{ color: C.aureus, fontSize: 13, fontFamily: "'EB Garamond', serif", opacity: 0.6 }}>Loading dashboard...</div>
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 16px", background: C.mapBg }}>
      {dashMsg && (
        <div style={{ background: "rgba(255,45,45,0.08)", border: `1px solid rgba(255,45,45,0.3)`, borderRadius: 12, padding: "8px 12px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#FF6B6B", fontFamily: "'EB Garamond', serif" }}>{dashMsg}</span>
          <button onClick={() => setDashMsg(null)} style={{ background: "none", border: "none", color: "#FF6B6B", cursor: "pointer", fontSize: 12 }}>✕</button>
        </div>
      )}
      {dash && (
        <>
          <div style={{ background: `linear-gradient(135deg, rgba(200,169,110,0.12), rgba(45,45,45,0.8))`, borderRadius: 18, padding: 16, marginBottom: 12, border: `1px solid rgba(200,169,110,0.2)` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Compass size={22} />
                <div>
                  <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 2, textTransform: "uppercase", marginBottom: 2 }}>Business Dashboard</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif" }}>{dash.venue?.name}</div>
                  <div style={{ fontSize: 10, color: C.aureus, fontFamily: "'EB Garamond', serif", marginTop: 1 }}>✓ Verified Owner</div>
                </div>
              </div>
              <div style={{ background: "rgba(255,45,45,0.1)", border: `1px solid rgba(255,45,45,0.25)`, borderRadius: 10, padding: "4px 8px" }}>
                <span style={{ fontSize: 9, color: C.packed, fontFamily: "sans-serif", letterSpacing: 1.5, fontWeight: 700 }}>LIVE 🔴</span>
              </div>
            </div>
            {venues.length > 1 && (
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {venues.map(v => (
                  <button key={v.id} onClick={() => loadDash(v.id)} style={{ padding: "4px 10px", borderRadius: 8, border: `1px solid rgba(200,169,110,${selected === v.id ? "0.6" : "0.2"})`, cursor: "pointer", fontSize: 10, fontFamily: "'EB Garamond', serif", background: selected === v.id ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "transparent", color: selected === v.id ? C.carbon : C.aureus }}>
                    {v.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            {[
              { label: "Visitors Today", value: dash.today?.visitor_count || 0, color: C.aureus },
              { label: "Redemptions",    value: dash.today?.deal_redemptions || 0, color: C.ivory },
              { label: "Live Score",     value: `${dash.crowd?.busy_score || 0}%`, color: C.buzzing }
            ].map(stat => (
              <div key={stat.label} style={{ background: "rgba(200,169,110,0.04)", borderRadius: 14, padding: "12px 10px", border: `1px solid rgba(200,169,110,0.1)`, textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: stat.color, fontFamily: "'Playfair Display', serif" }}>{stat.value}</div>
                <div style={{ fontSize: 8, color: C.marble, marginTop: 2, opacity: 0.35, fontFamily: "sans-serif", letterSpacing: 0.5 }}>{stat.label.toUpperCase()}</div>
              </div>
            ))}
          </div>

          <div style={{ background: "rgba(200,169,110,0.04)", borderRadius: 16, padding: 14, marginBottom: 12, border: `1px solid rgba(200,169,110,0.15)` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 2, textTransform: "uppercase" }}>Current Plan</div>
              <div style={{ background: "rgba(200,169,110,0.1)", borderRadius: 8, padding: "3px 10px" }}>
                <span style={{ fontSize: 10, color: C.aureus, fontFamily: "sans-serif", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>{String(dash.venue?.plan || "free")}</span>
              </div>
            </div>
            {(!dash.venue?.plan || dash.venue?.plan === "free") && (IS_NATIVE ? (
              <div style={{ fontSize: 11, color: C.marble, opacity: 0.6, fontFamily: "'EB Garamond', serif", textAlign: "center", padding: "10px 0" }}>
                Visit roaman.app to upgrade
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => startUpgrade("pro")} disabled={upgrading} style={{ flex: 1, padding: "10px 8px", borderRadius: 12, border: `1px solid rgba(200,169,110,0.3)`, background: "rgba(200,169,110,0.08)", cursor: "pointer", fontFamily: "inherit", opacity: upgrading ? 0.6 : 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.aureus, fontFamily: "'Playfair Display', serif", marginBottom: 2 }}>Pro</div>
                  <div style={{ fontSize: 10, color: C.marble, opacity: 0.5, fontFamily: "'EB Garamond', serif" }}>$49/mo</div>
                  <div style={{ fontSize: 9, color: C.marble, opacity: 0.4, fontFamily: "sans-serif", marginTop: 4 }}>Analytics · Trends</div>
                </button>
                <button onClick={() => startUpgrade("premium")} disabled={upgrading} style={{ flex: 1, padding: "10px 8px", borderRadius: 12, border: `1px solid ${C.aureus}`, background: `linear-gradient(135deg, rgba(200,169,110,0.15), rgba(200,169,110,0.05))`, cursor: "pointer", fontFamily: "inherit", opacity: upgrading ? 0.6 : 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.aureus, fontFamily: "'Playfair Display', serif", marginBottom: 2 }}>Premium ✦</div>
                  <div style={{ fontSize: 10, color: C.marble, opacity: 0.5, fontFamily: "'EB Garamond', serif" }}>$149/mo</div>
                  <div style={{ fontSize: 9, color: C.marble, opacity: 0.4, fontFamily: "sans-serif", marginTop: 4 }}>Featured · Boost</div>
                </button>
              </div>
            ))}
            {dash.venue?.plan && dash.venue.plan !== "free" && (IS_NATIVE ? (
              <div style={{ width: "100%", padding: 10, textAlign: "center", color: C.aureus, fontSize: 11, fontFamily: "'EB Garamond', serif" }}>
                Manage at roaman.app
              </div>
            ) : (
              <button onClick={openPortal} style={{ width: "100%", padding: "10px", borderRadius: 12, border: `1px solid rgba(200,169,110,0.2)`, background: "transparent", color: C.aureus, fontSize: 11, cursor: "pointer", fontFamily: "'EB Garamond', serif" }}>
                Manage Subscription →
              </button>
            ))}
          </div>

          <div style={{ background: "rgba(200,169,110,0.04)", borderRadius: 16, padding: 14, marginBottom: 12, border: `1px solid rgba(200,169,110,0.15)` }}>
            <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>How busy are you right now?</div>
            <div style={{ fontSize: 11, color: C.marble, fontFamily: "'EB Garamond', serif", marginBottom: 12, opacity: 0.5 }}>Update your live status on the heatmap</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { label: "Quiet",        emoji: "😴", level: 15, color: C.quiet },
                { label: "Getting Busy", emoji: "🙂", level: 55, color: C.moderate },
                { label: "Packed",       emoji: "🔥", level: 90, color: C.packed },
              ].map(opt => (
                <button key={opt.label} onClick={() => submitSelfReport(opt.level, opt.label)} disabled={reporting}
                  style={{ flex: 1, padding: "10px 6px", borderRadius: 12, border: `1px solid ${lastReport?.label === opt.label ? opt.color : "rgba(200,169,110,0.15)"}`, background: lastReport?.label === opt.label ? `${opt.color}22` : "rgba(200,169,110,0.04)", cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s", opacity: reporting ? 0.6 : 1 }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{opt.emoji}</div>
                  <div style={{ fontSize: 9, color: lastReport?.label === opt.label ? opt.color : C.marble, fontFamily: "sans-serif", letterSpacing: 0.3, opacity: lastReport?.label === opt.label ? 1 : 0.4 }}>{opt.label}</div>
                </button>
              ))}
            </div>
            {lastReport && (
              <div style={{ marginTop: 10, fontSize: 10, color: C.aureus, textAlign: "center", fontFamily: "'EB Garamond', serif", opacity: 0.7 }}>
                Last updated: {lastReport.label} · {Math.floor((Date.now() - lastReport.time) / 60000) || "<1"} min ago
              </div>
            )}
          </div>

          <div style={{ background: "rgba(200,169,110,0.04)", borderRadius: 16, padding: 14, marginBottom: 12, border: `1px solid rgba(200,169,110,0.15)` }}>
            <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Post a Deal</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input value={newDeal.title} onChange={e => setNewDeal(d => ({ ...d, title: e.target.value }))} placeholder="e.g. $5 Margaritas" style={inputStyle} />
              <input value={newDeal.detail} onChange={e => setNewDeal(d => ({ ...d, detail: e.target.value }))} placeholder="Details (e.g. Well drinks only)" style={inputStyle} />
              <div>
                <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.7, marginBottom: 6 }}>Tags · pick 1–3 ({newDeal.tags.length}/3)</div>
                {Object.entries(DEAL_TAG_GROUPS).map(([group, tags]) => (
                  <div key={group} style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 8, color: C.marble, opacity: 0.35, fontFamily: "sans-serif", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>{group}</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {tags.map(t => {
                        const on = newDeal.tags.includes(t);
                        const full = !on && newDeal.tags.length >= 3;
                        return (
                          <button key={t} onClick={() => toggleDealTag(t)} style={{ padding: "4px 10px", borderRadius: 14, cursor: full ? "not-allowed" : "pointer", fontSize: 11, fontFamily: "'EB Garamond', serif", border: `1px solid ${on ? C.aureus : "rgba(200,169,110,0.2)"}`, background: on ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "rgba(200,169,110,0.05)", color: on ? C.carbon : C.aureus, opacity: full ? 0.35 : 1 }}>{t}</button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", background: "rgba(200,169,110,0.05)", borderRadius: 10, border: `1px solid rgba(200,169,110,0.15)`, padding: 2 }}>
                {[["once", "One-time"], ["recurring", "Recurring"]].map(([m, label]) => (
                  <button key={m} onClick={() => setDealMode(m)} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "sans-serif", letterSpacing: 0.5, background: dealMode === m ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "transparent", color: dealMode === m ? C.carbon : C.aureus }}>{label}</button>
                ))}
              </div>
              {dealMode === "once" && (
                <input value={newDeal.expires_at} onChange={e => setNewDeal(d => ({ ...d, expires_at: e.target.value }))} type="datetime-local" style={inputStyle} />
              )}
              {dealMode === "recurring" && (
                <>
                  <div style={{ display: "flex", gap: 4, justifyContent: "space-between" }}>
                    {DAY_LABELS.map((label, i) => {
                      const on = recur.days.includes(i);
                      return (
                        <button key={label} onClick={() => setRecur(r => ({ ...r, days: on ? r.days.filter(d => d !== i) : [...r.days, i].sort() }))}
                          style={{ flex: 1, padding: "6px 0", borderRadius: 8, cursor: "pointer", fontSize: 10, fontFamily: "sans-serif", fontWeight: 700, border: `1px solid ${on ? C.aureus : "rgba(200,169,110,0.2)"}`, background: on ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "rgba(200,169,110,0.05)", color: on ? C.carbon : C.aureus }}>{label[0]}</button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input value={recur.start} onChange={e => setRecur(r => ({ ...r, start: e.target.value }))} type="time" style={{ ...inputStyle, flex: 1 }} />
                    <span style={{ fontSize: 11, color: C.aureus, fontFamily: "'EB Garamond', serif", opacity: 0.7 }}>to</span>
                    <input value={recur.end} onChange={e => setRecur(r => ({ ...r, end: e.target.value }))} type="time" style={{ ...inputStyle, flex: 1 }} />
                  </div>
                </>
              )}
              <button onClick={postDeal} disabled={posting} style={{ padding: "10px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: C.carbon, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Playfair Display', serif", letterSpacing: 0.5 }}>{posting ? "Posting..." : "Post Deal ✦"}</button>
            </div>
          </div>

          <div style={{ background: "rgba(200,169,110,0.04)", borderRadius: 16, padding: 14, marginBottom: 12, border: `1px solid rgba(200,169,110,0.15)` }}>
            <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Post an Event</div>
            {eventMsg && (
              <div style={{ background: "rgba(46,204,113,0.08)", border: `1px solid rgba(46,204,113,0.3)`, borderRadius: 10, padding: "8px 12px", marginBottom: 8, fontSize: 12, color: C.buzzing, fontFamily: "'EB Garamond', serif" }}>{eventMsg}</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input value={newEvent.title} onChange={e => setNewEvent(ev => ({ ...ev, title: e.target.value }))} placeholder="e.g. Blind Tasting Tuesdays" style={inputStyle} />
              <input value={newEvent.description} onChange={e => setNewEvent(ev => ({ ...ev, description: e.target.value }))} placeholder="Description (e.g. Guess the pour, win a glass)" style={inputStyle} />
              <input value={newEvent.cover_image_url} onChange={e => setNewEvent(ev => ({ ...ev, cover_image_url: e.target.value }))} type="url" placeholder="Cover image URL (optional)" style={inputStyle} />
              <div>
                <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.7, marginBottom: 6 }}>Tags · pick 1–3 ({newEvent.tags.length}/3)</div>
                {Object.entries(EVENT_TAG_GROUPS).map(([group, tags]) => (
                  <div key={group} style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 8, color: C.marble, opacity: 0.35, fontFamily: "sans-serif", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>{group}</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {tags.map(t => {
                        const on = newEvent.tags.includes(t);
                        const full = !on && newEvent.tags.length >= 3;
                        return (
                          <button key={t} onClick={() => toggleEventTag(t)} style={{ padding: "4px 10px", borderRadius: 14, cursor: full ? "not-allowed" : "pointer", fontSize: 11, fontFamily: "'EB Garamond', serif", border: `1px solid ${on ? C.aureus : "rgba(200,169,110,0.2)"}`, background: on ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "rgba(200,169,110,0.05)", color: on ? C.carbon : C.aureus, opacity: full ? 0.35 : 1 }}>{t}</button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", background: "rgba(200,169,110,0.05)", borderRadius: 10, border: `1px solid rgba(200,169,110,0.15)`, padding: 2 }}>
                {[["once", "One-time"], ["weekly", "Weekly"]].map(([m, label]) => (
                  <button key={m} onClick={() => setEventMode(m)} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "sans-serif", letterSpacing: 0.5, background: eventMode === m ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "transparent", color: eventMode === m ? C.carbon : C.aureus }}>{label}</button>
                ))}
              </div>
              {eventMode === "once" && (
                <>
                  <input value={eventOnce.date} onChange={e => setEventOnce(o => ({ ...o, date: e.target.value }))} type="date" style={inputStyle} />
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input value={eventOnce.start} onChange={e => setEventOnce(o => ({ ...o, start: e.target.value }))} type="time" style={{ ...inputStyle, flex: 1 }} />
                    <span style={{ fontSize: 11, color: C.aureus, fontFamily: "'EB Garamond', serif", opacity: 0.7 }}>to</span>
                    <input value={eventOnce.end} onChange={e => setEventOnce(o => ({ ...o, end: e.target.value }))} type="time" style={{ ...inputStyle, flex: 1 }} />
                  </div>
                </>
              )}
              {eventMode === "weekly" && (
                <>
                  <div style={{ display: "flex", gap: 4, justifyContent: "space-between" }}>
                    {DAY_LABELS.map((label, i) => {
                      const on = eventRecur.days.includes(i);
                      return (
                        <button key={label} onClick={() => setEventRecur(r => ({ ...r, days: on ? r.days.filter(d => d !== i) : [...r.days, i].sort() }))}
                          style={{ flex: 1, padding: "6px 0", borderRadius: 8, cursor: "pointer", fontSize: 10, fontFamily: "sans-serif", fontWeight: 700, border: `1px solid ${on ? C.aureus : "rgba(200,169,110,0.2)"}`, background: on ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "rgba(200,169,110,0.05)", color: on ? C.carbon : C.aureus }}>{label[0]}</button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input value={eventRecur.start} onChange={e => setEventRecur(r => ({ ...r, start: e.target.value }))} type="time" style={{ ...inputStyle, flex: 1 }} />
                    <span style={{ fontSize: 11, color: C.aureus, fontFamily: "'EB Garamond', serif", opacity: 0.7 }}>to</span>
                    <input value={eventRecur.end} onChange={e => setEventRecur(r => ({ ...r, end: e.target.value }))} type="time" style={{ ...inputStyle, flex: 1 }} />
                  </div>
                  <div style={{ display: "flex", background: "rgba(200,169,110,0.05)", borderRadius: 10, border: `1px solid rgba(200,169,110,0.15)`, padding: 2 }}>
                    {[[true, "Ongoing"], [false, "Ends on a date"]].map(([v, label]) => (
                      <button key={label} onClick={() => setEventOngoing(v)} style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, fontFamily: "sans-serif", letterSpacing: 0.5, background: eventOngoing === v ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "transparent", color: eventOngoing === v ? C.carbon : C.aureus }}>{label}</button>
                    ))}
                  </div>
                  {!eventOngoing && (
                    <input value={eventRecur.until} onChange={e => setEventRecur(r => ({ ...r, until: e.target.value }))} type="date" style={inputStyle} />
                  )}
                </>
              )}
              {dash.active_deals?.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.7, marginBottom: 6 }}>Attach deals ({linkedDealIds.length})</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {dash.active_deals.map(d => {
                      const on = linkedDealIds.includes(d.id);
                      return (
                        <button key={d.id} onClick={() => toggleLinkedDeal(d.id)} style={{ padding: "4px 10px", borderRadius: 14, cursor: "pointer", fontSize: 11, fontFamily: "'EB Garamond', serif", border: `1px solid ${on ? C.aureus : "rgba(200,169,110,0.2)"}`, background: on ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "rgba(200,169,110,0.05)", color: on ? C.carbon : C.aureus }}>{on ? "✓ " : ""}{d.title}</button>
                      );
                    })}
                  </div>
                </div>
              )}
              <button onClick={postEvent} disabled={postingEvent} style={{ padding: "10px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: C.carbon, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Playfair Display', serif", letterSpacing: 0.5 }}>{postingEvent ? "Posting..." : "Post Event 🎭"}</button>
            </div>
          </div>

          {dash.active_deals?.length > 0 && (
            <div style={{ background: "rgba(200,169,110,0.04)", borderRadius: 16, padding: 14, marginBottom: 12, border: `1px solid rgba(200,169,110,0.1)` }}>
              <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Active Deals</div>
              {dash.active_deals.map(d => (
                <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid rgba(200,169,110,0.08)` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: C.marble, fontFamily: "'EB Garamond', serif" }}>{d.title}</div>
                    {d.recur_days && <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", opacity: 0.8, marginTop: 1 }}>↻ {recurLabel(d)}</div>}
                    {d.source === "scraped" && <div style={{ fontSize: 8, color: C.marble, opacity: 0.5, fontFamily: "sans-serif", letterSpacing: 1, marginTop: 2, textTransform: "uppercase" }}>Found on your website · not verified</div>}
                  </div>
                  {d.source === "scraped" ? (
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => moderateScrapedDeal(d.id, "adopt")} style={{ padding: "6px 12px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 10, letterSpacing: 0.5, background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: C.carbon }}>✓ Verify</button>
                      <button onClick={() => moderateScrapedDeal(d.id, "dismiss")} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid rgba(232,230,225,0.18)", cursor: "pointer", fontFamily: "sans-serif", fontSize: 10, letterSpacing: 0.5, background: "transparent", color: C.marble, opacity: 0.6 }}>✕ Remove</button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: C.aureus, fontFamily: "sans-serif", flexShrink: 0 }}>✦ {d.redemption_count}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {recentRedemptions.length > 0 && (
            <div style={{ background: "rgba(200,169,110,0.04)", borderRadius: 16, padding: 14, marginBottom: 12, border: `1px solid rgba(200,169,110,0.1)` }}>
              <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Recent Redemptions</div>
              {recentRedemptions.slice(0, 10).map(r => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid rgba(200,169,110,0.08)` }}>
                  <div>
                    <div style={{ fontSize: 12, color: C.marble, fontFamily: "'EB Garamond', serif" }}>{r.deals?.title || "Deal"}</div>
                    <div style={{ fontSize: 9, color: C.marble, opacity: 0.4, fontFamily: "sans-serif", marginTop: 1 }}>{r.users?.username || "Roamer"} · {timeAgo(r.redeemed_at)}</div>
                  </div>
                  {r.code && <div style={{ fontSize: 11, color: C.aureus, fontFamily: "monospace", letterSpacing: 1.5 }}>{r.code}</div>}
                </div>
              ))}
            </div>
          )}

          <div style={{ background: "rgba(200,169,110,0.04)", borderRadius: 16, padding: 14, marginBottom: 12, border: `1px solid rgba(200,169,110,${dash.venue?.heatmap_boost ? "0.4" : "0.1"})` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif" }}>Heatmap Boost</div>
                <div style={{ fontSize: 10, color: C.aureus, marginTop: 2, fontFamily: "'EB Garamond', serif", opacity: 0.7 }}>{IS_NATIVE ? "Highlighted on map" : "Highlighted on map · $149/mo"}</div>
              </div>
              <div onClick={() => toggleBoost(!dash.venue?.heatmap_boost)} style={{ width: 44, height: 24, borderRadius: 12, background: dash.venue?.heatmap_boost ? C.aureus : "rgba(200,169,110,0.1)", position: "relative", cursor: "pointer", transition: "all 0.3s" }}>
                <div style={{ position: "absolute", top: 2, left: dash.venue?.heatmap_boost ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: C.marble, transition: "all 0.3s" }} />
              </div>
            </div>
          </div>

          <button onClick={() => { setClaimView("search"); setSearchQuery(""); setSearchResults([]); }}
            style={{ width: "100%", padding: "12px", borderRadius: 14, border: `1px solid rgba(200,169,110,0.15)`, background: "transparent", color: C.aureus, fontSize: 12, cursor: "pointer", fontFamily: "'EB Garamond', serif", opacity: 0.5 }}>
            + Claim another venue
          </button>
        </>
      )}
    </div>
  );
}

function SettingsScreen({ token, user, onLogout, onUserUpdate }) {
  const [deleteStep, setDeleteStep] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [sharing, setSharing] = useState(!!user?.location_sharing);
  const [savingSharing, setSavingSharing] = useState(false);

  async function toggleSharing() {
    if (savingSharing) return;
    const next = !sharing;
    setSharing(next); setSavingSharing(true);
    const data = await apiFetch("/api/auth/me", { method: "PATCH", body: JSON.stringify({ location_sharing: next }) }, token).catch(() => null);
    if (data?.id) {
      onUserUpdate?.(data);
    } else {
      setSharing(!next);
    }
    setSavingSharing(false);
  }

  async function executeDelete() {
    setDeleting(true);
    setDeleteError(null);
    const data = await apiFetch("/api/auth/account", { method: "DELETE" }, token);
    if (data.success) {
      onLogout();
    } else {
      setDeleteError(data.error || "Failed to delete account. Please try again.");
      setDeleting(false);
      setDeleteStep(0);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "16px", background: C.mapBg }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Account</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif" }}>Settings</div>
      </div>
      <div style={{ background: "rgba(200,169,110,0.06)", borderRadius: 16, padding: 16, marginBottom: 12, border: `1px solid rgba(200,169,110,0.15)` }}>
        <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Profile</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif", marginBottom: 2 }}>{user?.username}</div>
        <div style={{ fontSize: 12, color: C.marble, fontFamily: "'EB Garamond', serif", opacity: 0.5 }}>{user?.email}</div>
      </div>
      <div style={{ background: "rgba(200,169,110,0.06)", borderRadius: 16, padding: 16, marginBottom: 12, border: `1px solid rgba(200,169,110,0.15)` }}>
        <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Privacy</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif" }}>Share My Location</div>
          <button onClick={toggleSharing} disabled={savingSharing} aria-label="Toggle location sharing"
            style={{ width: 44, height: 24, borderRadius: 12, border: `1px solid ${sharing ? C.aureus : "rgba(200,169,110,0.25)"}`, cursor: "pointer", padding: 2, background: sharing ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "rgba(200,169,110,0.08)", display: "flex", justifyContent: sharing ? "flex-end" : "flex-start", opacity: savingSharing ? 0.6 : 1, transition: "all 0.2s" }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: sharing ? C.carbon : "rgba(200,169,110,0.5)" }} />
          </button>
        </div>
        <div style={{ fontSize: 11, color: C.marble, fontFamily: "'EB Garamond', serif", opacity: 0.5, lineHeight: 1.6 }}>
          Friends can see which venue you're at. Your location updates when you report a crowd level, and disappears after 30 minutes or when you turn this off.
        </div>
      </div>
      <div style={{ height: 1, background: "rgba(200,169,110,0.1)", marginBottom: 12 }} />
      {deleteError && (
        <div style={{ background: "rgba(255,45,45,0.1)", border: "1px solid rgba(255,45,45,0.3)", borderRadius: 12, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: "#FF6B6B", fontFamily: "'EB Garamond', serif", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError(null)} style={{ background: "none", border: "none", color: "#FF6B6B", cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>
        </div>
      )}
      {deleteStep === 0 && (
        <div style={{ background: "rgba(255,45,45,0.04)", borderRadius: 16, padding: 16, border: `1px solid rgba(255,45,45,0.12)` }}>
          <div style={{ fontSize: 9, color: "rgba(255,45,45,0.7)", fontFamily: "sans-serif", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Danger Zone</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif", marginBottom: 4 }}>Delete Account</div>
          <div style={{ fontSize: 11, color: C.marble, fontFamily: "'EB Garamond', serif", opacity: 0.5, marginBottom: 14, lineHeight: 1.6 }}>
            Permanently delete your account and all associated data. This cannot be undone.
          </div>
          <button onClick={() => setDeleteStep(1)} style={{ width: "100%", padding: "11px", borderRadius: 12, border: `1px solid rgba(255,45,45,0.3)`, background: "rgba(255,45,45,0.08)", color: "#FF2D2D", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Playfair Display', serif", letterSpacing: 0.5 }}>
            Delete My Account
          </button>
        </div>
      )}
      {deleteStep === 1 && (
        <div style={{ background: "rgba(255,45,45,0.08)", borderRadius: 16, padding: 16, border: `1px solid rgba(255,45,45,0.3)` }}>
          <div style={{ fontSize: 22, textAlign: "center", marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif", textAlign: "center", marginBottom: 8 }}>Are you sure?</div>
          <div style={{ fontSize: 12, color: C.marble, fontFamily: "'EB Garamond', serif", opacity: 0.7, marginBottom: 20, lineHeight: 1.7, textAlign: "center" }}>
            This will permanently delete your account, all your crowd reports, stories, and saved deals. This cannot be undone.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => setDeleteStep(2)} style={{ padding: "12px", borderRadius: 12, border: "none", background: "#FF2D2D", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Playfair Display', serif", letterSpacing: 0.5 }}>Yes, Delete My Account</button>
            <button onClick={() => setDeleteStep(0)} style={{ padding: "12px", borderRadius: 12, border: `1px solid rgba(200,169,110,0.2)`, background: "transparent", color: C.aureus, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "'EB Garamond', serif" }}>Cancel</button>
          </div>
        </div>
      )}
      {deleteStep === 2 && (
        <div style={{ background: "rgba(255,45,45,0.1)", borderRadius: 16, padding: 16, border: `1px solid rgba(255,45,45,0.4)` }}>
          <div style={{ fontSize: 22, textAlign: "center", marginBottom: 12 }}>🗑️</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#FF2D2D", fontFamily: "'Playfair Display', serif", textAlign: "center", marginBottom: 8 }}>Final Confirmation</div>
          <div style={{ fontSize: 12, color: C.marble, fontFamily: "'EB Garamond', serif", opacity: 0.7, marginBottom: 20, lineHeight: 1.7, textAlign: "center" }}>
            Tap the button below to permanently delete your account. There is no going back.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={executeDelete} disabled={deleting} style={{ padding: "12px", borderRadius: 12, border: "none", background: "#FF2D2D", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Playfair Display', serif", letterSpacing: 0.5, opacity: deleting ? 0.7 : 1 }}>
              {deleting ? "Deleting..." : "Permanently Delete Account"}
            </button>
            <button onClick={() => setDeleteStep(0)} disabled={deleting} style={{ padding: "12px", borderRadius: 12, border: `1px solid rgba(200,169,110,0.2)`, background: "transparent", color: C.aureus, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "'EB Garamond', serif" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function OwnedVenueRoute({ user, getToken, Component }) {
  const [venue, setVenue] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const data = await apiFetch("/api/venues/mine", {}, token);
        if (Array.isArray(data) && data.length > 0) setVenue(data[0]);
      } catch (err) {
        console.error("Failed to load owned venue:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  if (loading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A0A0A", color: "#888", fontFamily: '"DM Sans", sans-serif', fontSize: 14 }}>Loading…</div>;
  return <Component user={user} getToken={getToken} venue={venue} />;
}

export default function RoamApp() {
  const [tab, setTab] = useState("map");
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [claimRequest, setClaimRequest] = useState(null);

  const path = window.location.pathname;
  const getToken = async () => localStorage.getItem("roam_token");
  const savedUser = (() => { try { return JSON.parse(localStorage.getItem("roam_user") || "null"); } catch { return null; } })();
  const savedToken = localStorage.getItem("roam_token");

  if (path === "/reset-password") return <ResetPasswordScreen />;
  if (path === "/pricing") return <OwnedVenueRoute user={savedUser} getToken={getToken} Component={PricingPage} />;
  if (path === "/billing/success") return <BillingSuccess getToken={getToken} />;
  if (path === "/billing/cancel") return <BillingCancel />;
  if (path === "/billing") {
    if (!savedUser || !savedToken) { window.location.href = "/"; return null; }
    return <OwnedVenueRoute user={savedUser} getToken={getToken} Component={BillingDashboard} />;
  }

  function handleAuth(u, t) {
    setUser(u); setToken(t);
    localStorage.setItem("roam_token", t);
    localStorage.setItem("roam_user", JSON.stringify(u));
  }

  function handleLogout() {
    setUser(null); setToken(null);
    localStorage.removeItem("roam_token");
    localStorage.removeItem("roam_user");
  }

  const currentUser = user || savedUser;
  const currentToken = token || savedToken;
  const [currentCity, setCurrentCity] = useState("Charlotte");

  const tabs = [
    { id: "map",       icon: "🗺️", label: "Map" },
    { id: "stories",   icon: "📸", label: "Stories" },
    { id: "deals",     icon: "✦",  label: "Deals" },
    { id: "events",    icon: "🎭", label: "Events" },
    { id: "dashboard", icon: "⊙",  label: "Business" },
    { id: "settings",  icon: "⚙️", label: "Settings" },
  ];

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#060608", fontFamily: "'EB Garamond', Georgia, serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { display: none; }
        body { background: #060608; }
        .phone-frame {
          width: 100%;
          max-width: 430px;
          height: 100vh;
          height: 100dvh;
          padding-top: env(safe-area-inset-top);
        }
        /* Desktop/web mockup look — never applies on phones or iPad compatibility mode */
        @media (min-width: 500px) {
          .phone-frame {
            width: 375px;
            height: 780px;
            height: min(780px, 96dvh);
            border-radius: 48px;
            box-shadow: 0 40px 120px rgba(0,0,0,0.9), 0 0 0 1px rgba(200,169,110,0.15);
          }
        }
      `}</style>
      <div className="phone-frame" style={{ background: C.mapBg, overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}>
        {currentUser && (
          <div style={{ padding: "6px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, borderBottom: `1px solid rgba(200,169,110,0.1)` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Compass size={20} />
              <span style={{ fontSize: 16, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif", letterSpacing: 2.5 }}>ROAMAN</span>
            </div>
            <button onClick={handleLogout} style={{ background: "rgba(200,169,110,0.06)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 20, padding: "5px 12px", color: C.aureus, fontSize: 10, cursor: "pointer", fontFamily: "'EB Garamond', serif" }}>
              {currentUser.username} · logout
            </button>
          </div>
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {!currentUser ? <AuthScreen onAuth={handleAuth} /> : (
            <>
              {tab === "map"       && <HeatmapScreen token={currentToken} user={currentUser} currentCity={currentCity} setCurrentCity={setCurrentCity} onClaimVenue={v => { setClaimRequest(v); setTab("dashboard"); }} />}
              {tab === "stories"   && <StoriesScreen token={currentToken} user={currentUser} />}
              {tab === "deals"     && <DealsScreen token={currentToken} user={currentUser} city={currentCity} />}
              {tab === "events"    && <EventsScreen token={currentToken} user={currentUser} city={currentCity} />}
              {tab === "dashboard" && <DashboardScreen token={currentToken} user={currentUser} claimRequest={claimRequest} onClaimRequestHandled={() => setClaimRequest(null)} />}
              {tab === "settings"  && <SettingsScreen token={currentToken} user={currentUser} onLogout={handleLogout} onUserUpdate={u => { setUser(u); localStorage.setItem("roam_user", JSON.stringify(u)); }} />}
            </>
          )}
        </div>
        {currentUser && (
          <div style={{ padding: "10px 8px", paddingBottom: "calc(12px + env(safe-area-inset-bottom))", display: "flex", background: "rgba(14,15,11,0.97)", borderTop: `1px solid rgba(200,169,110,0.12)`, flexShrink: 0 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
                <div style={{ fontSize: 18, opacity: tab === t.id ? 1 : 0.25 }}>{t.icon}</div>
                <span style={{ fontSize: 8, fontFamily: "sans-serif", color: tab === t.id ? C.aureus : C.marble, letterSpacing: 1, textTransform: "uppercase", opacity: tab === t.id ? 1 : 0.3 }}>{t.label}</span>
                {tab === t.id && <div style={{ width: 4, height: 4, borderRadius: "50%", background: C.aureus }} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
