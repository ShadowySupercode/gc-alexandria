export enum LazyStatus {
  Pending,
  Resolved,
  Error,
}

export class Lazy<T> {
  #value?: T;
  #resolver: () => Promise<T>;

  status: LazyStatus;

  constructor(resolver: () => Promise<T>) {
    this.#resolver = resolver;
    this.status = LazyStatus.Pending;
  }

  async value(): Promise<T | null> {
    if (!this.#value) {
      try {
        this.#value = await this.#resolver();
      } catch (error) {
        this.status = LazyStatus.Error;
        console.error(error);
        return null;
      }
    }

    this.status = LazyStatus.Resolved;
    return this.#value;
  }
}