import React, { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL;

export default function BillingDashboard({ user, getToken, venue }) {
  const [sub, setSub]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError]   = useState(null);

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
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  return (
    <div style={styles.page}>
      <div style={styles.grid} />

      <div style={styles.container}>
        <h1 style={styles.heading}>Billing</h1>
        <p style={styles.sub}>Manage your Roam venue subscription.</p>

        {error && (
          <div style={styles.errorBanner}>
            {error}
            <button style={styles.errorClose} onClick={() => setError(null)}>x</button>
          </div>
        )}

        {loading && (
          <div style={styles.card}>
            <p style={{ color: '#888', fontSize: 14 }}>Loading billing info...</p>
          </div>
        )}

        {!loading && sub && (
          <>
            {/* Current plan card */}
            <div style={{ ...styles.card, borderColor: tierColor + '44' }}>
              <div style={styles.planRow}>
                <div>
                  <p style={styles.label}>Current plan</p>
                  <p style={{ ...styles.tierName, color: tierColor }}>{tierLabel}</p>
                </div>
                <div style={{ ...styles.tierBadge, background: tierColor + '22', color: tierColor }}>
                  {sub.status === 'active' ? 'Active' : sub.status === 'past_due' ? 'Past due' : 'Inactive'}
                </div>
              </div>

              {sub.tier !== 'free' && (
                <div style={styles.infoGrid}>
                  <div style={styles.infoBlock}>
                    <p style={styles.label}>Renews</p>
                    <p style={styles.value}>{sub.cancelAtPeriodEnd ? 'Cancels on' : ''} {formatDate(sub.currentPeriodEnd)}</p>
                  </div>
                  {sub.heatmapBoost && (
                    <div style={styles.infoBlock}>
                      <p style={styles.label}>Heatmap boost</p>
                      <p style={{ ...styles.value, color: '#FF5C35' }}>Active 🔥</p>
                    </div>
                  )}
                </div>
              )}

              {sub.cancelAtPeriodEnd && (
                <div style={styles.cancelWarning}>
                  Your subscription will cancel at the end of the billing period. You can reactivate anytime from the billing portal.
                </div>
              )}

              {sub.status === 'past_due' && (
                <div style={{ ...styles.cancelWarning, background: '#2A0D0D', borderColor: '#5C1A1A', color: '#FF6B6B' }}>
                  Your last payment failed. Please update your payment method to keep your plan active.
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={styles.actionsCard}>
              {sub.tier === 'free' ? (
                <div style={styles.actionRow}>
                  <div>
                    <p style={styles.actionTitle}>Upgrade your plan</p>
                    <p style={styles.actionSub}>Get analytics, deals, and heatmap boost.</p>
                  </div>
                  <button
                    style={{ ...styles.btn, background: '#E8A020', color: '#0A0A0A' }}
                    onClick={() => window.location.href = '/pricing'}
                  >
                    See plans
                  </button>
                </div>
              ) : (
                <div style={styles.actionRow}>
                  <div>
                    <p style={styles.actionTitle}>Manage billing</p>
                    <p style={styles.actionSub}>Update payment method, cancel, or change plan.</p>
                  </div>
                  <button
                    style={{ ...styles.btn, background: '#222', color: '#F0EDE8', opacity: portalLoading ? 0.7 : 1 }}
                    onClick={openPortal}
                    disabled={portalLoading}
                  >
                    {portalLoading ? 'Opening...' : 'Manage'}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {!loading && !sub && !error && (
          <div style={styles.card}>
            <p style={{ color: '#888', fontSize: 14 }}>No billing information found for this venue.</p>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#0A0A0A', fontFamily: '"DM Sans", sans-serif', padding: '0 24px 80px', position: 'relative' },
  grid: { position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(232,160,32,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(232,160,32,0.04) 1px, transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none' },
  container: { positi
