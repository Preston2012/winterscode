/**
 * in-view. S453 home motion (Preston 2026-11-27: "almost all of their
 * sections are animated... each section feels impactful and different").
 *
 * The time-based half of Home's motion. Scroll-driven moves live in CSS
 * (animation-timeline: view()) and need no script; the ones that play once,
 * on arrival, need to know when an element arrives. This marks them.
 *
 *   data-inview          the element to watch. It gets data-armed at once and
 *                        the class is-in when it is on screen.
 *   data-inview="0.4"    the visible fraction that counts as arrived.
 *   data-count="13"      a number inside a watched element that counts up
 *                        from zero on arrival. Its text in the HTML is the
 *                        final value, so without JavaScript, with reduced
 *                        motion, or before arrival the real number shows.
 *
 * ARMED, NOT HIDDEN. CSS hides a pre-arrival state only under
 * [data-armed]:not(.is-in), and data-armed is set here, by the same code that
 * will release it. If this never runs, nothing is ever hidden. Reduced motion
 * never arms anything.
 *
 * No animation runs past 1000ms (design doctrine, cross-section rules).
 */
const FLAG = '__wcInView';
const w = window as unknown as Record<string, boolean>;

const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Count a [data-count] element from zero to its value, keeping any prefix and suffix. */
export function countUp(el: HTMLElement, ms = 900): void {
  const to = Number(el.dataset.count);
  if (!Number.isFinite(to)) return;
  const text = el.textContent ?? '';
  const m = text.match(/^(\D*)([\d,]+)(.*)$/s);
  if (!m) return;
  const pre = m[1];
  const post = m[3];
  const comma = m[2].includes(',');
  const fmt = (n: number) => (comma ? n.toLocaleString('en-US') : String(n));
  if (still) { el.textContent = pre + fmt(to) + post; return; }
  const t0 = performance.now();
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / ms);
    el.textContent = pre + fmt(Math.round(to * ease(t))) + post;
    if (t < 1) requestAnimationFrame(step);
  };
  el.textContent = pre + fmt(0) + post;
  requestAnimationFrame(step);
}

function arrive(el: HTMLElement): void {
  el.classList.add('is-in');
  el.querySelectorAll<HTMLElement>('[data-count]').forEach((c) => countUp(c));
  el.dispatchEvent(new CustomEvent('wc:in'));
}

if (!w[FLAG] && !still && 'IntersectionObserver' in window) {
  w[FLAG] = true;
  const byThreshold = new Map<number, HTMLElement[]>();
  document.querySelectorAll<HTMLElement>('[data-inview]').forEach((el) => {
    const th = Number(el.dataset.inview) || 0.35;
    el.dataset.armed = '';
    const list = byThreshold.get(th) ?? [];
    list.push(el);
    byThreshold.set(th, list);
  });
  // A watched element already on screen at load arrives on the first callback.
  byThreshold.forEach((list, th) => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        arrive(e.target as HTMLElement);
      });
    }, { threshold: th });
    list.forEach((el) => io.observe(el));
  });
}
