export default function BillingCancel() {
  return (
    <div style={page}>
      <div style={grid} />
      <div style={card}>
        <div style={iconWrap}>←</div>
        <h1 style={heading}>No charge was made</h1>
        <p style={sub}>
          You exited before completing checkout. Your venue is still on the free plan — nothing has changed.
        </p>
        <div style={btnGroup}>
          <button style={primaryBtn} onClick={() => window.location.href = '/pricing'}>
            Back to pricing
          </button>
          <button style={ghostBtn} onClick={() => window.location.href = '/dashboard'}>
            Go to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

const page = { minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", sans-serif', padding: 24, position: 'relative' };
const grid = { position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(232,160,32,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(232,160,32,0.04) 1px, transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none' };
const card = { position: 'relative', zIndex: 1, background: '#111', border: '1px solid #222', borderRadius: 20, padding: '56px 48px', maxWidth: 420, width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 };
const iconWrap = { width: 64, height: 64, borderRadius: '50%', background: '#1A1A1A', border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 24, marginBottom: 8 };
const heading = { fontSize: 24, fontWeight: 700, color: '#F0EDE8', margin: 0, letterSpacing: '-0.02em' };
const sub = { fontSize: 15, color: '#888', margin: 0, lineHeight: 1.6 };
const btnGroup = { display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 8 };
const primaryBtn = { padding: '13px 24px', borderRadius: 8, border: 'none', background: '#E8A020', color: '#0A0A0A', fontSize: 15, fontWeight: 600, cursor: 'pointer' };
const ghostBtn = { padding: '13px 24px', borderRadius: 8, border: '1px solid #333', background: 'transparent', color: '#888', fontSize: 15, fontWeight: 500, cursor: 'pointer' };
