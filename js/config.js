// Public, front-end-safe settings. Never put a Supabase service_role key,
// a Stripe secret key or a webhook secret in this file: everything here ships
// to every visitor's browser.
export const CONFIG = {
  // Supabase project URL and the public anon key (safe to expose; Row Level
  // Security decides what the anon role can do). Leave empty for preview mode.
  SUPABASE_URL: 'https://mgaqrmuwndkhadlsxjgq.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nYXFybXV3bmRraGFkbHN4amdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3NzU2NTQsImV4cCI6MjEwODM1MTY1NH0.qP8rOsv9PGa_9khFkoeiQTI85fRKJlXPCvE5MGw0t-8',

  // Cloudflare Turnstile site key (public). Leave empty to hide the widget.
  TURNSTILE_SITE_KEY: '',

  // Orders stay closed until the founders say otherwise. While false, the cart
  // works but checkout shows the pre-launch notice instead of taking payment.
  SALES_OPEN: false,

  // Only redirect checkout to Stripe-hosted pages.
  CHECKOUT_ORIGIN: 'https://checkout.stripe.com',
};

export const supabaseReady = () => Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
