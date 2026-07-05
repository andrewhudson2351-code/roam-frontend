import React, { useState, useEffect, useRef } from "react";
import { Map as MapboxMap, Source, Layer, Marker } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { Capacitor } from "@capacitor/core";
import PricingPage from "./PricingPage";
import BillingSuccess from "./BillingSuccess";
import BillingCancel from "./BillingCancel";
import BillingDashboard from "./BillingDashboard";

const API = "https://roam-backend-production.up.railway.app";
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
  const res = await fetch(`${API}${path}`, { ...options, headers });
  return res.json();
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
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

const CIRCLE_LAYER = {
  id: "venue-points",
  type: "circle",
  paint: {
    "circle-radius": ["step", ["get", "busy_score"], 6, 60, 7, 80, 8],
    "circle-color": ["get", "color"],
    "circle-stroke-color": "#FAFAF8",
    "circle-stroke-width": 1.5,
  },
};

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
              style={{ background: "rgba(200,169,110,0.08)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 12, padding: "12px 16px", color: C.marble, fontSize: 14, fontFamily: "'EB Garamond', serif", outline: "none" }} />
            <input placeholder="Home City (optional)" value={form.home_city} onChange={e => setForm(f => ({ ...f, home_city: e.target.value }))}
              style={{ background: "rgba(200,169,110,0.08)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 12, padding: "12px 16px", color: C.marble, fontSize: 14, fontFamily: "'EB Garamond', serif", outline: "none" }} />
          </>
        )}
        <input placeholder="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          style={{ background: "rgba(200,169,110,0.08)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 12, padding: "12px 16px", color: C.marble, fontSize: 14, fontFamily: "'EB Garamond', serif", outline: "none" }} />
        {mode !== "forgot" && (
          <input placeholder="Password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            style={{ background: "rgba(200,169,110,0.08)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 12, padding: "12px 16px", color: C.marble, fontSize: 14, fontFamily: "'EB Garamond', serif", outline: "none" }} />
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

  const inputStyle = { background: "rgba(200,169,110,0.08)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 12, padding: "12px 16px", color: C.marble, fontSize: 14, fontFamily: "'EB Garamond', serif", outline: "none" };

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

function HeatmapScreen({ token, user }) {
  const [venues, setVenues] = useState([]);
  const [filter, setFilter] = useState("All");
  const [activeVenue, setActiveVenue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentCity, setCurrentCity] = useState("Charlotte");
  const [mode, setMode] = useState("visitor");
  const modeOverrideRef = useRef(false);
  const [pulse, setPulse] = useState(true);
  const [showFriends, setShowFriends] = useState(false);
  const [friendPins, setFriendPins] = useState([]);
  const [activeFriend, setActiveFriend] = useState(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (modeOverrideRef.current) return;
    const home = (user?.home_city || "").trim().toLowerCase();
    setMode(home && home === currentCity.trim().toLowerCase() ? "local" : "visitor");
  }, [currentCity, user]);

  useEffect(() => {
    loadVenues("Charlotte");
    const t = setInterval(() => setPulse(p => !p), 1500);
    return () => clearInterval(t);
  }, []);

  async function loadFriends() {
    const data = await apiFetch("/api/friends", {}, token).catch(() => null);
    if (!Array.isArray(data)) return;
    setFriendPins(data.filter(f => {
      const loc = f.location;
      return loc && !isNaN(parseFloat(loc.latitude)) && !isNaN(parseFloat(loc.longitude));
    }));
  }

  useEffect(() => {
    loadFriends();
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") loadFriends();
    }, 20000);
    const onVisible = () => { if (document.visibilityState === "visible") loadFriends(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  function handleMoveEnd(evt) {
    const { latitude, longitude } = evt.viewState;
    const city = getCityFromCoords(latitude, longitude);
    setCurrentCity(city);
    loadVenues(city);
  }

  function handleMapClick(evt) {
    setActiveFriend(null);
    const f = evt.features && evt.features[0];
    if (!f) return;
    const venue = venues.find(v => v.id === f.properties.id);
    if (venue) {
      setActiveVenue(venue);
      mapRef.current?.flyTo({ center: [parseFloat(venue.longitude), parseFloat(venue.latitude)] });
    }
  }

  async function loadVenues(city = "Charlotte") {
    setLoading(true);
    const [venueData, baselineData] = await Promise.all([
      apiFetch(`/api/venues?city=${encodeURIComponent(city)}`),
      apiFetch(`/api/venues/baseline?city=${encodeURIComponent(city)}`),
    ]);
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

  async function reportCrowd(venueId, level) {
    await apiFetch(`/api/venues/${venueId}/crowd`, { method: "POST", body: JSON.stringify({ busy_level: level }) }, token);
    const venue = venues.find(v => v.id === venueId);
    if (venue) {
      // Backend rejects with 403 when location_sharing is off; ignore silently
      apiFetch("/api/friends/location", { method: "PATCH", body: JSON.stringify({ venue_id: venueId, latitude: venue.latitude, longitude: venue.longitude, last_seen: new Date().toISOString() }) }, token).catch(() => {});
    }
    loadVenues(currentCity);
    setActiveVenue(null);
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
  const filtered = sortByMode(filter === "All" ? venues : venues.filter(v => v.category === filter));
  const geojson = {
    type: "FeatureCollection",
    features: filtered
      .filter(v => !isNaN(parseFloat(v.latitude)) && !isNaN(parseFloat(v.longitude)))
      .map(v => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [parseFloat(v.longitude), parseFloat(v.latitude)] },
        properties: { id: v.id, busy_score: v.busy_score || 0, color: getBusyColor(v.busy_score || 0) },
      })),
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", background: C.mapBg }}>
      <div style={{ position: "absolute", top: 12, left: 12, zIndex: 10, display: "flex", gap: 6, flexWrap: "wrap", maxWidth: "70%" }}>
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${filter === f ? C.aureus : "rgba(200,169,110,0.2)"}`, cursor: "pointer", fontSize: 10, fontFamily: "'EB Garamond', serif", background: filter === f ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "rgba(14,15,11,0.88)", color: filter === f ? C.carbon : C.aureus, backdropFilter: "blur(8px)" }}>{f}</button>
        ))}
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
      <div style={{ position: "absolute", bottom: activeVenue ? 220 : 70, left: 0, right: 0, zIndex: 10, display: "flex", gap: 6, padding: "0 12px", overflowX: "auto" }}>
        {CITIES.map(c => (
          <button key={c.name} onClick={() => goToCity(c.name)} style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 12, border: `1px solid ${currentCity === c.name ? C.aureus : "rgba(200,169,110,0.15)"}`, cursor: "pointer", background: currentCity === c.name ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "rgba(14,15,11,0.88)", color: currentCity === c.name ? C.carbon : C.marble, fontSize: 9, fontFamily: "'EB Garamond', serif", backdropFilter: "blur(8px)" }}>{c.name.split(",")[0]}</button>
        ))}
      </div>
      <div style={{ flex: 1, position: "relative" }}>
        <MapboxMap
          ref={mapRef}
          mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
          initialViewState={{ latitude: 35.2271, longitude: -80.8431, zoom: 14 }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          style={{ position: "absolute", inset: 0 }}
          onMoveEnd={handleMoveEnd}
          onClick={handleMapClick}
          interactiveLayerIds={["venue-points"]}
        >
          <Source id="venues" type="geojson" data={geojson}>
            <Layer {...HEATMAP_LAYER} />
            <Layer {...CIRCLE_LAYER} />
          </Source>
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
        </MapboxMap>
      </div>
      {loading && (
        <div style={{ position: "absolute", top: 50, left: "50%", transform: "translateX(-50%)", zIndex: 15, background: "rgba(14,15,11,0.88)", borderRadius: 20, padding: "6px 14px", backdropFilter: "blur(8px)", border: `1px solid rgba(200,169,110,0.2)` }}>
          <span style={{ color: C.aureus, fontSize: 11, fontFamily: "'EB Garamond', serif" }}>Loading venues...</span>
        </div>
      )}
      {!activeVenue && filtered.length > 0 && (
        <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, zIndex: 10, display: "flex", gap: 8, padding: "0 12px", overflowX: "auto" }}>
          {filtered.slice(0, 8).map(v => (
            <div key={v.id} onClick={() => { setActiveVenue(v); mapRef.current?.flyTo({ center: [parseFloat(v.longitude), parseFloat(v.latitude)] }); }}
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
      {activeVenue && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20, background: C.obsidian, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "20px 20px 32px", borderTop: `1px solid rgba(200,169,110,0.2)` }}>
          <button onClick={() => setActiveVenue(null)} style={{ position: "absolute", top: 16, right: 20, background: "none", border: "none", cursor: "pointer", color: C.aureus, fontSize: 18 }}>✕</button>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.marble, marginBottom: 2, fontFamily: "'Playfair Display', serif" }}>{activeVenue.name}</div>
          <div style={{ fontSize: 11, color: C.aureus, marginBottom: 10, fontFamily: "'EB Garamond', serif", opacity: 0.8 }}>{activeVenue.neighborhood} · {activeVenue.city}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: getBusyColor(activeVenue.busy_score || 0), boxShadow: `0 0 8px ${getBusyColor(activeVenue.busy_score || 0)}` }} />
            <span style={{ fontSize: 11, color: getBusyColor(activeVenue.busy_score || 0), fontFamily: "sans-serif", letterSpacing: 1, fontWeight: 700 }}>{getBusyLabel(activeVenue.busy_score || 0).toUpperCase()} · {activeVenue.busy_score || 0}%</span>
          </div>
          <div style={{ fontSize: 9, color: C.marble, opacity: 0.4, marginBottom: 10, fontFamily: "sans-serif", letterSpacing: 1.5 }}>HOW BUSY IS IT RIGHT NOW?</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[["😴", 20, "Quiet"], ["🙂", 50, "Busy"], ["🔥", 85, "Packed"]].map(([emoji, level, label]) => (
              <button key={level} onClick={() => reportCrowd(activeVenue.id, level)}
                style={{ flex: 1, padding: "10px 8px", borderRadius: 12, border: `1px solid rgba(200,169,110,0.2)`, background: "rgba(200,169,110,0.06)", cursor: "pointer", fontFamily: "inherit" }}>
                <div style={{ fontSize: 22 }}>{emoji}</div>
                <div style={{ fontSize: 9, color: C.aureus, marginTop: 4, fontFamily: "sans-serif", letterSpacing: 0.5 }}>{label}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {activeFriend && (
        <div style={{ position: "absolute", top: 90, left: "50%", transform: "translateX(-50%)", zIndex: 15, background: "rgba(14,15,11,0.94)", borderRadius: 14, padding: "10px 16px", border: `1px solid rgba(200,169,110,0.3)`, backdropFilter: "blur(8px)", display: "flex", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif" }}>{activeFriend.friend?.display_name || activeFriend.friend?.username}</div>
            <div style={{ fontSize: 10, color: C.aureus, fontFamily: "'EB Garamond', serif" }}>📍 at {activeFriend.location?.venues?.name || "a venue"}</div>
          </div>
          <button onClick={() => setActiveFriend(null)} style={{ background: "none", border: "none", cursor: "pointer", color: C.aureus, fontSize: 14 }}>✕</button>
        </div>
      )}
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

  async function accept(id) { await apiFetch(`/api/friends/${id}/accept`, { method: "PATCH" }, token); reload(); }
  async function remove(id) { await apiFetch(`/api/friends/${id}`, { method: "DELETE" }, token); setConfirmRemove(null); reload(); }

  async function sendRequest() {
    if (!addUsername.trim() || sending) return;
    setSending(true); setAddMsg(null);
    const result = await apiFetch("/api/friends/request", { method: "POST", body: JSON.stringify({ username: addUsername.trim() }) }, token);
    if (result?.error) setAddMsg({ ok: false, text: result.error });
    else { setAddMsg({ ok: true, text: "Request sent!" }); setAddUsername(""); }
    setSending(false);
  }

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
              <input value={addUsername} onChange={e => { setAddUsername(e.target.value); setAddMsg(null); }} placeholder="Search by username..."
                onKeyDown={e => { if (e.key === "Enter") sendRequest(); }}
                style={{ flex: 1, background: "rgba(200,169,110,0.06)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 20, padding: "8px 14px", color: C.marble, fontSize: 13, fontFamily: "'EB Garamond', serif", outline: "none" }} />
              <button onClick={sendRequest} disabled={sending || !addUsername.trim()}
                style={{ padding: "8px 14px", borderRadius: 20, border: "none", background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: C.carbon, fontWeight: 700, fontSize: 12, cursor: (sending || !addUsername.trim()) ? "default" : "pointer", opacity: (sending || !addUsername.trim()) ? 0.5 : 1, fontFamily: "'Playfair Display', serif" }}>Send</button>
            </div>
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

  useEffect(() => {
    apiFetch("/api/stories", {}, token).then(data => { if (Array.isArray(data)) setStories(data); setLoading(false); });
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
      const result = await apiFetch("/api/stories", { method: "POST", body: JSON.stringify({ venue_id: selectedVenue.id, caption: newCaption, emoji, visibility: "public" }) }, token);
      if (result?.error) { setPostError(result.error); setPosting(false); return; }
      const data = await apiFetch("/api/stories", {}, token);
      if (Array.isArray(data)) setStories(data);
      setNewCaption(""); setSelectedVenue(null); setVenueQuery("");
    } catch {
      setPostError("Failed to post story. Try again.");
    }
    setPosting(false);
  }

  async function toggleLike(storyId) {
    await apiFetch(`/api/stories/${storyId}/like`, { method: "POST" }, token);
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
              style={{ width: "100%", boxSizing: "border-box", background: "rgba(200,169,110,0.06)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 20, padding: "8px 14px", color: C.marble, fontSize: 13, fontFamily: "'EB Garamond', serif", outline: "none" }} />
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
        <div style={{ display: "flex", gap: 8 }}>
          <input value={newCaption} onChange={e => setNewCaption(e.target.value)} placeholder="What's happening at a venue?"
            style={{ flex: 1, background: "rgba(200,169,110,0.06)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 20, padding: "8px 14px", color: C.marble, fontSize: 13, fontFamily: "'EB Garamond', serif", outline: "none" }} />
          <button onClick={postStory} disabled={posting || !newCaption.trim() || !selectedVenue}
            style={{ padding: "8px 14px", borderRadius: 20, border: "none", background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: C.carbon, fontWeight: 700, fontSize: 12, cursor: (posting || !newCaption.trim() || !selectedVenue) ? "default" : "pointer", opacity: (posting || !newCaption.trim() || !selectedVenue) ? 0.5 : 1, fontFamily: "'Playfair Display', serif" }}>Post</button>
        </div>
        {postError && <div style={{ marginTop: 6, fontSize: 11, color: "#e07a6a", fontFamily: "'EB Garamond', serif" }}>{postError}</div>}
      </div>
      {active && (
        <div onClick={() => setActive(null)} style={{ position: "absolute", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "85%", borderRadius: 24, overflow: "hidden", background: C.obsidian, border: `1px solid rgba(200,169,110,0.2)` }}>
            <div style={{ height: 160, background: `linear-gradient(135deg, rgba(200,169,110,0.2), rgba(14,15,11,0.9))`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <div style={{ fontSize: 48 }}>{active.emoji || "📸"}</div>
              <div style={{ fontSize: 13, color: C.marble, fontFamily: "'Playfair Display', serif" }}>{active.venues?.name || "A venue"}</div>
            </div>
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
        {!loading && stories.length === 0 && <div style={{ textAlign: "center", color: C.marble, fontSize: 13, padding: 20, fontFamily: "'EB Garamond', serif", opacity: 0.4 }}>No stories yet — be the first to post!</div>}
        {stories.map(s => (
          <div key={s.id} onClick={() => setActive(s)}
            style={{ background: "rgba(200,169,110,0.04)", borderRadius: 16, padding: 14, border: `1px solid rgba(200,169,110,0.12)`, cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: `linear-gradient(135deg, rgba(200,169,110,0.3), rgba(200,169,110,0.1))`, border: `1px solid rgba(200,169,110,0.3)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{s.emoji || "📸"}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif" }}>{s.venues?.name || "A venue"}</span>
                <span style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", opacity: 0.6 }}>{timeAgo(s.created_at)}</span>
              </div>
              <div style={{ fontSize: 12, color: C.marble, fontFamily: "'EB Garamond', serif", fontStyle: "italic", marginBottom: 4, opacity: 0.8 }}>"{s.caption}"</div>
              <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", opacity: 0.5 }}>by {s.is_anonymous ? "Anonymous" : s.users?.display_name || "Roamer"} · 🤍 {s.like_count}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DealsScreen({ token }) {
  const [deals, setDeals] = useState([]);
  const [redeemed, setRedeemed] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/deals").then(data => { if (Array.isArray(data)) setDeals(data); setLoading(false); });
  }, []);

  async function redeem(deal) {
    if (redeemed[deal.id]) return;
    const data = await apiFetch(`/api/deals/${deal.id}/redeem`, { method: "POST" }, token);
    if (data.success) setRedeemed(r => ({ ...r, [deal.id]: true }));
    else if (data.error) alert(data.error);
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 16px", background: C.mapBg }}>
      <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12, opacity: 0.7 }}>Tonight's Deals · {deals.length} available</div>
      {loading && <div style={{ textAlign: "center", color: C.aureus, fontSize: 13, padding: 20, fontFamily: "'EB Garamond', serif", opacity: 0.6 }}>Loading deals...</div>}
      {!loading && deals.length === 0 && <div style={{ textAlign: "center", color: C.marble, fontSize: 13, padding: 20, fontFamily: "'EB Garamond', serif", opacity: 0.4 }}>No deals tonight — check back later!</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {deals.map(d => {
          const isRedeemed = redeemed[d.id];
          return (
            <div key={d.id} style={{ background: isRedeemed ? "rgba(200,169,110,0.02)" : "rgba(200,169,110,0.05)", borderRadius: 18, padding: 16, border: `1px solid ${isRedeemed ? "rgba(200,169,110,0.06)" : "rgba(200,169,110,0.18)"}`, opacity: isRedeemed ? 0.5 : 1, transition: "all 0.3s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.aureus, boxShadow: `0 0 6px ${C.aureus}` }} />
                    <span style={{ fontSize: 10, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 1 }}>{d.venues?.name}</span>
                    {d.is_premium_only && <span style={{ fontSize: 8, color: C.aureus, background: "rgba(200,169,110,0.1)", border: `1px solid rgba(200,169,110,0.3)`, borderRadius: 6, padding: "2px 6px" }}>✦ PREMIUM</span>}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif" }}>{d.title}</div>
                  <div style={{ fontSize: 11, color: C.marble, fontFamily: "'EB Garamond', serif", marginTop: 2, opacity: 0.6 }}>{d.detail}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 9, color: C.marble, opacity: 0.4, fontFamily: "sans-serif" }}>Expires</div>
                  <div style={{ fontSize: 11, color: C.aureus, fontFamily: "'EB Garamond', serif" }}>{new Date(d.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 10, color: C.marble, opacity: 0.3, fontFamily: "sans-serif" }}>💾 {d.save_count} saved</div>
                <button onClick={() => redeem(d)} style={{ padding: "7px 18px", borderRadius: 12, border: "none", cursor: d.is_premium_only ? "not-allowed" : "pointer", fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 11, letterSpacing: 0.5, background: isRedeemed ? "rgba(200,169,110,0.1)" : d.is_premium_only ? "rgba(200,169,110,0.1)" : `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: isRedeemed || d.is_premium_only ? C.aureus : C.carbon }}>
                  {isRedeemed ? "✓ Redeemed" : d.is_premium_only ? "🔒 Premium" : "Redeem"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DashboardScreen({ token, user }) {
  const [venues, setVenues] = useState([]);
  const [selected, setSelected] = useState(null);
  const [dash, setDash] = useState(null);
  const [newDeal, setNewDeal] = useState({ title: "", detail: "", expires_at: "" });
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [lastReport, setLastReport] = useState(null);
  const [claimView, setClaimView] = useState("dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [claimTarget, setClaimTarget] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => { loadMyVenues(); }, []);

  async function loadMyVenues() {
    setLoading(true);
    const data = await apiFetch("/api/venues/mine", {}, token);
    if (Array.isArray(data) && data.length > 0) { setVenues(data); loadDash(data[0].id); }
    else { setLoading(false); setClaimView("search"); }
  }

  async function loadDash(venueId) {
    setLoading(true); setSelected(venueId);
    const data = await apiFetch(`/api/dashboard/${venueId}`, {}, token);
    if (!data.error) setDash(data);
    setLoading(false); setClaimView("dashboard");
  }

  async function searchVenues() {
    if (searchQuery.trim().length < 2) return;
    setSearching(true);
    const data = await apiFetch(`/api/venues/search?q=${encodeURIComponent(searchQuery)}`, {}, token);
    if (Array.isArray(data)) setSearchResults(data);
    setSearching(false);
  }

  async function claimVenue() {
    if (!claimTarget) return;
    setClaiming(true);
    const data = await apiFetch(`/api/venues/${claimTarget.id}/claim`, { method: "POST" }, token);
    if (data.success) { setClaimView("success"); setTimeout(() => loadMyVenues(), 1500); }
    else alert(data.error || "Claim failed.");
    setClaiming(false);
  }

  async function postDeal() {
    if (!newDeal.title || !newDeal.expires_at) return alert("Title and expiry required.");
    setPosting(true);
    await apiFetch("/api/deals", { method: "POST", body: JSON.stringify({ venue_id: selected, ...newDeal }) }, token);
    setNewDeal({ title: "", detail: "", expires_at: "" });
    loadDash(selected); setPosting(false);
  }

  async function toggleBoost(enable) {
    await apiFetch(`/api/dashboard/${selected}/boost`, { method: "PATCH", body: JSON.stringify({ enable }) }, token);
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
    if (data.url) { window.open(data.url, "_blank"); } else { alert(data.error || "Failed to start checkout."); }
    setUpgrading(false);
  }

  async function openPortal() {
    const data = await apiFetch("/api/stripe/create-portal-session", { method: "POST", body: JSON.stringify({ venueId: selected }) }, token);
    if (data.url) window.open(data.url, "_blank");
  }

  const inputStyle = { background: "rgba(200,169,110,0.06)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 10, padding: "8px 12px", color: C.marble, fontSize: 12, fontFamily: "'EB Garamond', serif", outline: "none", width: "100%" };

  if (claimView === "search" || claimView === "confirm") {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: C.mapBg }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid rgba(200,169,110,0.1)` }}>
          <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>{claimView === "confirm" ? "Confirm Claim" : "Claim Your Venue"}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.marble, fontFamily: "'Playfair Display', serif" }}>{claimView === "confirm" ? claimTarget?.name : "Find your establishment"}</div>
        </div>
        {claimView === "confirm" && claimTarget && (
          <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "rgba(200,169,110,0.06)", borderRadius: 16, padding: 16, border: `1px solid rgba(200,169,110,0.2)` }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.marble, marginBottom: 4, fontFamily: "'Playfair Display', serif" }}>{claimTarget.name}</div>
              <div style={{ fontSize: 12, color: C.aureus, marginBottom: 2, fontFamily: "'EB Garamond', serif" }}>{claimTarget.address}</div>
              <div style={{ fontSize: 10, color: C.marble, opacity: 0.4, fontFamily: "sans-serif" }}>{claimTarget.neighborhood} · {claimTarget.city}</div>
            </div>
            <p style={{ fontSize: 12, color: C.marble, fontFamily: "'EB Garamond', serif", lineHeight: 1.7, margin: 0, opacity: 0.7 }}>By claiming this venue you confirm you are the owner or authorized representative.</p>
            <button onClick={claimVenue} disabled={claiming} style={{ padding: "14px", borderRadius: 14, border: "none", background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: C.carbon, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Playfair Display', serif", opacity: claiming ? 0.7 : 1, letterSpacing: 0.5 }}>
              {claiming ? "Claiming..." : "✓ Confirm — This Is My Venue"}
            </button>
            <button onClick={() => { setClaimView("search"); setClaimTarget(null); }} style={{ padding: "12px", borderRadius: 14, border: `1px solid rgba(200,169,110,0.2)`, background: "transparent", color: C.aureus, fontSize: 13, cursor: "pointer", fontFamily: "'EB Garamond', serif" }}>← Back</button>
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
                <div key={v.id} style={{ background: "rgba(200,169,110,0.04)", borderRadius: 14, padding: "14px 16px", border: `1px solid rgba(200,169,110,${v.owner_id ? "0.06" : "0.2"})`, opacity: v.owner_id ? 0.5 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.marble, marginBottom: 2, fontFamily: "'Playfair Display', serif" }}>{v.name}</div>
                      <div style={{ fontSize: 11, color: C.aureus, fontFamily: "'EB Garamond', serif", opacity: 0.8 }}>{v.address}</div>
                    </div>
                    {v.owner_id ? (
                      <div style={{ fontSize: 10, color: C.aureus, flexShrink: 0, marginLeft: 8, fontFamily: "sans-serif", opacity: 0.5 }}>Claimed</div>
                    ) : (
                      <button onClick={() => { setClaimTarget(v); setClaimView("confirm"); }} style={{ background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, border: "none", borderRadius: 10, padding: "7px 12px", fontSize: 11, fontWeight: 700, color: C.carbon, cursor: "pointer", fontFamily: "'Playfair Display', serif", flexShrink: 0, marginLeft: 8 }}>Claim</button>
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
              <input value={newDeal.expires_at} onChange={e => setNewDeal(d => ({ ...d, expires_at: e.target.value }))} type="datetime-local" style={inputStyle} />
              <button onClick={postDeal} disabled={posting} style={{ padding: "10px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: C.carbon, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Playfair Display', serif", letterSpacing: 0.5 }}>{posting ? "Posting..." : "Post Deal ✦"}</button>
            </div>
          </div>

          {dash.active_deals?.length > 0 && (
            <div style={{ background: "rgba(200,169,110,0.04)", borderRadius: 16, padding: 14, marginBottom: 12, border: `1px solid rgba(200,169,110,0.1)` }}>
              <div style={{ fontSize: 9, color: C.aureus, fontFamily: "sans-serif", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Active Deals</div>
              {dash.active_deals.map(d => (
                <div key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid rgba(200,169,110,0.08)` }}>
                  <div style={{ fontSize: 12, color: C.marble, fontFamily: "'EB Garamond', serif" }}>{d.title}</div>
                  <div style={{ fontSize: 10, color: C.aureus, fontFamily: "sans-serif" }}>✦ {d.redemption_count}</div>
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
    const data = await apiFetch("/api/auth/account", { method: "DELETE" }, token);
    if (data.success) {
      onLogout();
    } else {
      alert(data.error || "Failed to delete account. Please try again.");
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

export default function RoamApp() {
  const [tab, setTab] = useState("map");
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  const path = window.location.pathname;
  const getToken = async () => localStorage.getItem("roam_token");
  const savedUser = (() => { try { return JSON.parse(localStorage.getItem("roam_user") || "null"); } catch { return null; } })();
  const savedToken = localStorage.getItem("roam_token");

  if (path === "/reset-password") return <ResetPasswordScreen />;
  if (path === "/pricing") return <PricingPage user={savedUser} getToken={getToken} venue={null} />;
  if (path === "/billing/success") return <BillingSuccess getToken={getToken} />;
  if (path === "/billing/cancel") return <BillingCancel />;
  if (path === "/billing") {
    if (!savedUser || !savedToken) { window.location.href = "/"; return null; }
    return <BillingDashboard user={savedUser} getToken={getToken} venue={null} />;
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

  const tabs = [
    { id: "map",       icon: "🗺️", label: "Map" },
    { id: "stories",   icon: "📸", label: "Stories" },
    { id: "deals",     icon: "✦",  label: "Deals" },
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
      `}</style>
      <div style={{ width: 375, height: 780, background: C.mapBg, borderRadius: 48, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: `0 40px 120px rgba(0,0,0,0.9), 0 0 0 1px rgba(200,169,110,0.15)`, position: "relative" }}>
        <div style={{ padding: "14px 24px 6px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, background: C.mapBg }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.marble, opacity: 0.6 }}>9:41</span>
          <div style={{ width: 120, height: 28, background: "#000", borderRadius: 20, position: "absolute", left: "50%", transform: "translateX(-50%)", top: 8 }} />
          <span style={{ fontSize: 10, color: C.marble, opacity: 0.35 }}>●●● ▲ ⬛</span>
        </div>
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
              {tab === "map"       && <HeatmapScreen token={currentToken} user={currentUser} />}
              {tab === "stories"   && <StoriesScreen token={currentToken} user={currentUser} />}
              {tab === "deals"     && <DealsScreen token={currentToken} user={currentUser} />}
              {tab === "dashboard" && <DashboardScreen token={currentToken} user={currentUser} />}
              {tab === "settings"  && <SettingsScreen token={currentToken} user={currentUser} onLogout={handleLogout} onUserUpdate={u => { setUser(u); localStorage.setItem("roam_user", JSON.stringify(u)); }} />}
            </>
          )}
        </div>
        {currentUser && (
          <div style={{ padding: "10px 8px 24px", display: "flex", background: "rgba(14,15,11,0.97)", borderTop: `1px solid rgba(200,169,110,0.12)`, flexShrink: 0 }}>
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
