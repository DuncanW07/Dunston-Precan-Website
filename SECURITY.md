# Security

## Database (Supabase)

`supabase/migrations/20261023000000_storefront.sql`

- Row Level Security is **enabled and forced** on every table.
- All privileges are revoked from `anon` and `authenticated` first, including default privileges for future tables and functions; only the grants listed below are added back.

| Table | anon | authenticated | Writes |
| --- | --- | --- | --- |
| products, product_variants | read active rows | read active rows | server only |
| waitlist | none | none | `join-waitlist` function only |
| customers | none | read/update own row (name only) | server |
| orders, order_items | none | read own orders | server only |
| stripe_events | none | none | webhook only |

Visitors can join the waitlist but can never read it. Nobody can write prices, orders or order status from the browser.

## Keys

- Only the Supabase **anon** key and Turnstile **site** key go in `js/config.js`.
- The service_role key, Stripe secret key, webhook secret and Turnstile secret live only in Supabase function secrets. `.env` is git-ignored; `.vercelignore` keeps `supabase/`, `scripts/` and raw assets out of the deploy.

## Edge functions

- **join-waitlist**: origin allow-list, 4 KB body limit, email validation, server-side Cloudflare Turnstile verification, same response whether or not the email existed (no enumeration).
- **create-checkout-session**: refuses unless `SALES_OPEN=true`; accepts only ids and quantities (1–5 per line, max 10 lines); prices, availability and stock come from the database and Stripe; creates a pending order; Stripe-hosted checkout with an idempotency key.
- **stripe-webhook**: verifies the Stripe signature before reading anything, processes each event id once, updates order status.
- The front end only redirects to URLs on `https://checkout.stripe.com/`.

## Browser

Headers in `vercel.json` (mirrored by the local dev server):

- Content-Security-Policy: self-hosted scripts, styles and fonts only; `'wasm-unsafe-eval'` for the mesh decoder (no JavaScript eval); `blob:` in connect-src so the 3D loader can read textures embedded in model files; Turnstile and Stripe are the only third parties; `frame-ancestors 'none'`; `object-src 'none'`.
- HSTS (2 years, preload), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive Permissions-Policy, COOP/CORP same-origin.
- No inline scripts, no third-party fonts, no analytics, no tracking pixels, no cookies. The cart lives in `localStorage` on the visitor's device and is validated against the catalogue when read.

## Before launch

- [ ] Run the Supabase security advisor and confirm zero RLS warnings.
- [ ] Set `ALLOWED_ORIGINS` to the production domain(s) only.
- [ ] Stripe: restricted key if possible, webhook endpoint subscribed to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `charge.refunded`.
- [ ] Enable Supabase Auth email confirmation before adding customer accounts.
- [ ] If analytics or pixels are ever added, add a consent banner and update `privacy.html` first.
