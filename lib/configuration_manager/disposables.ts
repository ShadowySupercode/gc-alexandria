/**
 * Generic disposable wrapper for any type
 */

/**
 * A generic disposable wrapper that makes any type disposable by clearing its memory on dispose.
 * Implements the Disposable protocol for use with the `using` keyword.
 *
 * @template T The type to make disposable
 */
export class Disposable<T> {
  #value: T | null;
  #isDisposed = false;

  constructor(value: T) {
    this.#value = value;
  }

  /**
   * Gets the wrapped value
   * @returns The wrapped value
   * @throws Error if the resource has been disposed
   */
  get value(): T {
    if (this.#isDisposed) {
      throw new Error("Resource has been disposed and is no longer accessible");
    }
    return this.#value as T;
  }

  /**
   * Checks if the resource has been disposed
   */
  get isDisposed(): boolean {
    return this.#isDisposed;
  }

  /**
   * Manually dispose the resource
   * This can be called explicitly or automatically via the `using` keyword
   */
  dispose(): void {
    if (!this.#isDisposed) {
      this.#isDisposed = true;
      // Clear the memory reference to help with garbage collection
      this.#value = null;
    }
  }

  /**
   * Symbol.dispose implementation for automatic disposal with `using` keyword
   * This is called automatically when the `using` declaration goes out of scope
   */
  [Symbol.dispose](): void {
    this.dispose();
  }

  /**
   * Create a new disposable from a value
   * @param value The value to wrap
   * @returns A new Disposable instance
   */
  static from<T>(value: T): Disposable<T> {
    return new Disposable(value);
  }

  /**
   * Create a disposable from an async operation
   * @param asyncValue Promise that resolves to a value
   * @returns Promise that resolves to a Disposable instance
   */
  static async fromAsync<T>(asyncValue: Promise<T>): Promise<Disposable<T>> {
    const value = await asyncValue;
    return new Disposable(value);
  }
}
