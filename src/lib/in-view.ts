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
 *   data-after="SEL"     not before the element SEL has finished its own
 *                        animation, so a move further along waits for the
 *                        one before it (reading order, Preston 2026-11-27).
 *                        Order by construction, not by two clocks.
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

/**
 * LANDED, NOT SCROLLED. A reader who opens the page partway down (a link to
 * #contact, a reload, the back button) asked to be there. A section already
 * on screen when the page opens that way shows finished: is-instant turns its
 * intro off (index.astro) and its numbers are already final in the HTML.
 * Everything below still plays as the reader scrolls on.
 */
const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
const landed = location.hash.length > 1 || nav?.type === 'reload' || nav?.type === 'back_forward';
let opening = landed;
// The opening lasts until the reader does something: the first touch, wheel,
// click or key. Until then every scroll is the browser putting them where
// the link or the reload asked (Chrome glides there, WebKit jumps in two
// steps and reports a beat later), so anything that arrives is landed on.
// Timing it instead raced WebKit (S453 audit).
const INPUTS = ['touchstart', 'wheel', 'pointerdown', 'keydown'];
const end = () => { opening = false; INPUTS.forEach((t) => removeEventListener(t, end, true)); };
const open = () => {
  opening = true;
  INPUTS.forEach((t) => addEventListener(t, end, { capture: true, passive: true }));
};
if (opening) open();
// A tap on a link to a section of this page (the header's Contact, say) is a
// landing too: the reader asked to be there. The tap's own pointerdown has
// already ended any opening, so the click starts a new one, which the
// reader's next touch or key ends.
addEventListener('click', (e) => {
  const a = (e.target as Element | null)?.closest?.('a[href*="#"]') as HTMLAnchorElement | null;
  if (!a || a.pathname !== location.pathname || a.origin !== location.origin || a.hash.length < 2) return;
  setTimeout(open, 0);
}, true);

function arrive(el: HTMLElement, instant: boolean): void {
  if (instant) {
    el.classList.add('is-instant', 'is-in');
    el.dispatchEvent(new CustomEvent('wc:in'));
    return;
  }
  el.classList.add('is-in');
  el.querySelectorAll<HTMLElement>('[data-count]').forEach((c) => countUp(c));
  el.dispatchEvent(new CustomEvent('wc:in'));
}

if (!w[FLAG] && !still && 'IntersectionObserver' in window) {
  w[FLAG] = true;
  const byThreshold = new Map<number, HTMLElement[]>();
  document.querySelectorAll<HTMLElement>('[data-inview]').forEach((el) => {
    const th = Number(el.dataset.inview) || 0.35;
    // Landed with it already on screen: never hide it, not even for a frame.
    if (landed) {
      const r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < innerHeight) { el.classList.add('is-in', 'is-instant'); return; }
    }
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
        const el = e.target as HTMLElement;
        const instant = opening;
        const dep = el.dataset.after ? document.querySelector<HTMLElement>(el.dataset.after) : null;
        const pending = dep?.getAnimations().filter((a) => a.playState === 'running' || a.pending) ?? [];
        if (!instant && pending.length) {
          Promise.all(pending.map((a) => a.finished.catch(() => undefined))).then(() => setTimeout(() => arrive(el, false), 120));
        } else arrive(el, instant);
      });
    }, { threshold: th });
    list.forEach((el) => io.observe(el));
  });
}
