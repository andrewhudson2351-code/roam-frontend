import React, { useState, useEffect, useRef } from "react";
import PricingPage from "./PricingPage";
import BillingSuccess from "./BillingSuccess";
import BillingCancel from "./BillingCancel";
import BillingDashboard from "./BillingDashboard";

const API = "https://roam-backend-production.up.railway.app";
const MAPS_KEY = "AIzaSyAKVJVUifzdT7yes3rZqGSIwW6bWgdRmXc";

// ── Brand palette ──────────────────────────────────────
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

const heatColor = {
  packed:   C.packed,
  busy:     C.busy,
  buzzing:  C.buzzing,
  moderate: C.moderate,
  quiet:    C.quiet,
};

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

const DARK_MAP_STYLE = [];

function loadGoogleMaps() {
  return new Promise(resolve => {
    if (window.google?.maps) { resolve(); return; }
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}`;
    s.onload = resolve;
    document.head.appendChild(s);
  });
}

// ── Compass icon ───────────────────────────────────────
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

// ── SVG Blob Layer ─────────────────────────────────────
const blobCfg = {
  packed:   { rx: 0.009, ry: 0.006, coreOp: 0.55, midOp: 0.28, rimOp: 0.08 },
  busy:     { rx: 0.007, ry: 0.005, coreOp: 0.40, midOp: 0.20, rimOp: 0.05 },
  buzzing:  { rx: 0.006, ry: 0.004, coreOp: 0.30, midOp: 0.14, rimOp: 0.03 },
  moderate: { rx: 0.004, ry: 0.003, coreOp: 0.18, midOp: 0.08, rimOp: 0.01 },
  quiet:    { rx: 0,     ry: 0,     coreOp: 0,    midOp: 0,    rimOp: 0    },
};

function HeatBlobOverlay({ venues, mapInstance }) {
  const svgRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!mapInstance || !svgRef.current) return;

    function update() {
      const bounds = mapInstance.getBounds();
      if (!bounds) return;
      const div = mapInstance.getDiv();
      const W = div.offsetWidth, H = div.offsetHeight;
      const ne = bounds.getNorthEast(), sw = bounds.getSouthWest();
      const latRange = ne.lat() - sw.lat(), lngRange = ne.lng() - sw.lng();

      function toXY(lat, lng) {
        return {
          x: ((lng - sw.lng()) / lngRange) * W,
          y: ((ne.lat() - lat) / latRange) * H,
        };
      }

      const svgEl = svgRef.current;
      const defs = svgEl.querySelector("defs");
      const blobsG = svgEl.querySelector(".blobs");
      if (!defs || !blobsG) return;

      svgEl.setAttribute("width", W);
      svgEl.setAttribute("height", H);
      svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`);
      defs.innerHTML = "";
      blobsG.innerHTML = "";

      const active = venues.filter(v => scoreToHeat(v.busy_score || 0) !== "quiet");
      ["moderate","buzzing","busy","packed"].forEach(tier => {
        active
          .filter(v => scoreToHeat(v.busy_score || 0) === tier)
          .forEach(v => {
            const { x, y } = toXY(parseFloat(v.latitude), parseFloat(v.longitude));
            if (isNaN(x) || isNaN(y)) return;
            const cfg = blobCfg[tier];
            const col = heatColor[tier];
            const rx = cfg.rx * W, ry = cfg.ry * H;
            const gId = `rg_${v.id}`;

            const grad = document.createElementNS("http://www.w3.org/2000/svg", "radialGradient");
            grad.setAttribute("id", gId);
            grad.setAttribute("cx", "50%"); grad.setAttribute("cy", "50%"); grad.setAttribute("r", "50%");
            [[0, cfg.coreOp],[0.18, cfg.coreOp * 0.85],[0.40, cfg.midOp],[0.68, cfg.rimOp],[1.0, 0]].forEach(([offset, op]) => {
              const stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
              stop.setAttribute("offset", `${offset * 100}%`);
              stop.setAttribute("stop-color", col);
              stop.setAttribute("stop-opacity", op);
              grad.appendChild(stop);
            });
            defs.appendChild(grad);

            const ellipse = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
            ellipse.setAttribute("cx", x); ellipse.setAttribute("cy", y);
            ellipse.setAttribute("rx", rx); ellipse.setAttribute("ry", ry);
            ellipse.setAttribute("fill", `url(#${gId})`);
            blobsG.appendChild(ellipse);
          });
      });
    }

    update();
    const l1 = mapInstance.addListener("idle", update);
    const l2 = mapInstance.addListener("bounds_changed", () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    });
    return () => {
      window.google?.maps.event.removeListener(l1);
      window.google?.maps.event.removeListener(l2);
      cancelAnimationFrame(rafRef.current);
    };
  }, [mapInstance, venues]);

  return (
    <svg ref={svgRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", mixBlendMode: "screen", zIndex: 2 }}>
      <defs /><g className="blobs" />
    </svg>
  );
}

