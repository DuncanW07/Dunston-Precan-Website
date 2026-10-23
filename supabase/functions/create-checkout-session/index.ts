// POST { items: [{ model, band, qty }] } -> { url } (Stripe-hosted checkout)
// Prices come from the database and Stripe, never from the browser.
import Stripe from 'npm:stripe@17.4.0';
import { createClient } from 'npm:@supabase/supabase-js@2.46.1';
import { cors, json, originAllowed, readJson } from '../_shared/http.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-11-20.acacia', httpClient: Stripe.createFetchHttpClient() });
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const SITE_URL = Deno.env.get('SITE_URL') ?? '';
const SALES_OPEN = Deno.env.get('SALES_OPEN') === 'true';
const ID = /^[a-z]{2,32}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST' || !originAllowed(req)) return json(req, { error: 'not allowed' }, 403);
  if (!SALES_OPEN) return json(req, { error: 'orders are not open yet' }, 403);

  let body: { items?: unknown };
  try { body = (await readJson(req)) as typeof body; } catch { return json(req, { error: 'bad request' }, 400); }
  const raw = Array.isArray(body.items) ? body.items : [];
  if (raw.length < 1 || raw.length > 10) return json(req, { error: 'invalid cart' }, 400);

  const wanted = new Map<string, number>();
  for (const it of raw as Array<Record<string, unknown>>) {
    const model = String(it?.model ?? ''), band = String(it?.band ?? ''), qty = Number(it?.qty);
    if (!ID.test(model) || !['bracelet', 'leather'].includes(band) || !Number.isInteger(qty) || qty < 1 || qty > 5) {
      return json(req, { error: 'invalid cart' }, 400);
    }
    const key = `${model}-${band}`;
    wanted.set(key, Math.min((wanted.get(key) ?? 0) + qty, 5));
  }

  const { data: variants, error } = await supabase
    .from('product_variants')
    .select('id, stripe_price_id, stock, active, products!inner(price_cents, currency, active)')
    .in('id', [...wanted.keys()]);
  if (error) return json(req, { error: 'server error' }, 500);
  if (!variants || variants.length !== wanted.size) return json(req, { error: 'unknown item' }, 400);
  for (const v of variants) {
    // deno-lint-ignore no-explicit-any
    const p = (v as any).products;
    if (!v.active || !p?.active || !v.stripe_price_id || v.stock < (wanted.get(v.id) ?? 0)) {
      return json(req, { error: 'item unavailable' }, 409);
    }
  }

  const { data: order, error: oerr } = await supabase.from('orders').insert({ status: 'pending' }).select('id').single();
  if (oerr || !order) return json(req, { error: 'server error' }, 500);
  await supabase.from('order_items').insert(variants.map((v) => ({
    order_id: order.id, variant_id: v.id, quantity: wanted.get(v.id)!,
    // deno-lint-ignore no-explicit-any
    unit_amount: (v as any).products.price_cents,
  })));

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: variants.map((v) => ({ price: v.stripe_price_id!, quantity: wanted.get(v.id)! })),
    shipping_address_collection: { allowed_countries: ['US'] },
    billing_address_collection: 'auto',
    client_reference_id: order.id,
    metadata: { order_id: order.id },
    success_url: `${SITE_URL}/?order=success`,
    cancel_url: `${SITE_URL}/?order=canceled`,
  }, { idempotencyKey: `order-${order.id}` });

  await supabase.from('orders').update({ stripe_session_id: session.id }).eq('id', order.id);
  return json(req, { url: session.url });
});
