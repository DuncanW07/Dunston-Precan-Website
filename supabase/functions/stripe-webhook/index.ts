// Stripe -> Supabase. Deploy with --no-verify-jwt: Stripe authenticates with
// its signature header, which is verified here before anything is trusted.
import Stripe from 'npm:stripe@17.4.0';
import { createClient } from 'npm:@supabase/supabase-js@2.46.1';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-11-20.acacia', httpClient: Stripe.createFetchHttpClient() });
const crypto = Stripe.createSubtleCryptoProvider();
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('not allowed', { status: 405 });
  const sig = req.headers.get('stripe-signature');
  if (!sig || !SECRET) return new Response('bad signature', { status: 400 });

  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, sig, SECRET, undefined, crypto);
  } catch {
    return new Response('bad signature', { status: 400 });
  }

  // process each event once
  const { error: dup } = await supabase.from('stripe_events').insert({ id: event.id, type: event.type });
  if (dup?.code === '23505') return new Response('ok', { status: 200 }); // already handled
  if (dup) return new Response('retry', { status: 500 });

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.payment_status === 'paid') {
      await supabase.from('orders').update({
        status: 'paid',
        email: s.customer_details?.email ?? null,
        amount_total: s.amount_total,
        currency: s.currency ?? 'usd',
        stripe_payment_intent: typeof s.payment_intent === 'string' ? s.payment_intent : null,
        shipping: s.shipping_details ?? null,
      }).eq('stripe_session_id', s.id);
    }
  } else if (event.type === 'checkout.session.expired') {
    const s = event.data.object as Stripe.Checkout.Session;
    await supabase.from('orders').update({ status: 'canceled' }).eq('stripe_session_id', s.id).eq('status', 'pending');
  } else if (event.type === 'charge.refunded') {
    const c = event.data.object as Stripe.Charge;
    if (typeof c.payment_intent === 'string') {
      await supabase.from('orders').update({ status: 'refunded' }).eq('stripe_payment_intent', c.payment_intent);
    }
  }
  return new Response('ok', { status: 200 });
});
