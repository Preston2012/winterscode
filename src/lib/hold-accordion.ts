/**
 * Hold the tapped question in place in an exclusive accordion.
 *
 * <details name="..."> sets let one item stay open: opening one closes the
 * open sibling. When the sibling that closes sits above the tapped one (the
 * tall "Why Winters Code?" answer is the usual case), everything below it
 * moves up by that answer's height and the reader lands near the bottom of
 * the page (Preston, 2026-11-23: up to 1,000px on a phone). The browser's
 * scroll anchoring does not catch it because its anchor is inside the answer
 * that closed.
 *
 * So the open happens here instead: note where the tapped summary sits, open
 * it (which closes the sibling), and scroll by however far the summary moved,
 * all in one task so no frame paints in between. Taps that close an item,
 * items outside a named set, and pages without JavaScript keep the browser's
 * own behavior. Keyboard Enter and Space reach here as clicks too.
 */
const FLAG = '__wcHoldAccordion';
const w = window as unknown as Record<string, boolean>;
if (!w[FLAG]) {
  w[FLAG] = true;
  document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const summary = (e.target as Element | null)?.closest?.('summary');
      const details = summary?.parentElement;
      if (!summary || !(details instanceof HTMLDetailsElement)) return;
      if (summary !== details.querySelector(':scope > summary')) return;
      if (!details.getAttribute('name') || details.open) return;
      // A link inside the summary keeps its own click.
      if ((e.target as Element).closest('a') && summary.contains((e.target as Element).closest('a'))) return;
      e.preventDefault();
      const before = summary.getBoundingClientRect().top;
      details.open = true;
      const shift = summary.getBoundingClientRect().top - before;
      if (Math.abs(shift) > 1) window.scrollBy({ top: shift, behavior: 'instant' as ScrollBehavior });
    },
    true,
  );
}

export {};
