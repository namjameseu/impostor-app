/**
 * Scroll just enough that `el` isn't hidden behind the screen's pinned action buttons
 * (e.g. after expanding a section near the bottom of a long page).
 */
export function revealAboveActions(el: HTMLElement): void {
  requestAnimationFrame(() => {
    const bar = document.querySelector('[data-screen-actions]')
    const limit = bar ? bar.getBoundingClientRect().top : window.innerHeight
    const hidden = el.getBoundingClientRect().bottom - limit + 12
    if (hidden > 0) {
      // Never scroll the top of the section out of view.
      window.scrollBy({ top: Math.min(hidden, el.getBoundingClientRect().top - 12), behavior: 'smooth' })
    }
  })
}
