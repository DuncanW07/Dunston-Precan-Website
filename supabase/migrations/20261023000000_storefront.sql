-- Dunston Precan storefront schema.
-- Every table has Row Level Security enabled and forced. The anon and
-- authenticated roles start with no privileges; each grant below is the
-- minimum the site needs. Edge functions use the service_role key, which
-- bypasses RLS, and run only on the server.

create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------- catalogue
create table public.products (
  id          text primary key check (id ~ '^[a-z]{2,32}$'),
  name        text not null check (length(name) <= 64),
  color       text not null check (length(color) <= 64),
  moment      text check (length(moment) <= 200),
  price_cents integer not null check (price_cents > 0),
  currency    text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.product_variants (
  id              text primary key check (id ~ '^[a-z]{2,32}-(bracelet|leather)$'),
  product_id      text not null references public.products (id) on delete cascade,
  band            text not null check (band in ('bracelet', 'leather')),
  band_label      text not null check (length(band_label) <= 80),
  stripe_price_id text check (stripe_price_id is null or stripe_price_id ~ '^price_[A-Za-z0-9]+$'),
  stock           integer not null default 0 check (stock >= 0),
  active          boolean not null default true,
  unique (product_id, band)
);
create index product_variants_product_id_idx on public.product_variants (product_id);

-- ---------------------------------------------------------------- waitlist
-- Written only by the join-waitlist edge function after a Turnstile check.
create table public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       extensions.citext not null unique
              check (length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  source      text not null default 'site' check (length(source) <= 32),
  consent_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- customers & orders
create table public.customers (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      extensions.citext not null,
  full_name  text check (length(full_name) <= 120),
  created_at timestamptz not null default now()
);

create table public.orders (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users (id) on delete set null,
  email                 extensions.citext,
  status                text not null default 'pending'
                        check (status in ('pending', 'paid', 'fulfilled', 'refunded', 'canceled')),
  stripe_session_id     text unique,
  stripe_payment_intent text unique,
  amount_total          integer check (amount_total >= 0),
  currency              text not null default 'usd',
  shipping              jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index orders_user_id_idx on public.orders (user_id);

create table public.order_items (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  variant_id  text not null references public.product_variants (id),
  quantity    integer not null check (quantity between 1 and 5),
  unit_amount integer not null check (unit_amount >= 0)
);
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_variant_id_idx on public.order_items (variant_id);

-- Stripe webhook idempotency: each event id is processed once.
create table public.stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- row level security
alter table public.products         enable row level security;
alter table public.product_variants enable row level security;
alter table public.waitlist         enable row level security;
alter table public.customers        enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.stripe_events    enable row level security;

alter table public.products         force row level security;
alter table public.product_variants force row level security;
alter table public.waitlist         force row level security;
alter table public.customers        force row level security;
alter table public.orders           force row level security;
alter table public.order_items      force row level security;
alter table public.stripe_events    force row level security;

-- Start from nothing, then grant the minimum.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

grant select on public.products, public.product_variants to anon, authenticated;
grant select on public.customers, public.orders, public.order_items to authenticated;
grant update (full_name) on public.customers to authenticated;

-- Catalogue: anyone can read active items. No client writes.
create policy "Active products are public"
  on public.products for select to anon, authenticated
  using (active);

create policy "Active variants are public"
  on public.product_variants for select to anon, authenticated
  using (active);

-- Customers see and edit only their own profile.
create policy "Customers read their own profile"
  on public.customers for select to authenticated
  using ((select auth.uid()) = id);

create policy "Customers update their own name"
  on public.customers for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Customers see only their own orders. Orders are created and updated by
-- edge functions (service_role), never by the browser.
create policy "Customers read their own orders"
  on public.orders for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Customers read their own order items"
  on public.order_items for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and o.user_id = (select auth.uid())
  ));

-- waitlist and stripe_events: deliberately no policies and no grants.
-- Visitors can never read the waitlist; only the server writes to it.

-- ---------------------------------------------------------------- catalogue seed
insert into public.products (id, name, color, moment, price_cents) values
  ('discipline', 'Discipline', 'British Racing Green & silver', 'For the early alarms, and the habits that build something.', 35000),
  ('courage',    'Courage',    'Burgundy & gunmetal',   'For the leap: the move, the launch, the first big risk.', 35000),
  ('patience',   'Patience',   'Navy & rose gold',      'For the long game, and the work that takes years to show.', 35000),
  ('honor',      'Honor',      'Black & rose gold',     'For keeping your word when it would be easier not to.', 35000),
  ('ambition',   'Ambition',   'Royal purple & black',  'For the goal that scares you a little, and the plan to reach it.', 35000),
  ('resilience', 'Resilience', 'Desert tan & gunmetal', 'For getting back up after the setback that should have stopped you.', 35000),
  ('loyalty',    'Loyalty',    'Cream & espresso',      'For the people who were there before anything worked.', 35000),
  ('leadership', 'Leadership', 'Black & silver',        'For the day people start looking to you to lead.', 35000),
  ('humility',   'Humility',   'White & silver',        'For staying grounded no matter how far you get.', 35000),
  ('gratitude',  'Gratitude',  'Ice blue & steel',      'For remembering how far you''ve come.', 35000);

insert into public.product_variants (id, product_id, band, band_label) values
  ('discipline-bracelet', 'discipline', 'bracelet', 'British Racing Green steel bracelet'),
  ('discipline-leather',  'discipline', 'leather',  'Brown grained leather strap'),
  ('courage-bracelet',    'courage',    'bracelet', 'Gunmetal steel bracelet'),
  ('patience-leather',    'patience',   'leather',  'Navy croc-embossed leather strap'),
  ('honor-bracelet',      'honor',      'bracelet', 'Two-tone black and rose gold bracelet'),
  ('ambition-bracelet',   'ambition',   'bracelet', 'Black steel bracelet'),
  ('resilience-bracelet', 'resilience', 'bracelet', 'Gunmetal steel bracelet'),
  ('loyalty-bracelet',    'loyalty',    'bracelet', 'Stainless steel bracelet'),
  ('loyalty-leather',     'loyalty',    'leather',  'Espresso suede strap'),
  ('leadership-bracelet', 'leadership', 'bracelet', 'Stainless steel bracelet'),
  ('leadership-leather',  'leadership', 'leather',  'Black grained leather strap'),
  ('humility-bracelet',   'humility',   'bracelet', 'Stainless steel bracelet'),
  ('humility-leather',    'humility',   'leather',  'White grained leather strap'),
  ('gratitude-bracelet',  'gratitude',  'bracelet', 'Stainless steel bracelet'),
  ('gratitude-leather',   'gratitude',  'leather',  'White grained leather strap');
