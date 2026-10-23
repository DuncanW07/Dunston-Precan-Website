// Public, front-end-safe settings. Never put a Supabase service_role key,
// a Stripe secret key or a webhook secret in this file: everything here ships
// to every visitor's browser.
export const CONFIG = {
  // Supabase project URL and the public anon key (safe to expose; Row Level
  // Security decides what the anon role can do). Leave empty for preview mode.
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  // Cloudflare Turnstile site key (public). Leave empty to hide the widget.
  TURNSTILE_SITE_KEY: '',

  // Orders stay closed until the founders say otherwise. While false, the cart
  // works but checkout shows the pre-launch notice instead of taking payment.
  SALES_OPEN: false,

  // Only redirect checkout to Stripe-hosted pages.
  CHECKOUT_ORIGIN: 'https://checkout.stripe.com',
};

export const supabaseReady = () => Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
