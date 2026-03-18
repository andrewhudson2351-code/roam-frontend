import React, { useState, useEffect, useRef } from "react";

const API = "https://roam-backend-production.up.railway.app";
const MAPS_KEY = "AIzaSyAKVJVUifzdT7yes3rZqGSIwW6bWgdRmXc";

async function api(path, options = {}, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  return res.json();
}

function getBusyColor(busy) {
  if (busy >= 80) return "#ff3366";
  if (busy >= 60) return "#f59e0b";
  return "#22c55e";
}
function getBusyLabel(busy) {
  if (busy >= 80) return "Packed";
  if (busy >= 60) return "Busy";
  return "Chill";
}
function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
const COLORS = ["#ff3366","#f59e0b","#8b5cf6","#06b6d4","#10b981","#ec4899"];
const EMOJIS = ["🔥","🍺","🎵","🍸","🎸","💃","🎉","🌙"];

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#0d1117" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "rgba(255,255,255,0.4)" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0d1117" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#1f1f35" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#252545" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1a1a30" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a0a18" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "rgba(255,255,255,0.3)" }] },
];

// Load Google Maps script
function loadGoogleMaps() {
  return new Promise((resolve) => {
    if (window.google?.maps) { resolve(); return; }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}`;
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

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
      const data = await api(endpoint, { method: "POST", body: JSON.stringify(body) });
      if (data.error) { setError(data.error); setLoading(false); return; }
      onAuth(data.user, data.token);
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>🌍</div>
      <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", marginBottom: 4 }}>roam</div>
      <div style={{ fontSize: 17, color: "rgba(255,255,255,0.6)", marginBottom: 32, fontFamily: "'Dancing Script', cursive", letterSpacing: 0.5, textAlign: "center", lineHeight: 1.4 }}>
        "When in Roam, Do as the Romans Do"
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap');`}</style>
      </div>
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
        {mode === "register" && (
          <input placeholder="Username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 16px", color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none" }} />
        )}
        <input placeholder="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 16px", color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none" }} />
        <input placeholder="Password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "12px 16px", color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none" }} />
        {error && <div style={{ fontSize: 12, color: "#ff3366", textAlign: "center" }}>{error}</div>}
        <button onClick={submit} disabled={loading} style={{ padding: "14px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #ff3366, #8b5cf6)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1 }}>
          {loading ? "..." : mode === "login" ? "Log In" : "Create Account"}
        </button>
        <button onClick={() => { setMode(m => m === "login" ? "register" : "login"); setError(""); }}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
}

function HeatmapScreen({ token }) {
  const [venues, setVenues] = useState([]);
  const [filter, setFilter] = useState("All");
  const [activeVenue, setActiveVenue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pulse, setPulse] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const circlesRef = useRef([]);
  const infoWindowRef = useRef(null);

  useEffect(() => {
    loadGoogleMaps().then(() => setMapReady(true));
    const t = setInterval(() => setPulse(p => !p), 1500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (mapReady && mapRef.current && !mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: 35.2271, lng: -80.8431 },
        zoom: 14,
        styles: DARK_MAP_STYLE,
        disableDefaultUI: true,
        zoomControl: false,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      infoWindowRef.current = new window.google.maps.InfoWindow();
    }
  }, [mapReady]);

  useEffect(() => {
    api("/api/venues").then(data => {
      if (Array.isArray(data)) { setVenues(data); setLoading(false); }
    });
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || venues.length === 0) return;
    // Clear old markers
    markersRef.current.forEach(m => m.setMap(null));
    circlesRef.current.forEach(c => c.setMap(null));
    markersRef.current = [];
    circlesRef.current = [];

    const filtered = filter === "All" ? venues : venues.filter(v => v.category === filter);

    filtered.forEach(venue => {
      const busy = venue.busy_score || 0;
      const color = getBusyColor(busy);
      const pos = { lat: parseFloat(venue.latitude), lng: parseFloat(venue.longitude) };

      // Heatmap glow circle
      const circle = new window.google.maps.Circle({
        map: mapInstanceRef.current,
        center: pos,
        radius: busy > 80 ? 160 : busy > 60 ? 120 : 80,
        fillColor: color,
        fillOpacity: 0.18,
        strokeColor: color,
        strokeOpacity: 0.35,
        strokeWeight: 1,
      });
      circlesRef.current.push(circle);

      // Custom marker
      const marker = new window.google.maps.Marker({
        position: pos,
        map: mapInstanceRef.current,
        title: venue.name,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: busy > 80 ? 10 : busy > 60 ? 8 : 6,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 1.5,
        },
      });

      marker.addListener("click", () => {
        setActiveVenue(venue);
        mapInstanceRef.current.panTo(pos);
      });

      markersRef.current.push(marker);
    });
  }, [venues, filter, mapReady]);

  async function reportCrowd(venueId, level) {
    await api(`/api/venues/${venueId}/crowd`, { method: "POST", body: JSON.stringify({ busy_level: level }) }, token);
    const data = await api("/api/venues");
    if (Array.isArray(data)) setVenues(data);
    setActiveVenue(null);
  }

  const filters = ["All", "Bar", "Club", "Venue"];
  const filtered = filter === "All" ? venues : venues.filter(v => v.category === filter);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      {/* Filter bar */}
      <div style={{ position: "absolute", top: 12, left: 12, zIndex: 10, display: "flex", gap: 8 }}>
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 600,
            background: filter === f ? "#ff3366" : "rgba(10,10,16,0.85)",
            color: filter === f ? "#fff" : "rgba(255,255,255,0.7)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            backdropFilter: "blur(8px)",
            transition: "all 0.2s"
          }}>{f}</button>
        ))}
      </div>

      {/* Live badge */}
      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 10, display: "flex", alignItems: "center", gap: 6, background: "rgba(10,10,16,0.85)", borderRadius: 20, padding: "5px 10px", border: "1px solid rgba(255,51,102,0.3)", backdropFilter: "blur(8px)" }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ff3366", boxShadow: "0 0 8px #ff3366", opacity: pulse ? 1 : 0.3, transition: "opacity 0.5s" }} />
        <span style={{ fontSize: 10, color: "#ff3366", fontWeight: 700, letterSpacing: 1 }}>LIVE</span>
      </div>

      {/* Google Map */}
      <div ref={mapRef} style={{ flex: 1 }} />

      {/* Loading overlay */}
      {loading && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,10,16,0.7)", zIndex: 5 }}>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Loading venues...</div>
        </div>
      )}

      {/* Venue list strip */}
      <div style={{ position: "absolute", bottom: activeVenue ? 200 : 8, left: 0, right: 0, zIndex: 10, display: "flex", gap: 8, padding: "0 12px", overflowX: "auto" }}>
        {filtered.slice(0, 6).map(v => (
          <div key={v.id} onClick={() => { setActiveVenue(v); mapInstanceRef.current?.panTo({ lat: parseFloat(v.latitude), lng: parseFloat(v.longitude) }); }}
            style={{ flexShrink: 0, background: "rgba(10,10,16,0.9)", borderRadius: 12, padding: "8px 12px", border: `1px solid ${getBusyColor(v.busy_score || 0)}44`, cursor: "pointer", backdropFilter: "blur(8px)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>{v.name}</div>
            <div style={{ fontSize: 10, color: getBusyColor(v.busy_score || 0), fontWeight: 700, marginTop: 2 }}>{getBusyLabel(v.busy_score || 0)} · {v.busy_score || 0}%</div>
          </div>
        ))}
      </div>

      {/* Selected venue card */}
      {activeVenue && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20, background: "#1a1a2e", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: "20px 20px 28px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <button onClick={() => setActiveVenue(null)} style={{ position: "absolute", top: 16, right: 20, background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)", fontSize: 18 }}>✕</button>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 2 }}>{activeVenue.name}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>{activeVenue.neighborhood} · {activeVenue.address}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: getBusyColor(activeVenue.busy_score || 0), boxShadow: `0 0 8px ${getBusyColor(activeVenue.busy_score || 0)}` }} />
            <span style={{ fontSize: 13, color: getBusyColor(activeVenue.busy_score || 0), fontWeight: 700 }}>{getBusyLabel(activeVenue.busy_score || 0)} · {activeVenue.busy_score || 0}% capacity</span>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>How busy is it right now?</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[["😴", 20, "Quiet"], ["🙂", 50, "Busy"], ["🔥", 85, "Packed"]].map(([emoji, level, label]) => (
              <button key={level} onClick={() => reportCrowd(activeVenue.id, level)} style={{ flex: 1, padding: "10px 8px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", cursor: "pointer", fontFamily: "inherit" }}>
                <div style={{ fontSize: 22 }}>{emoji}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{label}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StoriesScreen({ token, user }) {
  const [stories, setStories] = useState([]);
  const [active, setActive] = useState(null);
  const [liked, setLiked] = useState({});
  const [loading, setLoading] = useState(true);
  const [newCaption, setNewCaption] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    api("/api/stories", {}, token).then(data => { if (Array.isArray(data)) setStories(data); setLoading(false); });
  }, []);

  async function postStory() {
    if (!newCaption.trim()) return;
    setPosting(true);
    const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    await api("/api/stories", { method: "POST", body: JSON.stringify({ caption: newCaption, emoji, visibility: "public" }) }, token);
    const data = await api("/api/stories", {}, token);
    if (Array.isArray(data)) setStories(data);
    setNewCaption(""); setPosting(false);
  }

  async function toggleLike(storyId) {
    await api(`/api/stories/${storyId}/like`, { method: "POST" }, token);
    setLiked(l => ({ ...l, [storyId]: !l[storyId] }));
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "12px 16px 8px", display: "flex", gap: 8 }}>
        <input value={newCaption} onChange={e => setNewCaption(e.target.value)} placeholder="What's happening at a venue?" style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "8px 14px", color: "#fff", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
        <button onClick={postStory} disabled={posting} style={{ padding: "8px 14px", borderRadius: 20, border: "none", background: "#8b5cf6", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Post</button>
      </div>
      {active && (
        <div onClick={() => setActive(null)} style={{ position: "absolute", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "85%", borderRadius: 24, overflow: "hidden", background: "#0d1117", border: `1px solid ${COLORS[0]}44` }}>
            <div style={{ height: 180, background: `linear-gradient(135deg, ${COLORS[0]}44, #0d1117)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <div style={{ fontSize: 52 }}>{active.emoji || "📸"}</div>
              <div style={{ fontSize: 14, color: "#fff", fontWeight: 700 }}>{active.venues?.name || "A venue"}</div>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 15, color: "#fff", fontWeight: 600, marginBottom: 8 }}>"{active.caption}"</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{active.is_anonymous ? "Anonymous" : active.users?.display_name || "User"} · {timeAgo(active.created_at)}</div>
                <button onClick={() => toggleLike(active.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18 }}>
                  {liked[active.id] ? "❤️" : "🤍"} <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{active.like_count + (liked[active.id] ? 1 : 0)}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {loading && <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13, padding: 20 }}>Loading stories...</div>}
        {!loading && stories.length === 0 && <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13, padding: 20 }}>No stories yet — be the first to post!</div>}
        {stories.map((s, i) => (
          <div key={s.id} onClick={() => setActive(s)} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: 14, border: `1px solid ${COLORS[i % COLORS.length]}22`, cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: `linear-gradient(135deg, ${COLORS[i % COLORS.length]}88, ${COLORS[i % COLORS.length]}44)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{s.emoji || "📸"}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{s.venues?.name || "A venue"}</span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{timeAgo(s.created_at)}</span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>"{s.caption}"</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>by {s.is_anonymous ? "Anonymous" : s.users?.display_name || "User"} · 🤍 {s.like_count}</div>
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
    api("/api/deals").then(data => { if (Array.isArray(data)) setDeals(data); setLoading(false); });
  }, []);

  async function redeem(deal) {
    if (redeemed[deal.id]) return;
    const data = await api(`/api/deals/${deal.id}/redeem`, { method: "POST" }, token);
    if (data.success) setRedeemed(r => ({ ...r, [deal.id]: true }));
    else if (data.error) alert(data.error);
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 16px" }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600, marginBottom: 12, letterSpacing: 1, textTransform: "uppercase" }}>Tonight's Deals · {deals.length} available</div>
      {loading && <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13, padding: 20 }}>Loading deals...</div>}
      {!loading && deals.length === 0 && <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13, padding: 20 }}>No deals tonight — check back later!</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {deals.map((d, i) => {
          const color = COLORS[i % COLORS.length];
          const isRedeemed = redeemed[d.id];
          return (
            <div key={d.id} style={{ background: isRedeemed ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.05)", borderRadius: 18, padding: 16, border: `1px solid ${isRedeemed ? "rgba(255,255,255,0.06)" : color + "33"}`, opacity: isRedeemed ? 0.5 : 1, transition: "all 0.3s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}` }} />
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>{d.venues?.name}</span>
                    {d.is_premium_only && <span style={{ fontSize: 9, color: "#f59e0b", background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 6, padding: "2px 6px", fontWeight: 700 }}>✦ PREMIUM</span>}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{d.title}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{d.detail}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Expires</div>
                  <div style={{ fontSize: 12, color, fontWeight: 700 }}>{new Date(d.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>💾 {d.save_count} saved</div>
                <button onClick={() => redeem(d)} style={{ padding: "8px 20px", borderRadius: 12, border: "none", cursor: d.is_premium_only ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12, background: isRedeemed ? "rgba(255,255,255,0.08)" : d.is_premium_only ? "rgba(245,158,11,0.2)" : color, color: isRedeemed ? "rgba(255,255,255,0.4)" : d.is_premium_only ? "#f59e0b" : "#fff" }}>
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

  useEffect(() => {
    api("/api/venues", {}, token).then(data => {
      if (Array.isArray(data)) {
        const mine = data.filter(v => v.owner_id === user?.id);
        setVenues(mine);
        if (mine.length > 0) loadDash(mine[0].id);
        else setLoading(false);
      }
    });
  }, []);

  async function loadDash(venueId) {
    setLoading(true); setSelected(venueId);
    const data = await api(`/api/dashboard/${venueId}`, {}, token);
    if (!data.error) setDash(data);
    setLoading(false);
  }

  async function postDeal() {
    if (!newDeal.title || !newDeal.expires_at) return alert("Title and expiry time required.");
    setPosting(true);
    await api("/api/deals", { method: "POST", body: JSON.stringify({ venue_id: selected, ...newDeal }) }, token);
    setNewDeal({ title: "", detail: "", expires_at: "" });
    loadDash(selected);
    setPosting(false);
  }

  async function toggleBoost(enable) {
    await api(`/api/dashboard/${selected}/boost`, { method: "PATCH", body: JSON.stringify({ enable }) }, token);
    loadDash(selected);
  }

  if (venues.length === 0 && !loading) return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, gap: 12 }}>
      <div style={{ fontSize: 40 }}>🏪</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>No venues yet</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>Register your bar to access the business dashboard</div>
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 16px" }}>
      {loading && <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13, padding: 40 }}>Loading dashboard...</div>}
      {!loading && dash && (
        <>
          <div style={{ background: "linear-gradient(135deg, rgba(255,51,102,0.15), rgba(139,92,246,0.1))", borderRadius: 18, padding: 16, marginBottom: 12, border: "1px solid rgba(255,51,102,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>Business Dashboard</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{dash.venue?.name}</div>
              </div>
              <div style={{ background: "rgba(255,51,102,0.2)", border: "1px solid rgba(255,51,102,0.4)", borderRadius: 12, padding: "6px 12px", fontSize: 13, color: "#ff3366", fontWeight: 700 }}>Live 🔴</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            {[{ label: "Visitors Today", value: dash.today?.visitor_count || 0, color: "#ff3366" }, { label: "Redemptions", value: dash.today?.deal_redemptions || 0, color: "#f59e0b" }, { label: "Live Score", value: `${dash.crowd?.busy_score || 0}%`, color: "#10b981" }].map(stat => (
              <div key={stat.label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "12px 10px", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 2, lineHeight: 1.3 }}>{stat.label}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: 14, marginBottom: 12, border: "1px solid rgba(245,158,11,0.2)" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Post a Deal</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input value={newDeal.title} onChange={e => setNewDeal(d => ({ ...d, title: e.target.value }))} placeholder="e.g. $5 Margaritas" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 12px", color: "#fff", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
              <input value={newDeal.detail} onChange={e => setNewDeal(d => ({ ...d, detail: e.target.value }))} placeholder="Details (e.g. Well drinks only)" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 12px", color: "#fff", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
              <input value={newDeal.expires_at} onChange={e => setNewDeal(d => ({ ...d, expires_at: e.target.value }))} type="datetime-local" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 12px", color: "#fff", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
              <button onClick={postDeal} disabled={posting} style={{ padding: "10px", borderRadius: 10, border: "none", background: "#f59e0b", color: "#000", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{posting ? "Posting..." : "Post Deal 🎟"}</button>
            </div>
          </div>
          {dash.active_deals?.length > 0 && (
            <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: 14, marginBottom: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Active Deals</div>
              {dash.active_deals.map(d => (
                <div key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>{d.title}</div>
                  <div style={{ fontSize: 11, color: "#10b981" }}>🎟 {d.redemption_count} redeemed</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: 14, border: `1px solid ${dash.venue?.heatmap_boost ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.06)"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Heatmap Boost</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Highlighted on map · $149/mo</div>
              </div>
              <div onClick={() => toggleBoost(!dash.venue?.heatmap_boost)} style={{ width: 44, height: 24, borderRadius: 12, background: dash.venue?.heatmap_boost ? "#8b5cf6" : "rgba(255,255,255,0.1)", position: "relative", cursor: "pointer", transition: "all 0.3s" }}>
                <div style={{ position: "absolute", top: 2, left: dash.venue?.heatmap_boost ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "all 0.3s" }} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function RoamApp() {
  const [tab, setTab] = useState("map");
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  const tabs = [
    { id: "map", icon: "🗺️", label: "Map" },
    { id: "stories", icon: "📸", label: "Stories" },
    { id: "deals", icon: "🎟", label: "Deals" },
    { id: "dashboard", icon: "📊", label: "Business" },
  ];

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#060608", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap'); *{box-sizing:border-box;margin:0;padding:0} ::-webkit-scrollbar{display:none} body{background:#060608}`}</style>
      <div style={{ width: 375, height: 780, background: "#0a0a10", borderRadius: 48, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 40px 120px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08)", position: "relative" }}>
        <div style={{ padding: "14px 24px 6px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>9:41</span>
          <div style={{ width: 120, height: 28, background: "#000", borderRadius: 20, position: "absolute", left: "50%", transform: "translateX(-50%)", top: 8 }} />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>●●● ▲ ⬛</span>
        </div>
        {user && (
          <div style={{ padding: "6px 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #ff3366, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🌍</div>
              <span style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: -0.5 }}>roam</span>
            </div>
            <button onClick={() => { setUser(null); setToken(null); }} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "5px 12px", color: "rgba(255,255,255,0.5)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
              {user.username} · logout
            </button>
          </div>
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {!user ? <AuthScreen onAuth={(u, t) => { setUser(u); setToken(t); }} /> : (
            <>
              {tab === "map" && <HeatmapScreen token={token} />}
              {tab === "stories" && <StoriesScreen token={token} user={user} />}
              {tab === "deals" && <DealsScreen token={token} user={user} />}
              {tab === "dashboard" && <DashboardScreen token={token} user={user} />}
            </>
          )}
        </div>
        {user && (
          <div style={{ padding: "10px 8px 24px", display: "flex", background: "rgba(10,10,16,0.95)", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
                <div style={{ fontSize: 20, filter: tab === t.id ? "none" : "grayscale(1) opacity(0.4)" }}>{t.icon}</div>
                <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "inherit", color: tab === t.id ? "#ff3366" : "rgba(255,255,255,0.3)", letterSpacing: 0.5, textTransform: "uppercase" }}>{t.label}</span>
                {tab === t.id && <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#ff3366" }} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
