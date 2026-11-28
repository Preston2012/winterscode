/**
 * fully-in-view. S453, Preston 2026-11-28: "the website tiles, like grand,
 * start the animation, like the map foreground, before the tile fully comes
 * into view. It shouldn't start its animation before it comes fully in."
 *
 * A card's own art motion (CardMotion, PaintPour) starts only when the art
 * is wholly inside the band a reader can see, under the pinned header and
 * above the phone thumb bar, and the card around it has finished its own
 * entrance (Home's cards sweep and swing in on a scroll timeline). It stops
 * counting as in view once it has left the screen entirely.
 *
 * An observer keeps the list of art on or near screen; each scroll frame
 * checks only those few. Art taller than the band counts as in once it
 * fills the band.
 */
type Hooks = { onIn: (el: Element) => void; onOut?: (el: Element) => void };

const band = () => {
  let top = 0;
  let bottom = innerHeight;
  const header = document.querySelector<HTMLElement>('.topmark');
  if (header) {
    const r = header.getBoundingClientRect();
    if (r.bottom > 0 && r.top <= 0.5) top = r.bottom;
  }
  const bar = document.querySelector<HTMLElement>('[data-textbar]');
  if (bar && !bar.classList.contains('is-hidden') && getComputedStyle(bar).display !== 'none') {
    const r = bar.getBoundingClientRect();
    if (r.height > 0 && r.top < innerHeight) bottom = Math.min(bottom, r.top);
  }
  return { top, bottom };
};

/** No ancestor (up to its section) is still mid-entrance. */
const settled = (el: Element) => {
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    for (const a of n.getAnimations()) {
      const p = a.effect?.getComputedTiming().progress;
      if (a.playState === 'running' && p != null && p < 0.999) return false;
    }
    if (n.tagName === 'SECTION' || n.tagName === 'MAIN') break;
  }
  return true;
};

const fully = (el: Element) => {
  const r = el.getBoundingClientRect();
  const b = band();
  if (r.right <= 1 || r.left >= innerWidth - 1) return false;
  const inX = r.left >= -1 && r.right <= innerWidth + 1;
  const inY = r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
  const fills = r.top <= b.top + 1 && r.bottom >= b.bottom - 1;
  // Clipped sideways by its own scroller (the phone's swipe row) is not in.
  let clipped = false;
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const ox = getComputedStyle(n).overflowX;
    if (ox !== 'visible') {
      const s = n.getBoundingClientRect();
      if (r.left < s.left - 1 || r.right > s.right + 1) { clipped = true; break; }
    }
    if (n.tagName === 'SECTION') break;
  }
  return inX && !clipped && (inY || fills);
};

export function whenFullyInView(els: Iterable<Element>, hooks: Hooks): void {
  const near = new Set<Element>();
  const on = new Set<Element>();
  let ticking = false;
  const check = () => {
    ticking = false;
    near.forEach((el) => {
      if (on.has(el)) return;
      if (fully(el) && settled(el)) { on.add(el); hooks.onIn(el); }
    });
  };
  const schedule = () => { if (!ticking && near.size) { ticking = true; requestAnimationFrame(check); } };
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) near.add(en.target);
      else {
        near.delete(en.target);
        if (on.delete(en.target)) hooks.onOut?.(en.target);
      }
    }
    schedule();
  }, { threshold: [0, 0.5, 1] });
  for (const el of els) io.observe(el);
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  // A sideways swipe in a card row scrolls that row, not the page.
  document.addEventListener('scroll', schedule, { passive: true, capture: true });
}
