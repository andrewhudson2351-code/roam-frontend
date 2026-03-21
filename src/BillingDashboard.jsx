import React, { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL;

export default function BillingDashboard({ user, getToken, venue }) {
  const [sub, setSub]             = useState(null);
  const [loading, setLoading]     = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError]         = useState(null);

  useEffect(() => {
    if (!venue?.id) { setLoading(false); return; }
    loadStatus();
  }, [venue]);

  async function loadStatus() {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/stripe/subscription-status/${venue.id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      setSub(data);
    } catch {
      setError('Failed to load billing info.');
    } finally {
      setLoading(false);
    }
  }

  async function openPortal() {
    setPortalLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/stripe/create-portal-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ venueId: venue.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to open portal');
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setPortalLoading(false);
    }
  }

  const tierColors = { free: '#6B6B6B', pro: '#E8A020', premium: '#FF5C35' };
  const tierColor  = tierColors[sub?.tier ?? 'free'];
  const tierLabel  = { free: 'Free', pro: 'Roam Pro', premium: 'Roam Premium' }[sub?.tier ?? 'free'];

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  return (
    <div style={s.page}>
      <div style={s.grid} />
      <div style={s.container}>
        <h1 style={s.heading}>Billing</h1>
        <p style={s.sub}>Manage your Roam venue subscription.</p>

        {!venue && (
          <div style={s.card}>
            <p style={{ color: '#888', fontSize: 14, margin: 0 }}>
              No venue selected. Please access billing from your venue dashboard.
            </p>
          </div>
        )}

        {error && (
          <div style={s.errorBanner}>
            {error}
            <button style={s.errorClose} onClick={() => setError(null)}>x</button>
          </div>
        )}

        {venue && loading && (
          <div style={s.card}>
            <p style={{ color: '#888', fontSize: 14, margin: 0 }}>Loading billing info...</p>
          </div>
        )}

        {venue && !loading && sub && (
          <>
            <div style={{ ...s.card, borderColor: tierColor + '44' }}>
              <div style={s.planRow}>
                <div>
                  <p style={s.label}>Current plan</p>
                  <p style={{ ...s.tierName, color: tierColor }}>{tierLabel}</p>
                </div>
                <div style={{ ...s.tierBadge, background: tierColor + '22', color: tierColor }}>
                  {sub.status === 'active' ? 'Active' : sub.status === 'past_due' ? 'Past due' : 'Inactive'}
                </div>
              </div>

              {sub.tier !== 'free' && (
                <div style={s.infoGrid}>
                  <div style={s.infoBlock}>
                    <p style={s.label}>{sub.cancelAtPeriodEnd ? 'Cancels on' : 'Renews'}</p>
                    <p style={s.value}>{formatDate(sub.currentPeriodEnd)}</p>
                  </div>
                  {sub.heatmapBoost && (
                    <div style={s.infoBlock}>
                      <p style={s.label}>Heatmap boost</p>
                      <p style={{ ...s.value, color: '#FF5C35' }}>Active</p>
                    </div>
                  )}
                </div>
              )}

              {sub.cancelAtPeriodEnd && (
                <div style={s.warning}>
                  Your subscription will cancel at end of billing period. Reactivate anytime from the billing portal.
                </div>
              )}

              {sub.status === 'past_due' && (
                <div style={{ ...s.warning, background: '#2A0D0D', borderColor: '#5C1A1A', color: '#FF6B6B' }}>
                  Your last payment failed. Update your payment method to keep your plan active.
                </div>
              )}
            </div>

            <div style={s.actionsCard}>
              {sub.tier === 'free' ? (
                <div style={s.actionRow}>
                  <div>
                    <p style={s.actionTitle}>Upgrade your plan</p>
                    <p style={s.actionSub}>Get analytics, deals, and heatmap boost.</p>
                  </div>
                  <button style={{ ...s.btn, background: '#E8A020', color: '#0A0A0A' }}
                    onClick={() => window.location.href = '/pricing'}>
                    See plans
                  </button>
                </div>
              ) : (
                <div style={s.actionRow}>
                  <div>
                    <p style={s.actionTitle}>Manage billing</p>
                    <p style={s.actionSub}>Update payment method, cancel, or change plan.</p>
                  </div>
                  <button style={{ ...s.btn, background: '#222', color: '#F0EDE8', opacity: portalLoading ? 0.7 : 1 }}
                    onClick={openPortal} disabled={portalLoading}>
                    {portalLoading ? 'Opening...' : 'Manage'}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {venue && !loading && !sub && !error && (
          <div style={s.card}>
            <p style={{ color: '#888', fontSize: 14, margin: 0 }}>No billing information found for this venue.</p>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page:       { minHeight: '100vh', background: '#0A0A0A', fontFamily: '"DM Sans", sans-serif', padding: '0 24px 80px', position: 'relative' },
  grid:       { position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(232,160,32,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(232,160,32,0.04) 1px, transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none' },
  container:  { position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', paddingTop: 72 },
  heading:    { fontSize: 32, fontWeight: 700, color: '#F0EDE8', margin: '0 0 8px', letterSpacing: '-0.02em' },
  sub:        { fontSize: 15, color: '#888', margin: '0 0 40px' },
  errorBanner:{ position: 'relative', background: '#2A0D0D', border: '1px solid #5C1A1A', borderRadius: 8, padding: '12px 40px 12px 16px', color: '#FF6B6B', fontSize: 14, marginBottom: 24 },
  errorClose: { position: 'absolute', top: 10, right: 12, background: 'none', border: 'none', color: '#FF6B6B', fontSize: 18, cursor: 'pointer' },
  card:       { background: '#111', border: '1px solid #222', borderRadius: 16, padding: 24, marginBottom: 16 },
  planRow:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  label:      { fontSize: 11, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' },
  tierName:   { fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' },
  tierBadge:  { fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 99 },
  infoGrid:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  infoBlock:  { background: '#0A0A0A', borderRadius: 10, padding: '12px 16px' },
  value:      { fontSize: 14, fontWeight: 500, color: '#F0EDE8', margin: 0 },
  warning:    { marginTop: 16, background: '#1A1200', border: '1px solid #3D2E00', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#E8A020', lineHeight: 1.5 },
  actionsCard:{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: 24 },
  actionRow:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  actionTitle:{ fontSize: 15, fontWeight: 600, color: '#F0EDE8', margin: '0 0 4px' },
  actionSub:  { fontSize: 13, color: '#888', margin: 0 },
  btn:        { flexShrink: 0, padding: '10px 20px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', letterSpacing: '-0.01em' },
};
