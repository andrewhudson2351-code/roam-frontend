import { useEffect, useState, useRef } from 'react';

const API = import.meta.env.VITE_API_URL;

export default function BillingSuccess({ getToken }) {
  const params = new URLSearchParams(window.location.search);
  const venueId = params.get('venue_id');

  const [status, setStatus] = useState('loading');
  const [tier, setTier] = useState(null);
  const pollRef = useRef(null);
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (!venueId) { setStatus('error'); return; }

    async function pollStatus() {
      try {
        const token = await getToken();
        const res = await fetch(`${API}/api/stripe/subscription-status/${venueId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await res.json();

        if (data.tier && data.tier !== 'free') {
          setTier(data.tier);
          setStatus('confirmed');
          clearInterval(pollRef.current);
        } else {
          attemptsRef.current++;
          if (attemptsRef.current >= 15) {
            setStatus('confirmed');
            setTier('pro');
            clearInterval(pollRef.current);
          }
        }
      } catch {
        attemptsRef.current++;
        if (attemptsRef.current >= 15) {
          setStatus('error');
          clearInterval(pollRef.current);
        }
      }
    }

    pollRef.current = setInterval(pollStatus, 1000);
    pollStatus();
    return () => clearInterval(pollRef.current);
  }, [venueId]);

  useEffect(() => {
    if (status === 'confirmed') {
      const t = setTimeout(() => window.location.href = '/dashboard', 4000);
      return () => clearTimeout(t);
    }
  }, [status]);

  const tierColors = { pro: '#E8A020', premium: '#FF5C35' };
  const tierColor = tierColors[tier] ?? '#E8A020';
  const tierLabel = tier === 'premium' ? 'Roam Premium' : 'Roam Pro';

  return (
    <div style={page}>
      <div style={grid} />
      <div style={card}>
        {status === 'loading' && (
          <>
            <div style={spinner} />
            <h1 style={heading}>Confirming your subscription…</h1>
            <p style={sub}>Hang tight, syncing with Stripe.</p>
          </>
        )}
        {status === 'confirmed' && (
          <>
            <div style={checkCircle}>✓</div>
            <h1 style={heading}>You're on <span style={{ color: tierColor }}>{tierLabel}</span></h1>
            <p style={sub}>Redirecting to your dashboard in a moment…</p>
            <button style={{ ...btn, background: tierColor }} onClick={() => window.location.href = '/dashboard'}>
              Go to dashboard
            </button>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={{ ...checkCircle, background: '#2A0D0D', border: '2px solid #5C1A1A', color: '#FF6B6B' }}>!</div>
            <h1 style={heading}>Something went wrong</h1>
            <p style={sub}>Check your email for a receipt. Your dashboard will update within a few minutes.</p>
            <button style={{ ...btn, background: '#333' }} onClick={() => window.location.href = '/dashboard'}>
              Back to dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const page = { minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", sans-serif', padding: 24, position: 'relative' };
const grid = { position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(232,160,32,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(232,160,32,0.04) 1px, transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none' };
const card = { position: 'relative', zIndex: 1, background: '#111', border: '1px solid #222', borderRadius: 20, padding: '56px 48px', maxWidth: 440, width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 };
const heading = { fontSize: 26, fontWeight: 700, color: '#F0EDE8', margin: 0, letterSpacing: '-0.02em' };
const sub = { fontSize: 15, color: '#888', margin: 0, lineHeight: 1.6 };
const checkCircle = { width: 72, height: 72, borderRadius: '50%', background: '#0D2010', border: '2px solid #2A6B35', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4CAF7D', fontSize: 32, marginBottom: 8 };
const spinner = { width: 48, height: 48, border: '3px solid #222', borderTop: '3px solid #E8A020', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 8 };
const btn = { marginTop: 8, padding: '12px 28px', borderRadius: 8, border: 'none', fontSize: 15, fontWeight: 600, color: '#0A0A0A', cursor: 'pointer' };
