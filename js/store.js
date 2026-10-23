import { CONFIG, supabaseReady } from './config.js';
import { MODELS, FEATURED, VIRTUES, PRICE, byId, bandsFor, defaultBand, photo, photoAlt, money } from './products.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const CART_KEY = 'dp_cart_v1';
const MAX_QTY = 5;

// ---------- cart (kept in this browser only)
let cart = [];
try {
  const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  if (Array.isArray(raw)) cart = raw.filter((l) => byId(l.id) && bandsFor(byId(l.id)).some((b) => b.id === l.band) && Number.isInteger(l.qty) && l.qty > 0).map((l) => ({ id: l.id, band: l.band, qty: Math.min(l.qty, MAX_QTY) }));
} catch (e) { cart = []; }
const save = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* storage blocked */ } };
const count = () => cart.reduce((a, l) => a + l.qty, 0);

function renderCount() {
  const n = count();
  document.querySelectorAll('[data-cart-count]').forEach((c) => { c.textContent = n; c.hidden = n === 0; });
  document.querySelectorAll('[data-cart-open]').forEach((b) => b.setAttribute('aria-label', `Open cart, ${n} item${n === 1 ? '' : 's'}`));
}

function addToCart(id, band) {
  const line = cart.find((l) => l.id === id && l.band === band);
  if (line) line.qty = Math.min(line.qty + 1, MAX_QTY); else cart.push({ id, band, qty: 1 });
  save(); renderCount();
}

const drawer = $('#drawer'), scrim = $('#scrim');
let lastFocus = null;
function openCart() {
  lastFocus = document.activeElement;
  drawer.hidden = false; scrim.hidden = false;
  requestAnimationFrame(() => { drawer.classList.add('is-open'); scrim.classList.add('is-open'); });
  $('#checkoutNote').hidden = true;
  renderCart();
  $('#closeCart').focus();
  document.body.classList.add('lock');
}
function closeCart() {
  drawer.classList.remove('is-open'); scrim.classList.remove('is-open');
  setTimeout(() => { drawer.hidden = true; if (modal.hidden) scrim.hidden = true; }, 260);
  document.body.classList.remove('lock');
  lastFocus?.focus?.();
}

function renderCart() {
  const box = $('#lines');
  box.replaceChildren();
  if (!cart.length) box.append(el('p', 'empty', 'Your cart is empty.'));
  cart.forEach((l, i) => {
    const m = byId(l.id);
    const row = el('div', 'line');
    const thumb = el('div', 'thumb');
    const img = el('img'); img.src = photo(m, 'front', l.band); img.alt = photoAlt(m, 'front', l.band); img.loading = 'lazy';
    thumb.append(img);
    const info = el('div');
    info.append(el('div', 'line-name', m.name), el('div', 'line-sm', `${m.color} · ${l.band === 'leather' ? 'Leather strap' : 'Steel bracelet'}`));
    const qty = el('div', 'qty');
    const minus = el('button', null, '−'); minus.setAttribute('aria-label', `Remove one ${m.name}`);
    const plus = el('button', null, '+'); plus.setAttribute('aria-label', `Add one ${m.name}`);
    plus.disabled = l.qty >= MAX_QTY;
    minus.addEventListener('click', () => { l.qty--; if (l.qty <= 0) cart.splice(i, 1); save(); renderCount(); renderCart(); });
    plus.addEventListener('click', () => { l.qty = Math.min(l.qty + 1, MAX_QTY); save(); renderCount(); renderCart(); });
    qty.append(minus, el('span', null, String(l.qty)), plus);
    info.append(qty);
    row.append(thumb, info, el('div', 'line-price', money(PRICE * l.qty)));
    box.append(row);
  });
  $('#subtotal').textContent = money(cart.reduce((a, l) => a + l.qty * PRICE, 0));
  $('#checkout').disabled = !cart.length;
}

