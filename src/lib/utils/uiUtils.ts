/**
 * Scrolls a tab element into view
 * @param el Element ID or HTMLElement to scroll into view
 * @param wait Whether to wait a tick before scrolling
 */
export function scrollTabIntoView(el: string | HTMLElement, wait: boolean): void {
  function scrollTab() {
    const element =
      typeof el === 'string'
        ? document.querySelector(`[id^="wikitab-v0-${el}"]`)
        : el;
    if (!element) return;

    element.scrollIntoView({
      behavior: 'smooth',
      inline: 'start',
    });
  }

  if (wait) {
    setTimeout(() => {
      scrollTab();
    }, 1);
  } else {
    scrollTab();
  }
}

/**
 * Checks if an element is currently visible in the viewport
 * @param el Element ID or HTMLElement to check
 * @returns Whether the element is in viewport
 */
export function isElementInViewport(el: string | HTMLElement): boolean {
  const element =
    typeof el === 'string'
      ? document.querySelector(`[id^="wikitab-v0-${el}"]`)
      : el;
  if (!element) return false;

  const rect = element.getBoundingClientRect();

  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <=
      (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
} 