/**
 * Scrolls an element into view inside its nearest scrolling container, and
 * only that container.
 *
 * Element.scrollIntoView scrolls every scrollable ancestor, and overflow:
 * hidden ones count. In the case modal that meant the modal shell itself:
 * the "2 to assess" jump scrolled .modal by 272px and the case header left
 * the window. This moves the panel's own scroller and nothing above it.
 *
 * `offset` is space kept clear at the top of the container - the sticky
 * section band, for a Risk assessment row.
 *
 * Resolves when the scroll has settled - at once if nothing had to move or
 * motion is reduced, otherwise on the container's `scrollend`, with a timer
 * behind it for engines that do not fire one - so a caller can time what
 * happens at the destination (a landing flash) to the arrival, not the press.
 */
export function scrollWithin(
  el: HTMLElement,
  opts: { block: 'start' | 'nearest'; offset?: number } = { block: 'start' },
): Promise<void> {
  const box = scrollerOf(el);
  if (!box) return Promise.resolve();
  const offset = opts.offset ?? 0;
  const view = box.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  const top = rect.top - view.top - offset;
  const bottom = rect.bottom - view.bottom;
  let delta: number;
  if (opts.block === 'start') delta = top;
  else if (top < 0) delta = top;
  else if (bottom > 0) delta = Math.min(bottom, top);
  else return Promise.resolve();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const target = Math.max(0, Math.min(box.scrollTop + delta, box.scrollHeight - box.clientHeight));
  if (Math.abs(target - box.scrollTop) < 1) return Promise.resolve();
  box.scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' });
  if (reduce) return Promise.resolve();
  // scrollend alone is not trusted: Chromium can fire one for the scroll
  // just interrupted. Settled means the event AND the position agree.
  return new Promise((resolve) => {
    let done = false;
    const finish = (force: boolean) => {
      if (done) return;
      if (!force && Math.abs(box.scrollTop - target) > 1) return;
      done = true;
      box.removeEventListener('scrollend', onEnd);
      resolve();
    };
    const onEnd = () => finish(false);
    box.addEventListener('scrollend', onEnd);
    setTimeout(() => finish(true), 1200);
  });
}

function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if ((y === 'auto' || y === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}