async function checkout() {
  const note = $('#checkoutNote');
  if (!CONFIG.SALES_OPEN || !supabaseReady()) {
    note.hidden = false;
    note.replaceChildren(document.createTextNode('Orders open with our first drop. Nothing has been charged. '));
    const a = el('a', null, 'Get notified'); a.href = '#waitlist';
    a.addEventListener('click', () => closeCart());
    note.append(a, document.createTextNode('.'));
    return;
  }
  const btn = $('#checkout');
  btn.disabled = true; btn.textContent = 'Opening secure checkout…';
  try {
    // Prices are looked up server-side from the database; the client only sends ids.
    const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ items: cart.map((l) => ({ model: l.id, band: l.band, qty: l.qty })) }),
    });
    const data = await res.json();
    if (!res.ok || typeof data.url !== 'string' || !data.url.startsWith(CONFIG.CHECKOUT_ORIGIN + '/')) throw new Error('checkout');
    location.assign(data.url);
  } catch (e) {
    note.hidden = false;
    note.textContent = 'Checkout is unavailable right now. Nothing has been charged. Please try again shortly.';
    btn.disabled = false; btn.textContent = 'Checkout';
  }
}

// ---------- product view
const modal = $('#product');
let current = null, band = 'leather', view = 'front';

function setModel(m, b) {
  current = m;
  band = b && bandsFor(m).some((x) => x.id === b) ? b : defaultBand(m);
  $('#pName').textContent = m.name;
  $('#pPrice').textContent = money(PRICE);
  $('#pMoment').textContent = m.moment;
  $('#pVirtueHead').textContent = `Why ${m.name} matters`;
  $('#pVirtue').textContent = VIRTUES[m.id];
  $('#added').hidden = true;
  renderProduct();
}

function renderProduct() {
  const m = current;
  const main = $('#pImg');
  main.replaceChildren();
  const img = el('img'); img.src = photo(m, view, band); img.alt = photoAlt(m, view, band); img.decoding = 'async';
  main.append(img);

  const views = $('#views'); views.replaceChildren();
  ['front', 'angle', 'side'].forEach((v) => {
    const b = el('button', 'view'); b.type = 'button';
    b.setAttribute('aria-pressed', String(v === view)); b.setAttribute('aria-label', `Show ${v} view`);
    const t = el('img'); t.src = photo(m, v, band); t.alt = ''; t.loading = 'lazy';
    b.append(t);
    b.addEventListener('click', () => { view = v; renderProduct(); });
    views.append(b);
  });

  $('#pColorName').textContent = `${m.color}`;
  const sw = $('#swatches');
  if (!sw.childElementCount) {
    MODELS.forEach((c) => {
      const b = el('button', 'sw'); b.type = 'button'; b.dataset.id = c.id;
      b.setAttribute('aria-label', `${c.name}, ${c.color}`);
      const i = el('img'); i.src = `assets/products/${c.id}-sw.jpg`; i.alt = '';
      const name = el('span', 'sw-name', c.name);
      b.append(i, name);
      b.addEventListener('click', () => setModel(c, band));
      sw.append(b);
    });
  }
  sw.querySelectorAll('.sw').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === m.id)));

  const bands = bandsFor(m);
  const bl = $('#bands'); bl.replaceChildren();
  bands.forEach((o) => {
    const b = el('button', 'band'); b.type = 'button';
    b.setAttribute('aria-pressed', String(o.id === band)); b.setAttribute('aria-label', o.detail);
    const i = el('img'); i.src = `assets/products/${m.id}-band-${o.id}.jpg`; i.alt = '';
    const txt = el('span', 'band-txt');
    txt.append(el('span', 'band-name', o.label), el('span', 'band-detail', o.detail));
    b.append(i, txt);
    b.addEventListener('click', () => { band = o.id; $('#added').hidden = true; renderProduct(); });
    bl.append(b);
  });
  $('#pBandName').textContent = bands.find((o) => o.id === band).detail;
  $('#pStrapFeat').textContent = bands.find((o) => o.id === band).detail;
  try { history.replaceState(null, '', `#${m.id}`); } catch (e) { /* file:// */ }
}

function openProduct(id, b) {
  const m = byId(id);
  if (!m) return;
  lastFocus = document.activeElement;
  view = 'front';
  setModel(m, b);
  modal.hidden = false; scrim.hidden = false;
  requestAnimationFrame(() => { modal.classList.add('is-open'); scrim.classList.add('is-open'); });
  document.body.classList.add('lock');
  $('#closeProduct').focus();
}
function closeProduct() {
  modal.classList.remove('is-open'); scrim.classList.remove('is-open');
  setTimeout(() => { modal.hidden = true; if (drawer.hidden) scrim.hidden = true; }, 260);
  document.body.classList.remove('lock');
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* file:// */ }
  lastFocus?.focus?.();
}

