import { initStore } from './store.js';
import { startExperience } from './experience.js';

const $ = (s) => document.querySelector(s);
const root = document.documentElement;
const loader = $('.loader');
const bar = $('.bar');
const topnav = $('.topnav');
const stage = $('#stage');

initStore();

// Looping hero video (data-video on .bg-hero). Desktop only, and skipped for
// reduced motion and data saver; the still image stays underneath either way.
// It starts loading after the 3D watch, so it never delays the intro.
const heroBg = $('.bg-hero');
let heroVideo = null;
function startHeroVideo() {
  if (heroVideo || !heroBg?.dataset.video) return;
  if (matchMedia('(prefers-reduced-motion: reduce), (max-width: 760px)').matches || navigator.connection?.saveData) return;
  const v = document.createElement('video');
  Object.assign(v, { muted: true, loop: true, playsInline: true, autoplay: true, preload: 'auto' });
  v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
  v.addEventListener('canplay', () => v.classList.add('is-ready'), { once: true });
  v.addEventListener('error', () => { v.remove(); heroVideo = null; }, { once: true });
  v.src = heroBg.dataset.video;
  heroBg.append(v);
  heroVideo = v;
  onScroll();
}

let exp = null;
const stageRange = () => ({ top: stage.offsetTop, len: stage.offsetHeight - innerHeight });

// Navigation: in-stage destinations are scroll positions, the rest are sections.
const STOPS = { dp41: 0.405 / 0.96, virtues: 1, top: 0 }; // raw scroll fractions (race is compressed)
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-go]');
  if (!a) return;
  const go = a.dataset.go;
  e.preventDefault();
  if (go in STOPS) {
    const r = stageRange();
    scrollTo({ top: r.top + STOPS[go] * r.len, behavior: 'auto' });
  } else document.getElementById(go)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

function onScroll() {
  const r = stageRange();
  const p = (scrollY - r.top) / r.len;
  bar.classList.toggle('is-shown', p > 0.915 || root.classList.contains('no-gl') && scrollY > innerHeight * 0.6);
  topnav.classList.toggle('is-hidden', scrollY > 40);
  // the beach is only on screen until the night fade; don't decode video behind it
  if (heroVideo) {
    if (p < 0.3) { if (heroVideo.paused) heroVideo.play().catch(() => {}); } else if (!heroVideo.paused) heroVideo.pause();
  }
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();

const progress = $('.loader-bar span');
const forceStatic = new URLSearchParams(location.search).has('nogl');
(forceStatic ? Promise.resolve({ ok: false }) : startExperience({
  onProgress: (f) => { if (progress) progress.style.transform = `scaleX(${f})`; },
  onReady: () => {
    loader.classList.add('is-done'); root.classList.add('is-ready');
    setTimeout(() => loader.remove(), 900);
    setTimeout(startHeroVideo, 1200);
  },
})).then((x) => {
  exp = x;
  if (!x.ok) fallback();
}).catch((err) => {
  console.error(err);
  fallback();
});

function fallback() {
  root.classList.add('no-gl', 'is-ready');
  loader?.classList.add('is-done');
  setTimeout(() => loader?.remove(), 900);
  startHeroVideo();
  onScroll();
}
