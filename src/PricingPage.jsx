import { useState } from 'react';

const TIERS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    tagline: 'Get on the map',
    color: '#6B6B6B',
    features: [
      'Basic venue listing',
      'Appear on the Roam heatmap',
      'Claim your venue profile',
      'Customer check-ins',
    ],
    disabled: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 49,
    tagline: 'Grow your crowd',
    color: '#E8A020',
    popular: true,
    features: [
      'Everything in Free',
      '30-day analytics dashboard',
      'Post up to 3 active deals',
      'Weekly crowd insights',
      'Customer engagement stats',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 149,
    tagline: 'Own the night',
    color: '#FF5C35',
    features: [
      'Everything in Pro',
      '90-day analytics dashboard',
      'Unlimited deal postings',
      'Heatmap boost — surface first',
      'Priority placement in search',
      'Dedicated support',
    ],
  },
];

const API = import.meta.env.VITE_API_URL;

export default function PricingPage({ user, getToken, venue }) {
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);
  const currentTier = venue?.tier ?? 'free';

  async function handleUpgrade(tier) {
    if (!user) return setError('Please log in first.');
    if (!venue) return setError('No venue selected.');
    if (tier === 'free') return;

    setLoading(tier);
    setError(null);

    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ venueId: venue.id, tier }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to start checkout');
      window.location.href = data.url;

    } catch (err) {
      setError(err.message);
      setLoading(null);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.grid} aria-hidden="true" />

      <header style={styles.header}>
        <p style={styles.eyebrow}>Venue owner plans</p>
        <h1 style={styles.headline}>
          When in Roam,<br />
          <span style={{ color: '#E8A020' }}>do as the Romans do.</span>
        </h1>
        <p style={styles.subheadline}>Put your venue on the map. Then own it.</p>
      </header>

      {error && (
        <div style={styles.errorBanner}>
          {error}
          <button style={styles.errorClose} onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div style={styles.cardGrid}>
        {TIERS.map((tier) => {
          const isCurrent = currentTier === tier.id;
          const isLoading = loading === tier.id;
          const isDisabled = tier.disabled || isCurrent || isLoading;

          return (
            <div key={tier.id} style={{
              ...styles.card,
              ...(tier.popular ? styles.cardPopular : {}),
              ...(isCurrent ? styles.cardCurrent : {}),
            }}>
              {tier.popular && <div style={styles.badge}>Most popular</div>}
              {isCurrent && <div style={{ ...styles.badge, background: '#2A2A2A', color: '#888' }}>Current plan</div>}

              <div style={styles.cardHeader}>
                <div style={{ ...styles.dot, background: tier.color }} />
                <div>
                  <h2 style={styles.tierName}>{tier.name}</h2>
                  <p style={{ ...styles.tierTagline, color: tier.color }}>{tier.tagline}</p>
                </div>
              </div>

              <div style={styles.priceRow}>
                <span style={styles.priceDollar}>$</span>
                <span style={styles.priceAmount}>{tier.price}</span>
                {tier.price > 0 && <span style={styles.pricePer}>/mo</span>}
              </div>

              <div style={{ height: 1, background: tier.color + '33', margin: '0 0 24px' }} />

              <ul style={styles.featureList}>
                {tier.features.map((f) => (
                  <li key={f} style={styles.featureItem}>
                    <span style={{ color: tier.color, fontWeight: 700, flexShrink: 0 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                style={{
                  ...styles.ctaButton,
                  background: isDisabled ? 'transparent' : tier.color,
                  color: isDisabled ? '#555' : '#0A0A0A',
                  border: isDisabled ? '1px solid #333' : 'none',
                  cursor: isDisabled ? 'default' : 'pointer',
                  opacity: isLoading ? 0.7 : 1,
                }}
                onClick={() => handleUpgrade(tier.id)}
                disabled={isDisabled}
              >
                {isLoading ? 'Redirecting…' : isCurrent ? 'Current plan' : `Upgrade to ${tier.name}`}
              </button>
            </div>
          );
        })}
      </div>

      <p style={styles.footerNote}>
        All payments processed securely by Stripe. Cancel anytime.
      </p>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: '#0A0A0A', color: '#F0EDE8', fontFamily: '"DM Sans", sans-serif', padding: '0 24px 80px', position: 'relative', overflow: 'hidden' },
  grid: { position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(232,160,32,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(232,160,32,0.04) 1px, transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none' },
  header: { position: 'relative', zIndex: 1, textAlign: 'center', paddingTop: 72, paddingBottom: 56 },
  eyebrow: { fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#E8A020', marginBottom: 20 },
  headline: { fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', margin: '0 0 16px' },
  subheadline: { fontSize: 18, color: '#888', margin: 0 },
  errorBanner: { position: 'relative', zIndex: 1, maxWidth: 480, margin: '0 auto 32px', background: '#2A0D0D', border: '1px solid #5C1A1A', borderRadius: 8, padding: '12px 40px 12px 16px', color: '#FF6B6B', fontSize: 14 },
  errorClose: { position: 'absolute', top: 10, right: 12, background: 'none', border: 'none', color: '#FF6B6B', fontSize: 18, cursor: 'pointer' },
  cardGrid: { position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, maxWidth: 960, margin: '0 auto' },
  card: { background: '#111', border: '1px solid #222', borderRadius: 16, padding: 32, display: 'flex', flexDirection: 'column', position: 'relative' },
  cardPopular: { border: '1px solid #E8A020', background: '#131008' },
  cardCurrent: { border: '1px solid #2A2A2A', opacity: 0.7 },
  badge: { p
