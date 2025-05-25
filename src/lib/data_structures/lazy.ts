export enum LazyStatus {
  Pending,
  Resolved,
  Error,
}

export class Lazy<T> {
  #value: T | null = null;
  #resolver: () => Promise<T>;
  #pendingPromise: Promise<T | null> | null = null;

  status: LazyStatus;

  constructor(resolver: () => Promise<T>) {
    this.#resolver = resolver;
    this.status = LazyStatus.Pending;
  }

  /**
   * Resolves the lazy object and returns the value.
   *
   * @returns The resolved value.
   *
   * @remarks Lazy object resolution is performed as an atomic operation.  If a resolution has
   * already been requested when this function is invoked, the pending promise from the earlier
   * invocation is returned.  Thus, all calls to this function before it is resolved will depend on
   * a single resolution.
   */
  value(): Promise<T | null> {
    if (this.status === LazyStatus.Resolved) {
      return Promise.resolve(this.#value);
    }

    if (this.#pendingPromise) {
      return this.#pendingPromise;
    }

    this.#pendingPromise = this.#resolve();
    return this.#pendingPromise;
  }

  async #resolve(): Promise<T | null> {
    try {
      this.#value = await this.#resolver();
      this.status = LazyStatus.Resolved;
      return this.#value;
    } catch (error) {
      this.status = LazyStatus.Error;
      console.error(error);
      return null;
    } finally {
      this.#pendingPromise = null;
    }
  }
}