// ── Auth Screen ────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", username: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setLoading(true); setError("");
    try {
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
      <div style={{ fontSize: 14, color: C.aureus, marginBottom: 6, fontFamily: "'EB Garamond', serif", fontStyle: "italic", textAlign: "center" }}>
        "When in Roam, Do as the Romans Do"
      </div>
      <div style={{ fontSize: 9, color: C.aureus, marginBottom: 32, fontFamily: "sans-serif", letterSpacing: 3, textTransform: "uppercase", opacity: 0.5 }}>The Navigator</div>
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
        {mode === "register" && (
          <input placeholder="Username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            style={{ background: "rgba(200,169,110,0.08)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 12, padding: "12px 16px", color: C.marble, fontSize: 14, fontFamily: "'EB Garamond', serif", outline: "none" }} />
        )}
        <input placeholder="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          style={{ background: "rgba(200,169,110,0.08)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 12, padding: "12px 16px", color: C.marble, fontSize: 14, fontFamily: "'EB Garamond', serif", outline: "none" }} />
        <input placeholder="Password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          style={{ background: "rgba(200,169,110,0.08)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 12, padding: "12px 16px", color: C.marble, fontSize: 14, fontFamily: "'EB Garamond', serif", outline: "none" }} />
        {error && <div style={{ fontSize: 12, color: C.packed, textAlign: "center" }}>{error}</div>}
        <button onClick={submit} disabled={loading}
          style={{ padding: "14px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: C.carbon, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Playfair Display', serif", letterSpacing: 1.5, opacity: loading ? 0.7 : 1 }}>
          {loading ? "..." : mode === "login" ? "Enter" : "Create Account"}
        </button>
        <button onClick={() => { setMode(m => m === "login" ? "register" : "login"); setError(""); }}
          style={{ background: "none", border: "none", color: C.aureus, fontSize: 12, cursor: "pointer", fontFamily: "'EB Garamond', serif", opacity: 0.6 }}>
          {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
}

