/**
 * Generic utility function to add a timeout to any promise
 * Can be used in two ways:
 * 1. Method style: promise.withTimeout(5000)
 * 2. Function style: withTimeout(promise, 5000)
 */
export function withTimeout<T>(
  thisOrPromise: Promise<T> | number,
  timeoutMsOrPromise?: number | Promise<T>,
): Promise<T> {
  // Handle method-style call (promise.withTimeout(5000))
  if (typeof thisOrPromise === "number") {
    const timeoutMs = thisOrPromise;
    const promise = timeoutMsOrPromise as Promise<T>;
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), timeoutMs),
      ),
    ]);
  }

  // Handle function-style call (withTimeout(promise, 5000))
  const promise = thisOrPromise;
  const timeoutMs = timeoutMsOrPromise as number;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), timeoutMs),
    ),
  ]);
}

// Add the method to Promise prototype
declare global {
  interface Promise<T> {
    withTimeout(timeoutMs: number): Promise<T>;
  }
}

Promise.prototype.withTimeout = function <T>(
  this: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return withTimeout(timeoutMs, this);
};

/**
 * HTML escape a string
 */
export function escapeHtml(text: string): string {
  const htmlEscapes: { [key: string]: string } = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}

/**
 * Serial number generator
 */
let serial = 0;
export function next(): number {
  serial++;
  return serial;
}

/**
 * Async version of Array.findIndex() that runs sequentially.
 * Returns the index of the first element that satisfies the provided testing function.
 * @param array The array to search
 * @param predicate The async testing function
 * @returns A promise that resolves to the index of the first matching element, or -1 if none found
 */
export async function findIndexAsync<T>(
  array: T[],
  predicate: (element: T, index: number, array: T[]) => Promise<boolean>,
): Promise<number> {
  for (let i = 0; i < array.length; i++) {
    if (await predicate(array[i], i, array)) {
      return i;
    }
  }
  return -1;
}

// Extend Array prototype with findIndexAsync
declare global {
  interface Array<T> {
    findIndexAsync(
      predicate: (element: T, index: number, array: T[]) => Promise<boolean>,
    ): Promise<number>;
  }
}

Array.prototype.findIndexAsync = function <T>(
  this: T[],
  predicate: (element: T, index: number, array: T[]) => Promise<boolean>,
): Promise<number> {
  return findIndexAsync(this, predicate);
};

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds have elapsed
 * since the last time the debounced function was invoked.
 * @param func The function to debounce
 * @param wait The number of milliseconds to delay
 * @returns A debounced version of the function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = undefined;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
} 