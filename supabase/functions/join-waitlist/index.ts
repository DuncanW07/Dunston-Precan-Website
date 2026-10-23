// POST { email, token, source } -> 200 { ok: true }
// Verifies Cloudflare Turnstile on the server, then stores the email with the
// service role. Responds the same whether or not the email already existed.
import { createClient } from 'npm:@supabase/supabase-js@2.46.1';
import { cors, json, originAllowed, readJson } from '../_shared/http.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET_KEY') ?? '';
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST' || !originAllowed(req)) return json(req, { error: 'not allowed' }, 403);

  let body: { email?: unknown; token?: unknown; source?: unknown };
  try { body = (await readJson(req)) as typeof body; } catch { return json(req, { error: 'bad request' }, 400); }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const token = typeof body.token === 'string' ? body.token : '';
  const source = typeof body.source === 'string' ? body.source.slice(0, 32) : 'site';
  if (!EMAIL.test(email) || email.length > 254) return json(req, { error: 'invalid email' }, 400);

  if (!TURNSTILE_SECRET) return json(req, { error: 'not configured' }, 503);
  const form = new FormData();
  form.append('secret', TURNSTILE_SECRET);
  form.append('response', token);
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (ip) form.append('remoteip', ip);
  const check = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const verdict = await check.json().catch(() => ({ success: false }));
  if (!verdict.success) return json(req, { error: 'verification failed' }, 403);

  const { error } = await supabase.from('waitlist').upsert({ email, source }, { onConflict: 'email', ignoreDuplicates: true });
  if (error) { console.error('waitlist insert failed', error.code); return json(req, { error: 'server error' }, 500); }
  return json(req, { ok: true });
});