// ---------- collection cards
function renderFeatured() {
  const row = $('#featured');
  FEATURED.forEach((f, i) => {
    const m = byId(f.id);
    const card = el('button', 'watch-card'); card.type = 'button';
    card.style.setProperty('--i', String(i));
    card.setAttribute('aria-label', `${m.name}, ${m.color}, ${money(PRICE)}. View colors and bands`);
    const fig = el('span', 'watch-fig');
    const img = el('img'); img.src = f.cutout; img.alt = ''; img.decoding = 'async';
    fig.append(img, el('span', 'watch-shadow'));
    const meta = el('span', 'watch-meta');
    meta.append(el('span', 'watch-name', m.name), el('span', 'watch-color', m.color), el('span', 'watch-price', money(PRICE)));
    card.append(fig, meta);
    card.addEventListener('click', () => openProduct(f.id, f.band));
    row.append(card);
  });
  const more = $('#moreVirtues');
  MODELS.filter((m) => !FEATURED.some((f) => f.id === m.id)).forEach((m) => {
    const b = el('button', 'chip'); b.type = 'button';
    const i = el('img'); i.src = `assets/products/${m.id}-sw.jpg`; i.alt = '';
    b.append(i, el('span', null, m.name));
    b.setAttribute('aria-label', `${m.name}, ${m.color}`);
    b.addEventListener('click', () => openProduct(m.id));
    more.append(b);
  });
}

// ---------- waitlist
function initWaitlist() {
  const form = $('#waitlistForm');
  if (!form) return;
  const msg = $('#waitlistMsg');
  if (CONFIG.TURNSTILE_SITE_KEY) {
    const box = $('#turnstile');
    box.dataset.sitekey = CONFIG.TURNSTILE_SITE_KEY;
    box.className = 'cf-turnstile';
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'; s.async = true; s.defer = true;
    document.head.append(s);
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = String(new FormData(form).get('email') || '').trim();
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(email)) { msg.textContent = 'Enter a valid email address.'; return; }
    if (!supabaseReady()) { msg.textContent = 'Preview mode: signups are not being stored yet.'; return; }
    const token = form.querySelector('[name="cf-turnstile-response"]')?.value || '';
    if (CONFIG.TURNSTILE_SITE_KEY && !token) { msg.textContent = 'Please complete the check above.'; return; }
    const btn = form.querySelector('button'); btn.disabled = true;
    try {
      const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/join-waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ email, token, source: 'site' }),
      });
      if (!res.ok) throw new Error('signup');
      form.reset();
      msg.textContent = "You're on the list. We'll only email you about launch updates.";
    } catch (err) {
      msg.textContent = 'Something went wrong. Please try again.';
    } finally { btn.disabled = false; }
  });
}

// ---------- wiring
export function initStore() {
  renderFeatured();
  renderCount();
  initWaitlist();
  document.querySelectorAll('[data-cart-open]').forEach((b) => b.addEventListener('click', openCart));
  $('#closeCart').addEventListener('click', closeCart);
  $('#closeProduct').addEventListener('click', closeProduct);
  scrim.addEventListener('click', () => { if (!drawer.hidden) closeCart(); if (!modal.hidden) closeProduct(); });
  $('#checkout').addEventListener('click', checkout);
  $('#addBtn').addEventListener('click', () => {
    addToCart(current.id, band);
    $('#added').hidden = false;
  });
  $('#addOpenCart').addEventListener('click', () => { closeProduct(); setTimeout(openCart, 280); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!drawer.hidden) closeCart(); else if (!modal.hidden) closeProduct();
  });
  // keep keyboard focus inside open dialogs
  document.addEventListener('focusin', (e) => {
    const open = !drawer.hidden ? drawer : !modal.hidden ? modal : null;
    if (open && !open.contains(e.target)) open.querySelector('button, a, input')?.focus();
  });
  const h = location.hash.slice(1);
  if (byId(h)) setTimeout(() => openProduct(h), 400);
}