// ── Heatmap Screen ─────────────────────────────────────
function HeatmapScreen({ token }) {
  const [venues, setVenues] = useState([]);
  const [filter, setFilter] = useState("All");
  const [activeVenue, setActiveVenue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentCity, setCurrentCity] = useState("Charlotte");
  const [pulse, setPulse] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapInstance, setMapInstance] = useState(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const idleListenerRef = useRef(null);

  useEffect(() => {
    loadGoogleMaps().then(() => {
      if (!mapRef.current) return;
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: 35.2271, lng: -80.8431 },
        zoom: 14,
        styles: [],
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
      });
      setMapInstance(mapInstanceRef.current);
      idleListenerRef.current = mapInstanceRef.current.addListener("idle", () => {
        const center = mapInstanceRef.current.getCenter();
        const city = getCityFromCoords(center.lat(), center.lng());
        setCurrentCity(city);
        loadVenues(city);
        setMapReady(true);
      });
    });
    const t = setInterval(() => setPulse(p => !p), 1500);
    return () => {
      clearInterval(t);
      if (idleListenerRef.current) window.google?.maps.event.removeListener(idleListenerRef.current);
    };
  }, []);

  async function loadVenues(city = "Charlotte") {
    setLoading(true);
    const data = await apiFetch(`/api/venues?city=${encodeURIComponent(city)}`);
    if (Array.isArray(data)) setVenues(data);
    setLoading(false);
  }

  useEffect(() => {
    if (!mapInstanceRef.current || !window.google?.maps) return;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    const filtered = filter === "All" ? venues : venues.filter(v => v.category === filter);
    filtered.forEach(venue => {
      const score = venue.busy_score || 0;
      const color = getBusyColor(score);
      const pos = { lat: parseFloat(venue.latitude), lng: parseFloat(venue.longitude) };
      if (isNaN(pos.lat) || isNaN(pos.lng)) return;
      const marker = new window.google.maps.Marker({
        position: pos, map: mapInstanceRef.current, title: venue.name,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: score >= 80 ? 8 : score >= 60 ? 7 : 6, fillColor: color, fillOpacity: 1, strokeColor: C.marble, strokeWeight: 1.5 },
        zIndex: score,
      });
      marker.addListener("click", () => { setActiveVenue(venue); mapInstanceRef.current.panTo(pos); });
      markersRef.current.push(marker);
    });
  }, [venues, filter]);

  async function reportCrowd(venueId, level) {
    await apiFetch(`/api/venues/${venueId}/crowd`, { method: "POST", body: JSON.stringify({ busy_level: level }) }, token);
    loadVenues(currentCity);
    setActiveVenue(null);
  }

  function goToCity(city) {
    const c = CITIES.find(c => c.name === city);
    if (c && mapInstanceRef.current) { mapInstanceRef.current.panTo({ lat: c.lat, lng: c.lng }); mapInstanceRef.current.setZoom(14); }
  }

  const filters = ["All", "Bar", "Club", "Restaurant"];
  const filtered = filter === "All" ? venues : venues.filter(v => v.category === filter);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", background: C.mapBg }}>
      <div style={{ position: "absolute", top: 12, left: 12, zIndex: 10, display: "flex", gap: 6, flexWrap: "wrap", maxWidth: "70%" }}>
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "5px 12px", borderRadius: 20, border: `1px solid ${filter === f ? C.aureus : "rgba(200,169,110,0.2)"}`, cursor: "pointer", fontSize: 10, fontFamily: "'EB Garamond', serif", background: filter === f ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "rgba(14,15,11,0.88)", color: filter === f ? C.carbon : C.aureus, backdropFilter: "blur(8px)" }}>{f}</button>
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
      </div>
      <div style={{ position: "absolute", bottom: activeVenue ? 220 : 70, left: 0, right: 0, zIndex: 10, display: "flex", gap: 6, padding: "0 12px", overflowX: "auto" }}>
        {CITIES.map(c => (
          <button key={c.name} onClick={() => goToCity(c.name)} style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 12, border: `1px solid ${currentCity === c.name ? C.aureus : "rgba(200,169,110,0.15)"}`, cursor: "pointer", background: currentCity === c.name ? `linear-gradient(135deg, ${C.aureus}, ${C.ivory})` : "rgba(14,15,11,0.88)", color: currentCity === c.name ? C.carbon : C.marble, fontSize: 9, fontFamily: "'EB Garamond', serif", backdropFilter: "blur(8px)" }}>{c.name.split(",")[0]}</button>
        ))}
      </div>
      <div style={{ flex: 1, position: "relative" }}>
        <div ref={mapRef} style={{ position: "absolute", inset: 0 }} />
{mapInstance && (
  <HeatBlobOverlay venues={filtered} mapInstance={mapInstance} />
)}      </div>
      {loading && (
        <div style={{ position: "absolute", top: 50, left: "50%", transform: "translateX(-50%)", zIndex: 15, background: "rgba(14,15,11,0.88)", borderRadius: 20, padding: "6px 14px", backdropFilter: "blur(8px)", border: `1px solid rgba(200,169,110,0.2)` }}>
          <span style={{ color: C.aureus, fontSize: 11, fontFamily: "'EB Garamond', serif" }}>Loading venues...</span>
        </div>
      )}
      {!activeVenue && filtered.length > 0 && (
        <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, zIndex: 10, display: "flex", gap: 8, padding: "0 12px", overflowX: "auto" }}>
          {filtered.slice(0, 8).map(v => (
            <div key={v.id} onClick={() => { setActiveVenue(v); mapInstanceRef.current?.panTo({ lat: parseFloat(v.latitude), lng: parseFloat(v.longitude) }); }}
              style={{ flexShrink: 0, background: "rgba(14,15,11,0.92)", borderRadius: 12, padding: "8px 12px", border: `1px solid rgba(200,169,110,0.15)`, cursor: "pointer", backdropFilter: "blur(8px)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.marble, whiteSpace: "nowrap", fontFamily: "'EB Garamond', serif" }}>{v.name}</div>
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
    </div>
  );
}

// ── Stories Screen ─────────────────────────────────────
function StoriesScreen({ token }) {
  const [stories, setStories] = useState([]);
  const [active, setActive] = useState(null);
  const [liked, setLiked] = useState({});
  const [loading, setLoading] = useState(true);
  const [newCaption, setNewCaption] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    apiFetch("/api/stories", {}, token).then(data => { if (Array.isArray(data)) setStories(data); setLoading(false); });
  }, []);

  async function postStory() {
    if (!newCaption.trim()) return;
    setPosting(true);
    const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    await apiFetch("/api/stories", { method: "POST", body: JSON.stringify({ caption: newCaption, emoji, visibility: "public" }) }, token);
    const data = await apiFetch("/api/stories", {}, token);
    if (Array.isArray(data)) setStories(data);
    setNewCaption(""); setPosting(false);
  }

  async function toggleLike(storyId) {
    await apiFetch(`/api/stories/${storyId}/like`, { method: "POST" }, token);
    setLiked(l => ({ ...l, [storyId]: !l[storyId] }));
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: C.mapBg }}>
      <div style={{ padding: "12px 16px 8px", display: "flex", gap: 8, borderBottom: `1px solid rgba(200,169,110,0.1)` }}>
        <input value={newCaption} onChange={e => setNewCaption(e.target.value)} placeholder="What's happening at a venue?"
          style={{ flex: 1, background: "rgba(200,169,110,0.06)", border: `1px solid rgba(200,169,110,0.2)`, borderRadius: 20, padding: "8px 14px", color: C.marble, fontSize: 13, fontFamily: "'EB Garamond', serif", outline: "none" }} />
        <button onClick={postStory} disabled={posting}
          style={{ padding: "8px 14px", borderRadius: 20, border: "none", background: `linear-gradient(135deg, ${C.aureus}, ${C.ivory})`, color: C.carbon, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Playfair Display', serif" }}>Post</button>
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

// ── Deals Screen ───────────────────────────────────────
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

// ── Dashboard Screen ───────────────────────────────────
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
              { label: "Redemptions",   value: dash.today?.deal_redemptions || 0, color: C.ivory },
              { label: "Live Score",    value: `${dash.crowd?.busy_score || 0}%`, color: C.buzzing }
            ].map(stat => (
              <div key={stat.label} style={{ background: "rgba(200,169,110,0.04)", borderRadius: 14, padding: "12px 10px", border: `1px solid rgba(200,169,110,0.1)`, textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: stat.color, fontFamily: "'Playfair Display', serif" }}>{stat.value}</div>
                <div style={{ fontSize: 8, color: C.marble, marginTop: 2, opacity: 0.35, fontFamily: "sans-serif", letterSpacing: 0.5 }}>{stat.label.toUpperCase()}</div>
              </div>
            ))}
          </div>

          {/* Self-reporting widget */}
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

          {/* Post a deal */}
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
                <div style={{ fontSize: 10, color: C.aureus, marginTop: 2, fontFamily: "'EB Garamond', serif", opacity: 0.7 }}>Highlighted on map · $149/mo</div>
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

// ── Main App ───────────────────────────────────────────
export default function RoamApp() {
  const [tab, setTab] = useState("map");
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  const path = window.location.pathname;
  const getToken = async () => localStorage.getItem("roam_token");
  const savedUser = (() => { try { return JSON.parse(localStorage.getItem("roam_user") || "null"); } catch { return null; } })();
  const savedToken = localStorage.getItem("roam_token");

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
              {tab === "map"       && <HeatmapScreen token={currentToken} />}
              {tab === "stories"   && <StoriesScreen token={currentToken} user={currentUser} />}
              {tab === "deals"     && <DealsScreen token={currentToken} user={currentUser} />}
              {tab === "dashboard" && <DashboardScreen token={currentToken} user={currentUser} />}
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
