# Dunston Precan website

Scroll-driven storefront for the DP-41. Static HTML/CSS/JS with three.js, ready for Vercel, with a Supabase + Stripe back end prepared but switched off.

## Preview locally

```bash
node scripts/dev-server.mjs 5173
```

Then open http://localhost:5173. The server sends the same security headers as `vercel.json`, so CSP problems show up locally too. (Opening `index.html` straight from disk will not work: browsers block ES modules on `file://`.)

QA switches: `?nogl` shows the static fallback, `?debug` exposes `window.__dp` (scene, camera, `renderAt(p)`).

## The sequence

| Scroll | What happens |
| --- | --- |
| 0 | Golden-hour beach, racing-green script headline, the DP-41 flies forward from behind the name; a light sweep glints across the sapphire with star highlights on the bezel and crown |
| 4–21% | One full turn while two story cards appear |
| 19–30% | Background fades to the night beach, strap falls away, lume starts to glow |
| 28–52% | The case opens with a white burst (flash, shockwave ring, sparks), then the labeled exploded view of the Rev F CAD, then it reassembles |
| 50–61% | The watch settles at a three-quarter angle with the strap laid flat, then squares up |
| 60–71% | Camera drops onto the strap; it dissolves into an F1 track with white whoosh lines |
| 69–90% | The 3D coupe launches; halfway down the screen the camera drops in behind it with engine rumble. It brakes for Insight 01, goes flat out through the middle bend with speed lines, brakes for Insight 02, then pulls away |
| 87–100% | The Virtues open as a circle out of the spot where the car disappears |

Timings live in `update()` in `js/experience.js`. Reduced-motion users get cuts between four key states; devices without WebGL get a static page.

## Where things come from

- **3D watch**: `DP-41 CAD EXAMPLE/DP-41_assembly_updated.step` (Rev F, 72-flute bezel), tessellated per part and compressed to `assets/models/dp41.glb` (541 KB). Part labels and dimensions are from `DP 41 update drawings.pdf`.
- **Materials**: `js/scene/materials.js` follows `Watch_Colorway_Manufacturing_Specifications.pdf` (CMF Rev A): vertical-brushed dial (F01), mirror-polished case top, lugs, bezel and crown (F02), brushed flanks (F03), concentric-satin index ring and raised minute ring (F04), polished applied indices with ivory lume #EFE2C0 that glows green at night (F09), printed ticks (F10), chocolate calf strap #402A1F with #7B5A3B thread at a 3.0 mm pitch and 2.5 mm inset. Colors stay with the green-and-silver product photos.
- **Strap, track, lawn**: procedural geometry in `js/scene/strap.js` and `js/scene/track.js`.
- **Light effects**: `js/scene/effects.js` (glints, burst, speed lines).
- **3D car**: `assets/models/car.glb` (676 KB), made with Hunyuan3D v3 on Higgsfield from a GPT Image 2.5 studio render of the coupe, simplified to 50k triangles. If the file is removed, the race falls back to the top-down photo.
- **Headline script**: vectorized from the supplied logo image, `assets/brand/script-*.svg`.
- **Generated with Higgsfield (GPT Image 2.5)**: hero beach, night beach, collection beach, top-down car, leather/asphalt/grass textures, movement front and back. Full-size originals are in `assets/gen/` (not deployed).
- **Product cutouts**: background removed from the original storefront photos.
- **Product photos, names, colors, prices**: carried over from `dunston-co-website`.

## Hero video

`assets/video/hero-loop.mp4`: 8 s, 1080p, H.264, no audio, 13.4 MB. Generated with Seedance 1.5 Pro on Higgsfield, starting and ending on the hero still so it loops cleanly (Seedance 2.0 and 2.5 need a Pro or Ultimate plan, and this account reads as Starter). It was remuxed so the index sits at the front of the file and playback starts while it downloads. The untouched original is `assets/gen/hero-loop.mp4`.

How the page uses it (`js/main.js`, set by `data-video` on `.bg-hero` in `index.html`):

- It starts loading only after the 3D watch is ready, so it never delays the intro.
- Desktop only: phones, data saver and reduced-motion visitors keep the still image, and the file is never requested.
- It pauses once the beach is scrolled past and resumes at the top.

To swap the clip, replace the file and keep the name. To turn it off, empty `data-video`. A smaller encode (about 4 MB) would need ffmpeg, which isn't installed here.

## Supabase (live)

Project `dunston-precan` (ref `mgaqrmuwndkhadlsxjgq`, US East). Schema and row-level security applied, catalogue seeded, `join-waitlist` deployed. Still to do before signups work: create Cloudflare Turnstile keys, put the site key in `js/config.js` and set `TURNSTILE_SECRET_KEY` under Edge Functions > Secrets. `create-checkout-session` and `stripe-webhook` are not deployed until sales open.

## Going live (later)

1. Create the Supabase project and run `supabase/migrations/20261023000000_storefront.sql`.
2. Deploy functions: `supabase functions deploy join-waitlist create-checkout-session` and `supabase functions deploy stripe-webhook --no-verify-jwt`.
3. Set secrets from `.env.example` with `supabase secrets set --env-file .env`.
4. Put the public URL, anon key and Turnstile site key in `js/config.js`.
5. Create Stripe prices and fill `product_variants.stripe_price_id` and `stock`.
6. When the founders open orders: `SALES_OPEN=true` in both `js/config.js` and the function secrets.

See `SECURITY.md` for what each layer protects.

## Open items for the founders

- Launch price (site shows $350; handoff says confirm).
- First run size (handoff: site said 45–60, manufacturer minimum is 300). The site avoids a number for now.
- Contact email for the privacy policy (placeholder highlighted on `privacy.html`).
- Colors: Discipline is shown as "British Racing Green & silver" to match the product photos. The CMF sheet (CW04, bronze case) is used only as the reference for 3D materials and finishes.
- Terms of sale, Shipping & returns and Warranty pages exist as drafts. Highlighted values (return window, warranty length, governing state, contact email) need founder sign-off and a legal review.
