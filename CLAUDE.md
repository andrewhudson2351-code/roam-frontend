# CLAUDE.md — Roam Frontend

Orientation guide for future sessions (human or AI). This is the web + iOS client for Roam ("Roaman" on the App Store), a nightlife app. The backend lives at `C:\Users\andre\roam-backend` (Express/Supabase on Railway) and has its own CLAUDE.md.

## Tech stack

- **React 18 + Vite 5**, plain JSX, no TypeScript, no router library — routing is `window.location.pathname` string checks at the top of `RoamApp` (`src/App.jsx`). No tests, no linter.
- **Maps: Mapbox** (`react-map-gl` v8 + `mapbox-gl` v3) with a native heatmap layer. Google Maps was removed in June 2026 after the HeatmapLayer deprecation blank-screened production — **never suggest Google Maps APIs for this app.**
- **iOS: Capacitor 8** wrapper (`appId: app.roaman`, `webDir: dist`), iPhone-only (`TARGETED_DEVICE_FAMILY = 1`). Native-vs-web branches use `Capacitor.isNativePlatform()`.
- **Auth:** backend-issued JWT stored in `localStorage` (`roam_token`, `roam_user`). No Supabase client in the frontend — everything goes through the Express API.

## Layout

Almost everything lives in `src/App.jsx` (~1,300 lines): auth screens, map, friends, stories, deals, venue-owner dashboard, settings, and the `apiFetch` helper. Separate files only for billing: `PricingPage.jsx`, `BillingDashboard.jsx`, `BillingSuccess.jsx`, `BillingCancel.jsx`. `scripts/` has a sharp-based screenshot cropper for App Store submission.

## Key architectural decisions (July 2026)

1. **Friends feature** (`5cc2743`, `701dc20`, `a7513dc`): Friends screen (pending requests, add by username), friend location pins on the map with **20-second foreground polling**, and a "Share My Location" toggle in Settings. Turning sharing off deletes the user's `friend_locations` row server-side; the backend also enforces location staleness. Authorization lives on the server — the client only renders what the API returns.
2. **Story visibility** (`2e09c5c`): Public/Friends-Only toggle in the story composer (`visibility` field on POST /api/stories). Friends-only filtering is **enforced server-side**; the client toggle is UI only.
3. **Rate limiting awareness:** the backend allows 500 req/15 min per IP globally and 10/15 min per user on crowd reports. The 20s friend-polling interval was chosen with that budget in mind — don't add aggressive polling without checking the math (a poll every 20s ≈ 45 req/15 min per open feature).
4. **No Stripe UI on native iOS** (`a521e15`, App Store guideline 3.1.1): `PricingPage` renders a "visit roaman.app" notice instead of checkout when `Capacitor.isNativePlatform()`. Keep any new payment UI web-only.
5. **Billing pages wired through `OwnedVenueRoute`** (`a626013`): `/pricing` and `/billing` fetch the user's owned venue via `/api/venues/mine` and pass it down. This commit also fixed the earlier hook-order violation and `plan` vs `tier` column reads — those audit findings are **resolved**, don't re-chase them.
6. **`venues.plan` is the canonical plan field** (never `tier`) — matches the backend convention.

## Known open issues (from the July 2026 audit — not yet fixed)

- **`apiFetch` never checks `res.ok`** (`src/App.jsx` ~line 65) — it returns `res.json()` on any status, so 4xx/5xx error bodies flow into callers as if they were data.
- **Silent failures in several callers:** patterns like `.catch(() => null)`, `.catch(() => {})`, and `if (Array.isArray(data))` guards (stories, deals, friends loading) swallow errors — the user sees an empty list instead of an error state.
- **Two API-base conventions:** `App.jsx` **hardcodes** the Railway URL (`https://roam-backend-production.up.railway.app`), while the billing pages use `VITE_API_URL`. If `VITE_API_URL` is unset, billing fetches go to `undefined/api/...` and fail — while the rest of the app still works. Should be unified on the env var.
- **Billing pages duplicate raw `fetch` logic** instead of sharing `apiFetch` (though theirs does check `res.ok`).
- `App.jsx` is a monolith; fine for now, but expect merge pain if it grows.

Fixed already (don't re-report): rules-of-hooks violation in PricingPage/BillingDashboard and billing pages receiving `venue={null}` — both resolved in `a626013`.

## Environment variables

| Variable | Purpose |
|---|---|
| `VITE_MAPBOX_TOKEN` | Mapbox GL token (`pk.*`). Map is blank without it. Codemagic build **fails fast** if missing/malformed. |
| `VITE_API_URL` | Backend base URL — currently used **only by the billing pages** (see open issues). |

Vite env vars are baked in at build time — they must be set in the Vercel dashboard (web) and the `roaman-secrets` group in Codemagic (iOS), not just local `.env`. No `.env.example` exists.

## Deployment

- **Web:** Vercel auto-deploys on every push to `main`. `vercel.json` rewrites all paths to `index.html` (SPA routing). No staging environment.
- **iOS:** Codemagic (`codemagic.yaml`, workflow `ios-workflow`), **triggered manually** — not on push. Pipeline: `npm install` → verify `VITE_MAPBOX_TOKEN` → `vite build` → `npx cap sync ios` → fetch App Store Connect signing files → build IPA → **auto-submit to TestFlight**.
- **iOS build number** lives in the Xcode project and is bumped manually per submission (currently 6 as of early July 2026) — bump it before triggering a build or App Store Connect rejects the upload.

## Working conventions

- **Never `git add -A` or `git add .`** in the roam repos — stage files by name and check `git status` first.
- Backend schema/API questions: check `C:\Users\andre\roam-backend\CLAUDE.md` and verify Supabase schema via MCP rather than trusting old code.
